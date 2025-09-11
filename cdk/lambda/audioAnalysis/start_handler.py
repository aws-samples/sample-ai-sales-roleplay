"""
音声分析開始Lambda関数

Step Functionsワークフローの最初のステップとして、
音声ファイルの検証と初期状態設定を行います。
"""

import os
import boto3
import time
from typing import Dict, Any
from datetime import datetime

from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
AUDIO_STORAGE_BUCKET = os.environ.get("AUDIO_STORAGE_BUCKET")
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")
SCENARIOS_TABLE = os.environ.get("SCENARIOS_TABLE")

# ロガー
logger = Logger(service="audioAnalysis-start")

# AWSクライアント
s3_client = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    音声分析開始Lambda関数のエントリポイント
    
    Step Functions入力:
    {
        "audioKey": "audio-analysis/user123/session456/sample.mp3",
        "sessionId": "session456", 
        "scenarioId": "scenario123",
        "language": "ja",
        "userId": "user123"
    }
    
    Step Functions出力:
    {
        "success": true,
        "sessionId": "session456",
        "audioKey": "audio-analysis/user123/session456/sample.mp3",
        "scenarioId": "scenario123", 
        "language": "ja",
        "userId": "user123",
        "transcribeJobName": "audio-analysis-session456-1234567890",
        "validated": true
    }
    """
    try:
        logger.info("音声分析開始処理を開始", extra={"event": event})
        
        # 入力パラメータを取得
        audio_key = event.get("audioKey")
        session_id = event.get("sessionId")
        scenario_id = event.get("scenarioId")
        language = event.get("language", "ja")
        user_id = event.get("userId")
        
        # 必須パラメータの検証
        if not all([audio_key, session_id, scenario_id, user_id]):
            raise ValueError("audioKey, sessionId, scenarioId, userIdが必要です")
        
        # 音声ファイルの存在確認
        try:
            s3_client.head_object(Bucket=AUDIO_STORAGE_BUCKET, Key=audio_key)
            logger.info("音声ファイル存在確認完了", extra={
                "audio_key": audio_key,
                "session_id": session_id
            })
        except Exception as s3_error:
            logger.error("音声ファイルが見つかりません", extra={
                "error": str(s3_error),
                "audio_key": audio_key
            })
            raise ValueError(f"音声ファイルが見つかりません: {audio_key}")
        
        # シナリオの存在確認
        scenarios_table = dynamodb.Table(SCENARIOS_TABLE)
        try:
            scenario_response = scenarios_table.get_item(Key={'scenarioId': scenario_id})
            if 'Item' not in scenario_response:
                raise ValueError(f"シナリオが見つかりません: {scenario_id}")
            
            logger.info("シナリオ存在確認完了", extra={
                "scenario_id": scenario_id,
                "session_id": session_id
            })
        except Exception as scenario_error:
            logger.error("シナリオ検証エラー", extra={
                "error": str(scenario_error),
                "scenario_id": scenario_id
            })
            raise ValueError(f"シナリオ検証に失敗しました: {str(scenario_error)}")
        
        # Transcribeジョブ名を生成
        transcribe_job_name = f"audio-analysis-{session_id}-{int(time.time())}"
        
        # 分析開始フラグをDynamoDBに設定
        set_analysis_start_flag(session_id, user_id, scenario_id, language, audio_key, transcribe_job_name)
        
        # Step Functions次ステップ用の出力を作成
        output = {
            "success": True,
            "sessionId": session_id,
            "audioKey": audio_key,
            "scenarioId": scenario_id,
            "language": language,
            "userId": user_id,
            "transcribeJobName": transcribe_job_name,
            "validated": True,
            "startTime": datetime.utcnow().isoformat() + "Z"
        }
        
        logger.info("音声分析開始処理完了", extra={
            "session_id": session_id,
            "transcribe_job_name": transcribe_job_name
        })
        
        return output
        
    except Exception as e:
        logger.exception("音声分析開始処理エラー", extra={"error": str(e)})
        # Step Functionsにエラーを伝える
        return {
            "success": False,
            "error": str(e),
            "sessionId": event.get("sessionId"),
            "errorType": "StartAnalysisError"
        }

def set_analysis_start_flag(session_id: str, user_id: str, scenario_id: str, language: str, audio_key: str, job_name: str):
    """
    音声分析開始フラグをDynamoDBに設定
    
    Args:
        session_id: セッションID
        user_id: ユーザーID
        scenario_id: シナリオID
        language: 言語コード
        audio_key: 音声ファイルのS3キー
        job_name: Transcribeジョブ名
    """
    try:
        feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
        current_time = datetime.utcnow().isoformat() + "Z"
        
        # TTL設定（3時間後に削除）
        expire_at = int(time.time()) + (3 * 60 * 60)
        
        item = {
            "sessionId": session_id,
            "createdAt": current_time,
            "dataType": "audio-analysis-in-progress",
            "userId": user_id,
            "scenarioId": scenario_id,
            "language": language,
            "audioKey": audio_key,
            "transcribeJobName": job_name,
            "status": "STARTED",
            "currentStep": "START",
            "expireAt": expire_at,
            "timestamp": int(time.time()),
        }
        
        feedback_table.put_item(Item=item)
        logger.info("分析開始フラグ設定完了", extra={
            "session_id": session_id,
            "job_name": job_name
        })
        
    except Exception as e:
        logger.error("分析開始フラグ設定エラー", extra={
            "error": str(e),
            "session_id": session_id
        })
        # フラグ設定エラーは処理を停止させない
        pass
