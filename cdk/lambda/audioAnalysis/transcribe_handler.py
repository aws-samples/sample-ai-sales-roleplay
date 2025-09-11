"""
Transcribe開始Lambda関数

Amazon Transcribeの転写ジョブを開始し、
話者分離機能を有効化して音声転写を実行します。
"""

import os
import boto3
import boto3.dynamodb.conditions
from typing import Dict, Any
from datetime import datetime

from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
AUDIO_STORAGE_BUCKET = os.environ.get("AUDIO_STORAGE_BUCKET")
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")

# ロガー
logger = Logger(service="audioAnalysis-transcribe")

# AWSクライアント
transcribe_client = boto3.client("transcribe")
dynamodb = boto3.resource("dynamodb")

def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    Transcribe開始Lambda関数のエントリポイント
    
    Step Functions入力:
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
    
    Step Functions出力:
    {
        "success": true,
        "sessionId": "session456",
        "audioKey": "audio-analysis/user123/session456/sample.mp3",
        "scenarioId": "scenario123",
        "language": "ja", 
        "userId": "user123",
        "transcribeJobName": "audio-analysis-session456-1234567890",
        "jobStatus": "IN_PROGRESS",
        "outputLocation": "s3://bucket/transcripts/session456.json"
    }
    """
    try:
        logger.info("Transcribe開始処理を開始", extra={"event": event})
        
        # 入力パラメータを取得
        session_id = event.get("sessionId")
        audio_key = event.get("audioKey") 
        language = event.get("language", "ja")
        transcribe_job_name = event.get("transcribeJobName")
        
        # 必須パラメータの検証
        if not all([session_id, audio_key, transcribe_job_name]):
            raise ValueError("sessionId, audioKey, transcribeJobNameが必要です")
        
        # 言語コードのマッピング
        language_code_mapping = {
            "ja": "ja-JP",
            "en": "en-US"
        }
        transcribe_language = language_code_mapping.get(language, "ja-JP")
        
        # 音声ファイルのS3 URI
        audio_uri = f"s3://{AUDIO_STORAGE_BUCKET}/{audio_key}"
        
        # メディア形式を判定
        media_format = get_media_format_from_key(audio_key)
        
        # 出力場所を設定
        output_key = f"transcripts/{session_id}.json"
        
        logger.info("Transcribeジョブ開始", extra={
            "job_name": transcribe_job_name,
            "language": transcribe_language,
            "media_format": media_format,
            "audio_uri": audio_uri,
            "output_key": output_key
        })
        
        # Amazon Transcribe ジョブを開始
        transcribe_response = transcribe_client.start_transcription_job(
            TranscriptionJobName=transcribe_job_name,
            Media={'MediaFileUri': audio_uri},
            MediaFormat=media_format,
            LanguageCode=transcribe_language,
            Settings={
                'ShowSpeakerLabels': True,
                'MaxSpeakerLabels': 10,
                'ShowAlternatives': False,
            },
            OutputBucketName=AUDIO_STORAGE_BUCKET,
            OutputKey=output_key
        )
        
        # 進行状況をDynamoDBに更新
        update_analysis_progress(session_id, "TRANSCRIBING", {
            "transcribeJobName": transcribe_job_name,
            "transcribeStatus": "IN_PROGRESS"
        })
        
        # Step Functions次ステップ用の出力を作成
        output = {
            **event,  # 前ステップの出力を継承
            "jobStatus": "IN_PROGRESS",
            "outputLocation": f"s3://{AUDIO_STORAGE_BUCKET}/{output_key}",
            "transcribeStartTime": datetime.utcnow().isoformat() + "Z"
        }
        
        logger.info("Transcribe開始処理完了", extra={
            "session_id": session_id,
            "job_name": transcribe_job_name
        })
        
        return output
        
    except Exception as e:
        logger.exception("Transcribe開始処理エラー", extra={"error": str(e)})
        
        # エラー情報をDynamoDBに記録
        update_analysis_progress(event.get("sessionId"), "ERROR", {
            "error": str(e),
            "step": "START_TRANSCRIBE"
        })
        
        # Step Functionsにエラーを伝える
        return {
            **event,
            "success": False,
            "error": str(e),
            "errorType": "TranscribeStartError"
        }

def get_media_format_from_key(audio_key: str) -> str:
    """音声ファイルキーから形式を判定"""
    extension = audio_key.lower().split('.')[-1]
    format_mapping = {
        'mp3': 'mp3',
        'wav': 'wav',
        'flac': 'flac',
        'ogg': 'ogg'
    }
    return format_mapping.get(extension, 'mp3')

def update_analysis_progress(session_id: str, step: str, additional_data: Dict[str, Any] = None):
    """
    分析進行状況をDynamoDBに更新
    
    Args:
        session_id: セッションID
        step: 現在のステップ
        additional_data: 追加データ
    """
    try:
        feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
        
        # 既存の進行状況レコードを検索
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("audio-analysis-in-progress"),
            ScanIndexForward=False,  # 最新順
            Limit=1
        )
        
        items = response.get("Items", [])
        if items:
            # 既存レコードを更新
            existing_item = items[0]
            existing_item["currentStep"] = step
            existing_item["status"] = "IN_PROGRESS"
            existing_item["updatedAt"] = datetime.utcnow().isoformat() + "Z"
            
            if additional_data:
                existing_item.update(additional_data)
            
            feedback_table.put_item(Item=existing_item)
            logger.info("進行状況更新完了", extra={
                "session_id": session_id,
                "step": step
            })
        else:
            logger.warning("進行状況レコードが見つかりません", extra={
                "session_id": session_id
            })
        
    except Exception as e:
        logger.error("進行状況更新エラー", extra={
            "error": str(e),
            "session_id": session_id
        })
