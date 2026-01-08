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
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_REFERENCE", "amazon.nova-pro-v1:0")

# Bedrockクライアント（Knowledge Base用のみ）
bedrock_agent_runtime = boto3.client("bedrock-agent-runtime")


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
            language=language
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
    language: str
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
                language=language
            )
            check_results.append(result)
        except Exception as e:
            logger.error(f"メッセージ評価エラー: {str(e)}")
            check_results.append({
                "message": user_content,
                "relatedDocument": "",
                "reviewComment": f"評価中にエラーが発生: {str(e)}",
                "related": False
            })
    
    return {
        "messages": check_results,
        "summary": {
            "totalMessages": len(user_messages),
            "checkedMessages": len(check_results),
            "relatedCount": sum(1 for r in check_results if r.get("related", False))
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
    language: str
) -> Dict[str, Any]:
    """単一メッセージの参照資料チェック"""
    
    # Knowledge Baseから関連ドキュメントを検索
    try:
        retrieve_response = bedrock_agent_runtime.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={
                "text": user_message
            },
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": 3
                }
            }
        )
        
        retrieved_docs = retrieve_response.get("retrievalResults", [])
        
    except Exception as e:
        logger.error(f"Knowledge Base検索エラー: {str(e)}")
        retrieved_docs = []
    
    # 関連ドキュメントがない場合
    if not retrieved_docs:
        return {
            "message": user_message,
            "relatedDocument": "",
            "reviewComment": "関連する参照資料が見つかりませんでした" if language == "ja" else "No related reference documents found",
            "related": False
        }
    
    # 関連ドキュメントの内容を結合
    doc_contents = []
    for doc in retrieved_docs:
        content = doc.get("content", {}).get("text", "")
        if content:
            doc_contents.append(content)
    
    related_document = "\n---\n".join(doc_contents[:2])  # 上位2件
    
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
        "related": evaluation.get("related", False)
    }


def evaluate_relevance(
    user_message: str,
    context: str,
    related_document: str,
    language: str
) -> Dict[str, Any]:
    """Strands Agentsで関連性を評価"""
    
    if language == "en":
        prompt = f"""Evaluate whether the user's statement is based on the reference document.

User's statement: "{user_message}"

Reference document:
{related_document}

Conversation context:
{context}

Respond in JSON format:
{{"related": true/false, "comment": "Brief evaluation comment"}}"""
    else:
        prompt = f"""ユーザーの発言が参照資料に基づいているか評価してください。

ユーザーの発言: "{user_message}"

参照資料:
{related_document}

会話コンテキスト:
{context}

JSON形式で回答してください:
{{"related": true/false, "comment": "簡潔な評価コメント"}}"""
    
    try:
        # BedrockModelを作成
        bedrock_model = BedrockModel(
            model_id=BEDROCK_MODEL_ID,
            temperature=0.1,
            max_tokens=256
        )
        
        # Agentを作成して呼び出し
        agent = Agent(model=bedrock_model)
        result = agent(prompt)
        
        # 応答テキストを取得
        response_text = str(result)
        
        # JSON解析
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            return json.loads(response_text[json_start:json_end])
        
    except Exception as e:
        logger.error(f"関連性評価エラー: {str(e)}")
    
    return {
        "related": False,
        "comment": "評価中にエラーが発生しました" if language == "ja" else "Error during evaluation"
    }
