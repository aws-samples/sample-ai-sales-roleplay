"""
結果保存Lambda関数

AI分析完了後の結果をDynamoDBに保存し、
フィードバックを生成して、進行中フラグを削除して処理を完了します。
"""

import os
import boto3
import boto3.dynamodb.conditions
import time
from typing import Dict, Any, List
from datetime import datetime
from decimal import Decimal

from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

from prompts import build_feedback_prompt, get_structured_output_prompt, create_default_feedback

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")
SCENARIOS_TABLE = os.environ.get("SCENARIOS_TABLE")

# ロガー
logger = Logger(service="audioAnalysis-save")

# AWSクライアント
dynamodb = boto3.resource("dynamodb")

def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    結果保存Lambda関数のエントリポイント
    
    Step Functions入力:
    {
        "success": true,
        "sessionId": "session456",
        "userId": "user123",
        "scenarioId": "scenario123",
        "language": "ja",
        "audioAnalysisResult": {
            "speakers": [...],
            "segments": [...],
            "summary": {...},
            "language_detected": "ja"
        },
        "analysisCompletedTime": "2023-12-01T10:35:00Z",
        ...
    }
    
    Step Functions出力:
    {
        "success": true,
        "sessionId": "session456",
        "resultsSaved": true,
        "completedTime": "2023-12-01T10:36:00Z"
    }
    """
    try:
        logger.info("結果保存処理を開始", extra={"event": event})
        
        # 入力パラメータを取得
        session_id = event.get("sessionId")
        user_id = event.get("userId")
        scenario_id = event.get("scenarioId")
        language = event.get("language", "ja")
        audio_analysis_result = event.get("audioAnalysisResult")
        
        # 必須パラメータの検証
        if not all([session_id, user_id, scenario_id, audio_analysis_result]):
            raise ValueError("sessionId, userId, scenarioId, audioAnalysisResultが必要です")
        
        # 音声分析結果をDynamoDBに保存
        save_analysis_result(
            session_id=session_id,
            user_id=user_id,
            scenario_id=scenario_id,
            language=language,
            analysis_result=audio_analysis_result
        )
        
        # シナリオ情報を取得
        scenario_goals = []
        try:
            if not SCENARIOS_TABLE:
                raise ValueError("SCENARIOS_TABLE環境変数が設定されていません")
            scenarios_table = dynamodb.Table(SCENARIOS_TABLE)
            scenario_response = scenarios_table.get_item(Key={'scenarioId': scenario_id})
            scenario_data = scenario_response.get('Item')
            if scenario_data:
                scenario_goals = scenario_data.get('goals', [])
                logger.info("シナリオ情報を取得", extra={
                    "scenario_id": scenario_id,
                    "goals_count": len(scenario_goals)
                })
        except Exception as e:
            logger.warning("シナリオ情報の取得に失敗", extra={
                "error": str(e),
                "scenario_id": scenario_id
            })
        
        # 音声分析データから会話メッセージを構築
        messages = build_messages_from_audio_analysis(audio_analysis_result, session_id)
        
        # メトリクスを計算
        final_metrics = calculate_final_metrics_from_audio(messages, scenario_goals, language)
        
        # フィードバックを生成
        feedback_data = generate_feedback_for_audio_analysis(
            session_id=session_id,
            metrics=final_metrics,
            messages=messages,
            scenario_goals=scenario_goals,
            language=language
        )
        
        # フィードバックをDynamoDBに保存
        save_feedback_to_dynamodb(
            session_id=session_id,
            feedback_data=feedback_data,
            final_metrics=final_metrics,
            messages=messages,
            scenario_goals=scenario_goals
        )
        
        # 進行中フラグを削除
        delete_analysis_progress_flag(session_id)
        
        # Step Functions完了出力
        output = {
            "success": True,
            "sessionId": session_id,
            "resultsSaved": True,
            "feedbackGenerated": True,
            "completedTime": datetime.utcnow().isoformat() + "Z"
        }
        
        logger.info("結果保存処理完了", extra={
            "session_id": session_id,
            "user_id": user_id,
            "scenario_id": scenario_id,
            "overall_score": feedback_data.get("scores", {}).get("overall")
        })
        
        return output
        
    except Exception as e:
        logger.exception("結果保存処理エラー", extra={"error": str(e)})
        
        # エラー時も進行中フラグを削除
        if event.get("sessionId"):
            delete_analysis_progress_flag(event["sessionId"])
        
        # Step Functionsにエラーを伝える
        return {
            "success": False,
            "error": str(e),
            "sessionId": event.get("sessionId"),
            "errorType": "SaveResultsError"
        }

def convert_float_to_decimal(obj):
    """
    Float型をDynamoDB互換のDecimal型に変換する
    
    Args:
        obj: 変換対象のオブジェクト
        
    Returns:
        DynamoDB互換なオブジェクト
    """
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {key: convert_float_to_decimal(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_float_to_decimal(item) for item in obj]
    else:
        return obj

def save_analysis_result(session_id: str, user_id: str, scenario_id: str, language: str, analysis_result: Dict[str, Any]):
    """
    音声分析結果をDynamoDBに保存する

    Args:
      session_id: セッションID
      user_id: ユーザーID
      scenario_id: シナリオID
      language: 言語
      analysis_result: 分析結果
    """
    logger.debug(f"音声分析結果を保存: sessionId={session_id}")
    
    # 環境変数の検証
    if not SESSION_FEEDBACK_TABLE:
        raise ValueError("SESSION_FEEDBACK_TABLE環境変数が設定されていません")

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    # TTL設定（180日後に削除）
    expire_at = int(time.time()) + (180 * 24 * 60 * 60)
    current_time = datetime.utcnow().isoformat() + "Z"

    try:
        # Float型をDecimal型に変換（DynamoDB要求）
        converted_analysis_result = convert_float_to_decimal(analysis_result)
        
        item = {
            "sessionId": session_id,
            "createdAt": current_time,
            "dataType": "audio-analysis-result",
            "expireAt": expire_at,
            "userId": user_id,
            "scenarioId": scenario_id,
            "language": language,
            "audioAnalysisData": converted_analysis_result,
            "timestamp": int(time.time()),
        }

        feedback_table.put_item(Item=item)
        logger.info(f"音声分析結果を保存しました: sessionId={session_id}, createdAt={current_time}")

    except Exception as e:
        logger.error(f"音声分析結果の保存中にエラー: {str(e)}")
        raise e

def build_messages_from_audio_analysis(audio_analysis_result: Dict[str, Any], session_id: str) -> List[Dict[str, Any]]:
    """
    音声分析結果から会話メッセージを構築
    
    Args:
        audio_analysis_result: 音声分析結果
        session_id: セッションID
        
    Returns:
        メッセージリスト
    """
    messages = []
    segments = audio_analysis_result.get("segments", [])
    created_at = datetime.utcnow().isoformat() + "Z"  # ISO形式の文字列
    
    for i, segment in enumerate(segments):
        sender = "user" if segment.get("role") == "customer" else "npc"
        messages.append({
            "messageId": f"audio-segment-{i+1:03d}",
            "sessionId": session_id,
            "sender": sender,
            "content": segment.get("text", ""),
            "timestamp": created_at,  # 文字列として保存
        })
    
    return messages


def calculate_final_metrics_from_audio(messages: List[Dict[str, Any]], scenario_goals: List[Dict[str, Any]], language: str) -> Dict[str, Any]:
    """
    音声分析メッセージから最終メトリクスを計算
    
    Args:
        messages: メッセージリスト
        scenario_goals: シナリオゴール
        language: 言語
        
    Returns:
        最終メトリクス
    """
    # 簡易的なメトリクス計算（実際のスコアリングロジックは省略）
    return {
        "angerLevel": 5,
        "trustLevel": 5,
        "progressLevel": 5,
        "analysis": "音声分析から生成されたメトリクス"
    }


def generate_feedback_for_audio_analysis(
    session_id: str,
    metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]],
    language: str
) -> Dict[str, Any]:
    """
    音声分析用のフィードバックを生成
    
    Strands Agentsを使用してフィードバックを生成します。
    sessionAnalysis/feedback_handler.pyと同じ実装を使用。
    
    Args:
        session_id: セッションID
        metrics: メトリクス
        messages: メッセージリスト
        scenario_goals: シナリオゴール
        language: 言語
        
    Returns:
        フィードバックデータ
    """
    try:
        from strands import Agent
        from strands.models import BedrockModel
        from botocore.config import Config as BotocoreConfig
        import random
        
        # Bedrockモデル設定
        BEDROCK_MODEL_FEEDBACK = os.environ.get("BEDROCK_MODEL_FEEDBACK", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
        REGION = os.environ.get("AWS_REGION", "us-west-2")
        
        boto_config = BotocoreConfig(
            retries={
                "max_attempts": 10,
                "mode": "adaptive",
                "total_max_attempts": 10
            },
            connect_timeout=10,
            read_timeout=600,
        )
        
        bedrock_model = BedrockModel(
            model_id=BEDROCK_MODEL_FEEDBACK,
            region_name=REGION,
            boto_client_config=boto_config,
        )
        
        # プロンプト作成
        prompt = build_feedback_prompt(metrics, messages, scenario_goals, language)
        
        logger.info("Strands Agentでフィードバック生成を実行", extra={
            "model_id": BEDROCK_MODEL_FEEDBACK,
            "language": language,
            "messages_count": len(messages),
            "session_id": session_id
        })
        
        # エージェント初期化
        agent = Agent(
            tools=[],
            model=bedrock_model,
        )
        
        # プロンプト実行
        agent(prompt)
        
        # 構造化出力を取得
        from feedback_types import FeedbackOutput
        structured_prompt = get_structured_output_prompt(language)
        result: FeedbackOutput = agent.structured_output(
            FeedbackOutput,
            structured_prompt,
        )
        
        logger.info("Strands Agent分析完了", extra={
            "overall_score": result.scores.overall,
            "session_id": session_id
        })
        
        return result.model_dump()
        
    except Exception as e:
        logger.error("フィードバック生成エラー", extra={
            "error": str(e),
            "session_id": session_id
        })
        # エラー時はデフォルトフィードバックを返す
        return create_default_feedback(language)


def save_feedback_to_dynamodb(
    session_id: str,
    feedback_data: Dict[str, Any],
    final_metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]]
) -> None:
    """
    フィードバックをDynamoDBに保存
    
    Args:
        session_id: セッションID
        feedback_data: フィードバックデータ
        final_metrics: 最終メトリクス
        messages: メッセージリスト
        scenario_goals: シナリオゴール
    """
    try:
        # 環境変数の検証
        if not SESSION_FEEDBACK_TABLE:
            raise ValueError("SESSION_FEEDBACK_TABLE環境変数が設定されていません")
            
        feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
        current_time = datetime.utcnow().isoformat() + "Z"
        expire_at = int(time.time()) + (180 * 24 * 60 * 60)  # 180日後
        
        # ゴール結果を作成
        goal_results = create_goal_results_from_feedback(feedback_data, scenario_goals, session_id)
        
        # Float型をDecimal型に変換
        converted_feedback = convert_float_to_decimal(feedback_data)
        converted_metrics = convert_float_to_decimal(final_metrics)
        converted_goal_results = convert_float_to_decimal(goal_results) if goal_results else None
        
        item = {
            "sessionId": session_id,
            "createdAt": current_time,
            "dataType": "final-feedback",
            "expireAt": expire_at,
            "feedbackData": converted_feedback,
            "finalMetrics": converted_metrics,
            "messageCount": len(messages),
            "timestamp": int(time.time()),
        }
        
        if converted_goal_results:
            item["goalResults"] = converted_goal_results
        
        feedback_table.put_item(Item=item)
        logger.info("フィードバックをDynamoDBに保存完了", extra={
            "session_id": session_id,
            "overall_score": feedback_data.get("scores", {}).get("overall")
        })
        
    except Exception as e:
        logger.error("フィードバック保存エラー", extra={
            "error": str(e),
            "session_id": session_id
        })
        raise


def create_goal_results_from_feedback(
    feedback_data: Dict[str, Any],
    scenario_goals: List[Dict[str, Any]],
    session_id: str
) -> Dict[str, Any]:
    """
    フィードバックデータからゴール結果を作成
    
    Args:
        feedback_data: フィードバックデータ
        scenario_goals: シナリオゴール
        session_id: セッションID
        
    Returns:
        ゴール結果
    """
    goal_feedback = feedback_data.get("goalFeedback", {})
    achieved_goals = goal_feedback.get("achievedGoals", [])
    partially_achieved_goals = goal_feedback.get("partiallyAchievedGoals", [])
    
    goal_statuses = []
    for goal in scenario_goals:
        goal_desc = goal.get("description", "")
        achieved = any(goal_desc in ag for ag in achieved_goals)
        partially = any(goal_desc in pg for pg in partially_achieved_goals)
        
        goal_statuses.append({
            "goalId": goal.get("id", ""),
            "achieved": achieved,
            "progress": 100 if achieved else (50 if partially else 0),
        })
    
    # ゴールスコアを計算
    total_goals = len(scenario_goals)
    achieved_count = sum(1 for gs in goal_statuses if gs["achieved"])
    goal_score = (achieved_count / total_goals * 100) if total_goals > 0 else 0
    
    return {
        "goalStatuses": goal_statuses,
        "goalScore": goal_score,
        "scenarioGoals": scenario_goals
    }


def delete_analysis_progress_flag(session_id: str) -> None:
    """
    音声分析進行中フラグを削除する

    Args:
      session_id: セッションID
    """
    logger.debug(f"音声分析進行中フラグを削除: sessionId={session_id}")
    
    # 環境変数の検証
    if not SESSION_FEEDBACK_TABLE:
        logger.warning("SESSION_FEEDBACK_TABLE環境変数が設定されていません")
        return

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    try:
        # 進行中フラグを検索して削除
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("audio-analysis-in-progress"),
        )

        items = response.get("Items", [])
        for item in items:
            # sessionIdとcreatedAtをキーとして削除
            feedback_table.delete_item(
                Key={"sessionId": session_id, "createdAt": item["createdAt"]}
            )
            logger.info(f"音声分析進行中フラグを削除しました: sessionId={session_id}, createdAt={item['createdAt']}")

    except Exception as e:
        logger.error(f"進行中フラグの削除中にエラー: {str(e)}")
        # フラグ削除エラーは処理を停止させない
        pass
