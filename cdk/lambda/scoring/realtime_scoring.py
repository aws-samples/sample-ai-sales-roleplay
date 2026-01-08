"""
リアルタイムスコアリングエンジン
会話分析に基づくリアルタイムスコア計算を実装

このモジュールは、ユーザーとNPCの会話をリアルタイムで分析し、
11の異なるパラメータに基づいてスコアを計算します。
Strands Agentsを使用して会話の文脈を考慮した分析を行い、
結果をJSON形式で返します。

Functions:
    calculate_realtime_scores: 会話データに基づいてリアルタイムスコアを計算
    parse_scoring_response: LLMの応答をパースしてスコアを抽出
    normalize_scores: スコアを正規化して有効な範囲に収める
"""

import json
import os
from typing import Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field

# AWS Lambda Powertools
from aws_lambda_powertools import Logger

# Strands Agents
from strands import Agent
from strands.models import BedrockModel

# Powertools 初期化
logger = Logger(service="realtime-scoring-service")


# Pydanticモデル（Structured Output用）
class RealtimeScores(BaseModel):
    """リアルタイムスコアリング結果"""
    angerLevel: int = Field(description="怒りレベル (1-10)", ge=1, le=10)
    trustLevel: int = Field(description="信頼レベル (1-10)", ge=1, le=10)
    progressLevel: int = Field(description="進捗レベル (1-10)", ge=1, le=10)
    analysis: str = Field(description="簡潔な分析（50文字以内）", max_length=50)

def calculate_realtime_scores(
    user_input: str,
    previous_messages: List[Dict[str, Any]],
    session_id: str,
    scenario_goals: List[Dict[str, Any]] = None,
    current_goal_statuses: List[Dict[str, Any]] = None,
    language: str = "ja"
) -> Dict[str, Any]:
    """
    会話データに基づいてリアルタイムスコアを計算
    
    ユーザーの最新の発言と過去の会話履歴を分析し、3つの基本メトリクスのみを
    リアルタイムで評価します。Claude 3.5 Haikuを使用して分析を行い、
    結果をJSON形式で返します。
    
    Args:
        user_input (str): ユーザーの最新の発言
        previous_messages (List[Dict[str, Any]]): 過去の会話履歴
        session_id (str): セッションID
        scenario_goals (List[Dict[str, Any]], optional): シナリオのゴール定義
        current_goal_statuses (List[Dict[str, Any]], optional): 現在のゴール達成状況
        
    Returns:
        Dict[str, Any]: 計算されたスコア情報を含む辞書
        {
            "angerLevel": int,  # 怒りレベル (1-10)
            "trustLevel": int,  # 信頼レベル (1-10)
            "progressLevel": int,  # 進捗レベル (1-10)
            "analysis": str,  # 簡潔な分析テキスト
            "timestamp": int  # タイムスタンプ（ミリ秒）
        }
    """
    try:
        # 会話履歴をテキスト形式に整形
        conversation_text = format_conversation_history(previous_messages, language)
        
        # プロンプトの作成（3つの基本メトリクスのみ）
        prompt = create_realtime_scoring_prompt(user_input, conversation_text, language)
        
        # Claude 3.5 Haikuを使用して分析
        scoring_response = invoke_bedrock_model(prompt)
        logger.debug(f"scoring_response: {scoring_response}")
        
        # 応答をパースしてスコアを抽出
        scores = parse_realtime_scoring_response(scoring_response)
        
        # タイムスタンプを追加
        scores["timestamp"] = int(datetime.now().timestamp() * 1000)
        
        # セッションIDを追加
        scores["sessionId"] = session_id
        
        # ゴール評価を実行（ゴールデータがある場合）
        if scenario_goals and current_goal_statuses:
            updated_goal_statuses = evaluate_goals(
                user_input, 
                previous_messages, 
                scenario_goals, 
                current_goal_statuses
            )
            scores["goalStatuses"] = updated_goal_statuses
            logger.info(f"ゴール評価完了: {json.dumps(updated_goal_statuses, ensure_ascii=False)}")
        
        logger.info(f"リアルタイムスコア計算完了: {json.dumps(scores, ensure_ascii=False)}")
        
        return scores
        
    except Exception as e:
        logger.error(f"リアルタイムスコア計算エラー: {str(e)}")
        # エラー時はデフォルトの3つの基本メトリクスのみを返す
        return {
            "angerLevel": 5,
            "trustLevel": 5,
            "progressLevel": 3,
            "analysis": f"分析中にエラーが発生しました: {str(e)}",
            "sessionId": session_id,
            "timestamp": int(datetime.now().timestamp() * 1000)
        }

def format_conversation_history(messages: List[Dict[str, Any]], language: str = "ja") -> str:
    """
    会話履歴をテキスト形式に整形
    
    過去のメッセージリストを、プロンプトに含めるためのフォーマット済み
    テキストに変換します。言語パラメータに基づいて、ラベルを日本語または英語で
    表示します。
    
    Args:
        messages (List[Dict[str, Any]]): 過去のメッセージリスト
            - sender (str): メッセージの送信者 ("user" または "npc")
            - content (str): メッセージの内容
        language (str): 言語コード（"ja" または "en"）
            
    Returns:
        str: フォーマットされた会話履歴
    """
    if not messages:
        return "No conversation history." if language == "en" else "会話履歴はありません。"
    
    history_lines = []
    for msg in messages:
        if language == "en":
            sender_name = 'User (Sales Rep)' if msg.get('sender') == 'user' else 'NPC (Customer)'
        else:
            sender_name = 'ユーザー（営業担当者）' if msg.get('sender') == 'user' else 'NPC（顧客）'
        history_lines.append(f"{sender_name}: {msg.get('content', '')}")
    
    return "\n".join(history_lines)

def create_realtime_scoring_prompt(user_input: str, conversation_history: str, language: str = "ja") -> str:
    """
    リアルタイム評価用のプロンプトを作成（3つの基本メトリクスのみ）
    
    ユーザーの発言と会話履歴に基づいて、Claude 3.5 Haikuに送信する
    リアルタイム評価用のプロンプトを作成します。詳細評価ではなく、
    3つの基本メトリクスのみを評価します。言語パラメータに基づいて
    適切な言語のプロンプトを返します。
    
    Args:
        user_input (str): ユーザーの最新の発言
        conversation_history (str): フォーマット済みの会話履歴
        language (str): 言語コード（"ja"または"en"）
        
    Returns:
        str: リアルタイム評価用のプロンプト
    """
    if language == "en":
        return f"""
You are a real-time evaluation system for sales conversations. Please analyze the following conversation and evaluate three key metrics on a scale of 1-10:

## Conversation History
{conversation_history}

## User's (Sales Representative's) Latest Statement
{user_input}

## Three Key Metrics to Evaluate
1. Anger Level (angerLevel): The degree of customer dissatisfaction or irritation (1=calm, 10=very angry)
2. Trust Level (trustLevel): The degree of trust the customer has in the sales representative (1=distrust, 10=complete trust)
3. Progress Level (progressLevel): The degree of progress in the sales negotiation (1=early stage, 10=close to agreement)

## Points to Consider in Evaluation
- Context and flow of the conversation
- Customer reactions and emotional expressions
- Appropriateness of the sales representative's approach
- Achievement of sales objectives
- Changes from previous conversation history

## Output Format
Please respond in the following JSON format:
```json
{{
  "angerLevel": <integer from 1 to 10>,
  "trustLevel": <integer from 1 to 10>,
  "progressLevel": <integer from 1 to 10>,
  "analysis": "<brief analysis (within 50 characters)>"
}}
```

Note: Please respond only in the JSON format above without any additional explanation. All scores must be integer values from 1 to 10.
"""
    else:
        return f"""
あなたは営業会話のリアルタイム評価システムです。以下の会話を分析し、3つの基本メトリクスを1-10のスケールで評価してください。

## 会話履歴
{conversation_history}

## ユーザー（営業担当者）の最新の発言
{user_input}

## 評価すべき3つの基本メトリクス
1. 怒りレベル (angerLevel): 顧客の不満や苛立ちの度合い（1=穏やか、10=非常に怒っている）
2. 信頼レベル (trustLevel): 顧客が営業担当者に対して持つ信頼の度合い（1=不信、10=完全な信頼）
3. 商談進捗度 (progressLevel): 商談の進行度合い（1=初期段階、10=成約間近）

## 評価の際の考慮点
- 会話の文脈と流れ
- 顧客の反応と感情表現
- 営業担当者のアプローチの適切性
- 商談の目的達成度
- 過去の会話履歴からの変化

## 出力形式
以下のJSON形式で回答してください:
```json
{{
  "angerLevel": <1から10の整数値>,
  "trustLevel": <1から10の整数値>,
  "progressLevel": <1から10の整数値>,
  "analysis": "<簡潔な分析（50文字以内）>"
}}
```

注意：必ず上記のJSON形式で回答し、他の説明は含めないでください。すべてのスコアは1から10の整数値にしてください。
"""


def invoke_bedrock_model(prompt: str) -> str:
    """
    Bedrockモデルを呼び出してスコアリング結果を取得
    
    Strands Agentsを使用して、プロンプトに基づいた
    スコアリング結果を取得します。
    
    Args:
        prompt (str): スコアリング用のプロンプト
        
    Returns:
        str: モデルからの応答テキスト
        
    Raises:
        Exception: モデル呼び出し中にエラーが発生した場合
    """
    # スコアリング用のモデルIDを取得
    model_id = os.environ.get('BEDROCK_MODEL_SCORING')
    
    system_prompt = """あなたは営業トレーニングの専門家です。

重要な出力ルール:
1. 必ず有効なJSON形式のみで出力してください
2. JSONの前後に説明文、コメント、コードブロック記号（```）は一切含めないでください
3. 出力は { で始まり } で終わる有効なJSONオブジェクトのみにしてください
4. マークダウン形式やその他の装飾は使用しないでください

出力例:
{"angerLevel": 5, "trustLevel": 7, "progressLevel": 3, "analysis": "分析結果"}"""
    
    try:
        logger.info(f"Bedrockモデル呼び出し（Strands Agents使用）: {model_id}")
        
        # BedrockModelを作成
        bedrock_model = BedrockModel(
            model_id=model_id,
            temperature=0.1,  # 正確な評価のために低い温度を設定
            max_tokens=1000
        )
        
        # Agentを作成して呼び出し
        agent = Agent(
            model=bedrock_model,
            system_prompt=system_prompt
        )
        result = agent(prompt)
        
        # 応答テキストを取得
        model_response = str(result)
        
        logger.info("Bedrockモデル呼び出し成功（Strands Agents）")
        
        return model_response
        
    except Exception as e:
        logger.error(f"Bedrockモデル呼び出しエラー: {str(e)}")
        raise

def parse_realtime_scoring_response(response: str) -> Dict[str, Any]:
    """
    Claude 3.5 Haikuのリアルタイム評価応答をパースして3つの基本メトリクスを抽出
    
    モデルからの応答テキストをパースし、3つの基本メトリクス情報を抽出します。
    JSON形式でない場合やパースエラーが発生した場合は、
    デフォルト値を返します。
    
    Args:
        response (str): モデルからの応答テキスト
        
    Returns:
        Dict[str, Any]: パースされたスコア情報（3つの基本メトリクスのみ）
    """
    try:
        # 応答からJSONを抽出
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        
        if json_start >= 0 and json_end > json_start:
            json_str = response[json_start:json_end]
            scores = json.loads(json_str)
            
            # 3つの基本メトリクスのみを正規化
            normalized_scores = normalize_realtime_scores(scores)
            
            return normalized_scores
        else:
            logger.warning(f"JSON形式の応答が見つかりません: {response}")
            return create_default_realtime_scores()
            
    except json.JSONDecodeError as e:
        logger.error(f"JSON解析エラー: {str(e)}, 応答: {response}")
        return create_default_realtime_scores()
    except Exception as e:
        logger.error(f"応答パースエラー: {str(e)}")
        return create_default_realtime_scores()


def normalize_realtime_scores(scores: Dict[str, Any]) -> Dict[str, Any]:
    """
    リアルタイム評価のスコアを正規化して有効な範囲に収める（3つの基本メトリクスのみ）
    
    各スコアが1-10の範囲内の整数値であることを確認します。
    範囲外の値は適切な範囲に収められます。
    
    Args:
        scores (Dict[str, Any]): 正規化前のスコア情報
        
    Returns:
        Dict[str, Any]: 正規化後のスコア情報（3つの基本メトリクスのみ）
    """
    # リアルタイム評価では3つの基本メトリクスのみ
    realtime_score_keys = ["angerLevel", "trustLevel", "progressLevel"]
    
    normalized = {}
    
    # スコアの正規化
    for key in realtime_score_keys:
        if key in scores:
            try:
                value = int(float(scores[key]))
                normalized[key] = max(1, min(10, value))
            except (ValueError, TypeError):
                normalized[key] = 5  # デフォルト値
        else:
            normalized[key] = 5  # デフォルト値
    
    # 分析テキストの追加
    if "analysis" in scores and isinstance(scores["analysis"], str):
        normalized["analysis"] = scores["analysis"][:50]  # 50文字に制限
    else:
        normalized["analysis"] = "分析情報なし"
    
    return normalized

def evaluate_goals(
    user_input: str,
    previous_messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]],
    current_goal_statuses: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    ゴールの達成状況を評価する
    
    ユーザーの入力と会話履歴に基づいて、各ゴールの達成状況を評価します。
    Claude 3.5 Haikuを使用して、各ゴールの進捗度を評価します。
    既に達成済みのゴールは再評価されません。
    
    Args:
        user_input (str): ユーザーの最新の発言
        previous_messages (List[Dict[str, Any]]): 過去の会話履歴
        scenario_goals (List[Dict[str, Any]]): シナリオのゴール定義
        current_goal_statuses (List[Dict[str, Any]]): 現在のゴール達成状況
        
    Returns:
        List[Dict[str, Any]]: 更新されたゴール達成状況
    """
    try:
        # 現在のメッセージを作成（最新のユーザー入力）
        current_message = {
            "sender": "user",
            "content": user_input
        }
        
        # 会話履歴をテキスト形式に整形
        conversation_text = format_conversation_history(previous_messages + [current_message])
        
        # 達成済みでないゴールを取得
        unachieved_goals = []
        unachieved_goal_statuses = []
        
        for goal_status in current_goal_statuses:
            # 既に達成済みのゴールはスキップ
            if goal_status.get("achieved", False):
                continue
                
            # 対応するゴール定義を検索
            goal_id = goal_status.get("goalId")
            goal = next((g for g in scenario_goals if g.get("id") == goal_id), None)
            
            if goal:
                unachieved_goals.append(goal)
                unachieved_goal_statuses.append(goal_status)
        
        # 達成済みのゴールを含む更新後のゴールステータスリスト
        updated_goal_statuses = current_goal_statuses.copy()
        
        # 達成済みでないゴールがない場合はそのまま返す
        if not unachieved_goals:
            return updated_goal_statuses
        
        # Bedrockを使用してゴール評価を行う
        goal_evaluation = evaluate_goals_with_bedrock(
            conversation_text,
            unachieved_goals,
            unachieved_goal_statuses
        )
        
        # 評価結果を反映
        for evaluated_goal in goal_evaluation:
            goal_id = evaluated_goal.get("goalId")
            progress = evaluated_goal.get("progress", 0)
            achieved = evaluated_goal.get("achieved", False)
            
            # 更新対象のゴールステータスを探す
            for i, status in enumerate(updated_goal_statuses):
                if status.get("goalId") == goal_id:
                    # 達成状態を更新
                    updated_goal_statuses[i] = {
                        "goalId": goal_id,
                        "progress": progress,
                        "achieved": achieved,
                        "achievedAt": int(datetime.now().timestamp() * 1000) if achieved else None
                    }
                    break
        
        return updated_goal_statuses
    except Exception as e:
        logger.error(f"ゴール評価エラー: {str(e)}")
        # エラー時は元のゴールステータスをそのまま返す
        return current_goal_statuses

def evaluate_goals_with_bedrock(
    conversation_text: str,
    goals: List[Dict[str, Any]],
    current_goal_statuses: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Bedrockを使用してゴールの達成状況を評価する
    
    Args:
        conversation_text (str): フォーマット済みの会話履歴
        goals (List[Dict[str, Any]]): 評価対象のゴールリスト
        current_goal_statuses (List[Dict[str, Any]]): 現在のゴール達成状況
        
    Returns:
        List[Dict[str, Any]]: 更新されたゴール達成状況
    """
    try:
        # ゴール情報をJSON形式に整形
        goals_json = json.dumps([{
            "id": goal.get("id"),
            "description": goal.get("description"),
            "criteria": goal.get("criteria", []),
            "isRequired": goal.get("isRequired", False),
            "priority": goal.get("priority", 3),
            "currentProgress": next(
                (status.get("progress", 0) for status in current_goal_statuses 
                 if status.get("goalId") == goal.get("id")), 
                0
            )
        } for goal in goals], ensure_ascii=False)
        
        # プロンプトの作成
        prompt = f"""
あなたは営業会話のゴール達成度を評価するシステムです。以下の会話とゴール情報を分析し、各ゴールの進捗度と達成状況を評価してください。

## 会話履歴
{conversation_text}

## 評価対象のゴール
{goals_json}

## 評価のポイント
1. 各ゴールの進捗度を0-100%で評価してください
2. 進捗度が100%に達した場合、ゴールは達成されたと判断します
3. 不適切な発言や否定的な反応がある場合は、進捗度を下げるか現状維持してください
4. ゴールの優先度や必須性を考慮して評価してください

## 出力形式
以下のJSON形式で回答してください：
```json
[
  {{
    "goalId": "<ゴールID>",
    "progress": <0-100の整数値>,
    "achieved": <trueまたはfalse>,
    "reason": "<評価理由の簡潔な説明>"
  }},
  ...
]
```

注意：必ずJSON形式のみで回答し、他の説明は含めないでください。
"""
        
        # Bedrockモデル呼び出し
        response = invoke_bedrock_model(prompt)
        
        # 応答をパース
        json_start = response.find('[') 
        json_end = response.rfind(']') + 1
        
        if json_start >= 0 and json_end > json_start:
            json_str = response[json_start:json_end]
            goal_evaluations = json.loads(json_str)
            
            # 評価結果を整形
            result = []
            for eval_item in goal_evaluations:
                goal_id = eval_item.get("goalId")
                progress = max(0, min(100, int(eval_item.get("progress", 0))))
                achieved = eval_item.get("achieved", False)
                
                result.append({
                    "goalId": goal_id,
                    "progress": progress,
                    "achieved": achieved
                })
            
            logger.info(f"ゴール評価結果: {json.dumps(result, ensure_ascii=False)}")
            return result
        else:
            logger.warning(f"JSON形式の応答が見つかりません: {response}")
            return current_goal_statuses
    except Exception as e:
        logger.error(f"Bedrockによるゴール評価エラー: {str(e)}")
        return current_goal_statuses

def create_default_realtime_scores() -> Dict[str, Any]:
    """
    デフォルトのリアルタイムスコア情報を作成（3つの基本メトリクスのみ）
    
    エラー時やパース失敗時に返すデフォルトのスコア情報を作成します。
    
    Returns:
        Dict[str, Any]: デフォルトのリアルタイムスコア情報
    """
    return {
        "angerLevel": 5,
        "trustLevel": 5,
        "progressLevel": 3,
        "analysis": "スコア計算中にエラーが発生しました。デフォルト値を使用します。"
    }
