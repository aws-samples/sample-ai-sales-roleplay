"""
リアルタイムスコアリングエンジン
会話分析に基づくリアルタイムスコア計算を実装

このモジュールは、ユーザーとNPCの会話をリアルタイムで分析し、
11の異なるパラメータに基づいてスコアを計算します。
Claude 3.5 Haikuを使用して会話の文脈を考慮した分析を行い、
結果をJSON形式で返します。

Functions:
    calculate_realtime_scores: 会話データに基づいてリアルタイムスコアを計算
    parse_scoring_response: Claude 3.5 Haikuの応答をパースしてスコアを抽出
    normalize_scores: スコアを正規化して有効な範囲に収める
"""

import json
import boto3
import os
from typing import Dict, Any, List
from datetime import datetime

# AWS Lambda Powertools
from aws_lambda_powertools import Logger

# プロンプトテンプレートのインポート
from prompts.analysis_prompt import (
    REALTIME_SCORING_PROMPT_JA,
    REALTIME_SCORING_PROMPT_EN,
    GOAL_EVALUATION_PROMPT_JA,
    GOAL_EVALUATION_PROMPT_EN
)

# Powertools 初期化
logger = Logger(service="realtime-scoring-service")

# Bedrockクライアント初期化
bedrock_runtime = boto3.client('bedrock-runtime')

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
            "angerLevel": 0,
            "trustLevel": 0,
            "progressLevel": 0,
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
    # 言語に応じたプロンプトテンプレートを選択
    template = REALTIME_SCORING_PROMPT_EN if language == "en" else REALTIME_SCORING_PROMPT_JA
    
    # テンプレートに値を代入
    return template.format(
        conversation_history=conversation_history,
        user_input=user_input
    )


def invoke_bedrock_model(prompt: str) -> str:
    """
    Bedrockモデルを呼び出してスコアリング結果を取得
    
    環境変数から設定されたモデルを使用して、プロンプトに基づいた
    スコアリング結果を取得します。Converse APIを使用します。
    
    Args:
        prompt (str): スコアリング用のプロンプト
        
    Returns:
        str: モデルからの応答テキスト
        
    Raises:
        Exception: モデル呼び出し中にエラーが発生した場合
    """
    # スコアリング用のモデルIDを取得
    model_id = os.environ.get('BEDROCK_MODEL_SCORING')
    
    # Converse APIのリクエストパラメータ
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "text": prompt
                }
            ]
        }
    ]
    
    system = [
        {
            "text": """あなたは営業トレーニングの専門家です。

重要な出力ルール:
1. 必ず有効なJSON形式のみで出力してください
2. JSONの前後に説明文、コメント、コードブロック記号（```）は一切含めないでください
3. 出力は { で始まり } で終わる有効なJSONオブジェクトのみにしてください
4. マークダウン形式やその他の装飾は使用しないでください

出力例:
{"angerLevel": 5, "trustLevel": 7, "progressLevel": 3, "analysis": "分析結果"}"""
        }
    ]
    
    inference_config = {
        "maxTokens": 1000,
        "temperature": 0.1  # 正確な評価のために低い温度を設定
    }
    
    try:
        logger.info(f"Bedrockモデル呼び出し: {model_id}")
        
        # Converse APIでBedrockモデル呼び出し
        response = bedrock_runtime.converse(
            modelId=model_id,
            messages=messages,
            system=system,
            inferenceConfig=inference_config
        )
        
        # レスポンス解析
        output_message = response['output']['message']
        model_response = output_message['content'][0]['text']
        
        logger.info("Bedrockモデル呼び出し成功", extra={
            "stop_reason": response.get('stopReason'),
            "usage": response.get('usage', {})
        })
        
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
                normalized[key] = 0  # デフォルト値
        else:
            normalized[key] = 0  # デフォルト値
    
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
        
        # プロンプトの作成（外部テンプレートを使用）
        prompt = GOAL_EVALUATION_PROMPT_JA.format(
            conversation_text=conversation_text,
            goals_json=goals_json
        )
        
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
        "angerLevel": 0,
        "trustLevel": 0,
        "progressLevel": 0,
        "analysis": "スコア計算中にエラーが発生しました。デフォルト値を使用します。"
    }
