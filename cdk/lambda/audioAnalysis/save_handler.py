"""
結果保存Lambda関数

AI分析完了後の結果をDynamoDBに保存し、
進行中フラグを削除して処理を完了します。
"""

import os
import boto3
import boto3.dynamodb.conditions
import time
from typing import Dict, Any
from datetime import datetime
from decimal import Decimal

from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")

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
        
        # 進行中フラグを削除
        delete_analysis_progress_flag(session_id)
        
        # Step Functions完了出力
        output = {
            "success": True,
            "sessionId": session_id,
            "resultsSaved": True,
            "completedTime": datetime.utcnow().isoformat() + "Z"
        }
        
        logger.info("結果保存処理完了", extra={
            "session_id": session_id,
            "user_id": user_id,
            "scenario_id": scenario_id
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

def delete_analysis_progress_flag(session_id: str) -> None:
    """
    音声分析進行中フラグを削除する

    Args:
      session_id: セッションID
    """
    logger.debug(f"音声分析進行中フラグを削除: sessionId={session_id}")

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
