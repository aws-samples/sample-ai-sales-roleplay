"""
参照資料評価Lambda関数

Knowledge Baseを使用してユーザーの発言が参照資料に基づいているか評価します。
Strands Agentsを使用してLLM呼び出しを行います。
"""

import os
import json
import boto3
from aws_lambda_powertools import Logger
from typing import Dict, Any, List, Optional

# Strands Agents
from strands import Agent
from strands.models import BedrockModel

# ロガー設定
logger = Logger(service="session-analysis-reference")

# 環境変数
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_REFERENCE", "global.anthropic.claude-sonnet-4-5-20250929-v1:0")

# 起動時に環境変数をログ出力
logger.info("Lambda初期化", extra={
    "knowledge_base_id": KNOWLEDGE_BASE_ID,
    "bedrock_model_id": BEDROCK_MODEL_ID,
    "knowledge_base_configured": bool(KNOWLEDGE_BASE_ID)
})

# Bedrockクライアント（Knowledge Base用のみ）
bedrock_agent_runtime = boto3.client("bedrock-agent-runtime")


def extract_metadata_scenario_id(scenario_info: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    シナリオ情報のpdfFilesからメタデータ用のscenarioIdを抽出する。
    
    pdfFilesのkeyは "scenarios/{scenarioId}/filename.pdf" の形式。
    メタデータファイルのscenarioIdはこのパスのフォルダ名と一致する。
    """
    if not scenario_info:
        return None
    
    pdf_files = scenario_info.get("pdfFiles", [])
    if not pdf_files:
        return None
    
    # 最初のPDFファイルのkeyからscenarioIdを抽出
    first_key = pdf_files[0].get("key", "")
    # "scenarios/AWS/filename.pdf" → "AWS"
    parts = first_key.split("/")
    if len(parts) >= 3 and parts[0] == "scenarios":
        metadata_scenario_id = parts[1]
        logger.info("メタデータscenarioId抽出", extra={
            "pdf_key": first_key,
            "metadata_scenario_id": metadata_scenario_id
        })
        return metadata_scenario_id
    
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    参照資料評価ハンドラー
    
    Args:
        event: Step Functions入力
            
    Returns:
        参照資料評価結果を追加したイベントデータ
    """
    try:
        session_id = event.get("sessionId")
        has_knowledge_base = event.get("hasKnowledgeBase", False)
        messages = event.get("messages", [])
        scenario_id = event.get("scenarioId")
        scenario_info = event.get("scenarioInfo")
        language = event.get("language", "ja")
        
        logger.info("参照資料評価開始", extra={
            "session_id": session_id,
            "has_knowledge_base": has_knowledge_base,
            "messages_count": len(messages)
        })
        
        # Knowledge Baseがない場合はスキップ
        if not has_knowledge_base or not KNOWLEDGE_BASE_ID:
            logger.info("Knowledge Baseなし、スキップ")
            return {
                **event,
                "referenceCheck": None,
                "referenceChecked": False,
                "referenceSkipReason": "no_knowledge_base"
            }
        
        # メタデータ用のscenarioIdを抽出（フィルタリングに使用）
        metadata_scenario_id = extract_metadata_scenario_id(scenario_info)
        
        # ユーザーメッセージを抽出
        user_messages = [
            msg for msg in messages 
            if msg.get("sender") == "user" and msg.get("content")
        ]
        
        if not user_messages:
            logger.info("ユーザーメッセージなし、スキップ")
            return {
                **event,
                "referenceCheck": None,
                "referenceChecked": False,
                "referenceSkipReason": "no_user_messages"
            }
        
        # 参照資料評価を実行
        reference_check = evaluate_references(
            session_id=session_id,
            user_messages=user_messages,
            all_messages=messages,
            scenario_id=scenario_id,
            language=language,
            metadata_scenario_id=metadata_scenario_id
        )
        
        logger.info("参照資料評価完了", extra={
            "session_id": session_id,
            "checked_messages": len(reference_check.get("messages", []))
        })
        
        return {
            **event,
            "referenceCheck": reference_check,
            "referenceChecked": True
        }
        
    except Exception as e:
        logger.exception("参照資料評価エラー", extra={"error": str(e)})
        # エラー時も処理を継続
        return {
            **event,
            "referenceCheck": None,
            "referenceChecked": False,
            "referenceError": str(e)
        }


def evaluate_references(
    session_id: str,
    user_messages: List[Dict[str, Any]],
    all_messages: List[Dict[str, Any]],
    scenario_id: str,
    language: str,
    metadata_scenario_id: Optional[str] = None
) -> Dict[str, Any]:
    """参照資料に基づく評価を実行"""
    
    # 全会話コンテキストを構築
    context = build_conversation_context(all_messages, language)
    
    check_results = []
    
    for i, msg in enumerate(user_messages):
        user_content = msg.get("content", "")
        if not user_content.strip():
            continue
            
        logger.debug(f"メッセージ {i+1}/{len(user_messages)} を評価中")
        
        try:
            result = check_single_message(
                user_message=user_content,
                context=context,
                scenario_id=scenario_id,
                language=language,
                metadata_scenario_id=metadata_scenario_id
            )
            check_results.append(result)
        except Exception as e:
            logger.error(f"メッセージ評価エラー: {str(e)}")
            # 評価不能（エラー）は「問題あり」ではなく「対象外」として扱う
            # （誤検知を避けるため、評価できなかった発言を問題扱いしない）
            check_results.append({
                "message": user_content,
                "relatedDocument": "",
                "reviewComment": f"評価中にエラーが発生: {str(e)}",
                "evaluation": "not_applicable"
            })
    
    return {
        "messages": check_results,
        "summary": {
            "totalMessages": len(user_messages),
            "checkedMessages": len(check_results),
            # 資料に基づいた適切な発言数
            "appropriateCount": sum(1 for r in check_results if r.get("evaluation") == "appropriate"),
            # 評価対象外の発言数（挨拶・一般的な進行など、資料参照が不要な発言）
            "notApplicableCount": sum(1 for r in check_results if r.get("evaluation") == "not_applicable"),
            # 資料と矛盾する/誤った情報を含む発言数（問題ありの件数）
            "issueCount": sum(1 for r in check_results if r.get("evaluation") == "issue")
        }
    }


def build_conversation_context(messages: List[Dict[str, Any]], language: str) -> str:
    """会話コンテキストを構築"""
    if language == "en":
        user_label = "User"
        npc_label = "NPC"
    else:
        user_label = "ユーザー"
        npc_label = "NPC"
    
    lines = []
    for msg in messages:
        sender = msg.get("sender", "")
        content = msg.get("content", "")
        if sender and content:
            label = user_label if sender == "user" else npc_label
            lines.append(f'{label}: "{content}"')
    
    return "\n".join(lines)


def check_single_message(
    user_message: str,
    context: str,
    scenario_id: str,
    language: str,
    metadata_scenario_id: Optional[str] = None
) -> Dict[str, Any]:
    """単一メッセージの参照資料チェック"""
    
    logger.info("Knowledge Base検索開始", extra={
        "knowledge_base_id": KNOWLEDGE_BASE_ID,
        "user_message": user_message[:100],
        "scenario_id": scenario_id,
        "metadata_scenario_id": metadata_scenario_id
    })
    
    # Knowledge Baseから関連ドキュメントを検索
    try:
        # 検索設定を構築
        vector_search_config: Dict[str, Any] = {
            "numberOfResults": 3
        }
        
        # メタデータscenarioIdがある場合はフィルタを追加
        if metadata_scenario_id:
            vector_search_config["filter"] = {
                "equals": {
                    "key": "scenarioId",
                    "value": metadata_scenario_id
                }
            }
            logger.info("メタデータフィルタ適用", extra={
                "filter_scenario_id": metadata_scenario_id
            })
        
        retrieve_response = bedrock_agent_runtime.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={
                "text": user_message
            },
            retrievalConfiguration={
                "vectorSearchConfiguration": vector_search_config
            }
        )
        
        retrieved_docs = retrieve_response.get("retrievalResults", [])
        
        logger.info("Knowledge Base検索完了", extra={
            "knowledge_base_id": KNOWLEDGE_BASE_ID,
            "retrieved_docs_count": len(retrieved_docs),
            "has_results": len(retrieved_docs) > 0
        })
        
        # 検索結果の詳細をログ出力
        for i, doc in enumerate(retrieved_docs):
            score = doc.get("score", 0)
            content_preview = doc.get("content", {}).get("text", "")[:100]
            location = doc.get("location", {})
            logger.info(f"検索結果 {i+1}", extra={
                "score": score,
                "content_preview": content_preview,
                "location": location
            })
        
    except Exception as e:
        logger.exception("Knowledge Base検索エラー", extra={
            "knowledge_base_id": KNOWLEDGE_BASE_ID,
            "error_type": type(e).__name__,
            "error": str(e)
        })
        retrieved_docs = []
    
    # 関連ドキュメントがない場合
    if not retrieved_docs:
        logger.warning("関連ドキュメントなし", extra={
            "knowledge_base_id": KNOWLEDGE_BASE_ID,
            "user_message": user_message[:100]
        })
        # 関連資料が見つからない発言は「問題あり」ではなく「対象外」として扱う
        # （挨拶や一般的な進行など、そもそも資料参照が不要な発言を問題扱いしないため）
        return {
            "message": user_message,
            "relatedDocument": "",
            "reviewComment": "この発言に関連する参照資料はありませんでした（評価対象外）" if language == "ja" else "No reference document is related to this statement (not applicable)",
            "evaluation": "not_applicable"
        }
    
    # 関連ドキュメントの内容を結合
    doc_contents = []
    for doc in retrieved_docs:
        content = doc.get("content", {}).get("text", "")
        if content:
            doc_contents.append(content)
    
    related_document = "\n---\n".join(doc_contents[:2])  # 上位2件
    
    logger.info("関連ドキュメント取得完了", extra={
        "doc_count": len(doc_contents),
        "total_length": len(related_document)
    })
    
    # Bedrockで関連性を評価
    evaluation = evaluate_relevance(
        user_message=user_message,
        context=context,
        related_document=related_document,
        language=language
    )
    
    return {
        "message": user_message,
        "relatedDocument": related_document[:500],  # 長すぎる場合は切り詰め
        "reviewComment": evaluation.get("comment", ""),
        "evaluation": evaluation.get("evaluation", "not_applicable")
    }


def evaluate_relevance(
    user_message: str,
    context: str,
    related_document: str,
    language: str
) -> Dict[str, Any]:
    """
    Strands Agentsで発言を3分類で評価する

    評価区分:
      - "appropriate"     : 発言が参照資料の内容に沿っており、正確な情報提供ができている
      - "issue"           : 発言が参照資料の内容と矛盾している、または誤った情報を含んでいる
      - "not_applicable"  : 挨拶・一般的な進行・意思表示など、参照資料の正誤を問えない発言

    重要: 参照資料に記載がないだけの一般的な発言は "issue" ではなく "not_applicable" とする。
    "issue" は資料と明確に矛盾する、または事実誤認がある場合に限定する。
    """
    
    if language == "en":
        system_prompt = (
            "You are an expert at evaluating whether a sales representative's statement "
            "is consistent with reference documents. Always respond in valid JSON format. "
            "Only flag a statement as an issue when it clearly contradicts the reference "
            "document or contains factual errors. Greetings, general remarks, or statements "
            "of intent that the document neither supports nor contradicts must be classified "
            "as 'not_applicable', NOT as an issue."
        )
        prompt = f"""Classify the user's statement into exactly one of three categories based on the reference document.

Categories:
- "appropriate": The statement is consistent with and supported by the reference document (accurate information).
- "issue": The statement clearly contradicts the reference document or contains factual errors.
- "not_applicable": The statement is a greeting, general remark, or statement of intent that the document neither supports nor contradicts. The absence of related information in the document alone means "not_applicable", NOT "issue".

User's statement: "{user_message}"

Reference document:
{related_document}

Conversation context:
{context}

Respond in JSON format:
{{"evaluation": "appropriate" | "issue" | "not_applicable", "comment": "Brief evaluation comment explaining the classification"}}"""
    else:
        system_prompt = (
            "あなたは営業担当者の発言が参照資料の内容と整合しているかを評価する専門家です。"
            "必ず有効なJSON形式で回答してください。"
            "発言が参照資料と明確に矛盾している、または事実誤認を含む場合のみ「問題あり(issue)」と判定してください。"
            "挨拶・一般的な進行・意思表示など、資料が肯定も否定もしない発言は「問題あり」ではなく"
            "「対象外(not_applicable)」に分類してください。"
        )
        prompt = f"""ユーザーの発言を、参照資料の内容に基づき次の3区分のいずれか1つに分類してください。

区分:
- "appropriate"（適切）: 発言が参照資料の内容に沿っており、正確な情報提供ができている。
- "issue"（問題あり）: 発言が参照資料の内容と明確に矛盾している、または誤った情報を含んでいる。
- "not_applicable"（対象外）: 挨拶・一般的な進行・意思表示など、参照資料の正誤を問えない発言。資料に関連記載が「ないだけ」の場合は "issue" ではなく "not_applicable" とすること。

ユーザーの発言: "{user_message}"

参照資料:
{related_document}

会話コンテキスト:
{context}

JSON形式で回答してください:
{{"evaluation": "appropriate" | "issue" | "not_applicable", "comment": "分類理由を含む簡潔な評価コメント"}}"""
    
    try:
        logger.info("関連性評価開始", extra={
            "model_id": BEDROCK_MODEL_ID,
            "message_length": len(user_message),
            "document_length": len(related_document)
        })
        
        # BedrockModelを作成
        bedrock_model = BedrockModel(
            model_id=BEDROCK_MODEL_ID,
            temperature=0.1,
            max_tokens=256
        )
        
        # Agentを作成して呼び出し（system_promptを追加）
        agent = Agent(
            model=bedrock_model,
            system_prompt=system_prompt
        )
        result = agent(prompt)
        
        # 応答テキストを取得
        response_text = str(result)
        logger.debug("Bedrock応答", extra={"response": response_text[:500]})
        
        # JSON解析
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            parsed_result = json.loads(response_text[json_start:json_end])

            # evaluationの値を検証（想定外の値は対象外に丸める）
            evaluation_value = parsed_result.get("evaluation")
            if evaluation_value not in ("appropriate", "issue", "not_applicable"):
                logger.warning("想定外のevaluation値", extra={"evaluation": evaluation_value})
                evaluation_value = "not_applicable"

            logger.info("関連性評価完了", extra={"evaluation": evaluation_value})
            return {
                "evaluation": evaluation_value,
                "comment": parsed_result.get("comment", "")
            }
        
        logger.warning("JSON解析失敗: JSONが見つかりません", extra={"response": response_text[:200]})
        
    except json.JSONDecodeError as e:
        logger.error("JSON解析エラー", extra={
            "error": str(e),
            "response_snippet": response_text[:200] if 'response_text' in locals() else "N/A"
        })
    except Exception as e:
        logger.exception("関連性評価エラー", extra={
            "error_type": type(e).__name__,
            "error": str(e),
            "model_id": BEDROCK_MODEL_ID
        })
    
    # 評価できなかった場合は「問題あり」ではなく「対象外」として扱う（誤検知防止）
    return {
        "evaluation": "not_applicable",
        "comment": "評価中にエラーが発生しました" if language == "ja" else "Error during evaluation"
    }
