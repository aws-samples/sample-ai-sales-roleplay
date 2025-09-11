"""
AI分析処理Lambda関数

Transcribe完了後の転写結果を取得し、
Strands Agentを使用して話者の役割特定とAI分析を実行します。
"""

import json
import os
import boto3
import boto3.dynamodb.conditions
import urllib.request
from typing import Dict, Any
from datetime import datetime

from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# agent モジュールをインポート
from agent.agent import analyze_speakers_and_roles
from agent.types import AudioAnalysisOutput

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")
AUDIO_STORAGE_BUCKET = os.environ.get("AUDIO_STORAGE_BUCKET")

# ロガー
logger = Logger(service="audioAnalysis-process")

# AWSクライアント
s3_client = boto3.client("s3")
transcribe_client = boto3.client("transcribe")
dynamodb = boto3.resource("dynamodb")

def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    AI分析処理Lambda関数のエントリポイント
    
    Step Functions入力:
    {
        "success": true,
        "sessionId": "session456",
        "transcribeJobName": "audio-analysis-session456-1234567890",
        "jobStatus": "COMPLETED",
        "transcriptFileUri": "https://s3.amazonaws.com/...",
        "completionTime": "2023-12-01T10:30:00Z",
        ...
    }
    
    Step Functions出力:
    {
        "success": true,
        "sessionId": "session456",
        "audioAnalysisResult": {
            "speakers": [...],
            "segments": [...],
            "summary": {...},
            "language_detected": "ja"
        },
        "analysisCompletedTime": "2023-12-01T10:35:00Z",
        ...
    }
    """
    try:
        logger.info("AI分析処理を開始", extra={"event": event})
        
        # 入力パラメータを取得
        session_id = event.get("sessionId")
        transcribe_job_name = event.get("transcribeJobName")
        transcript_file_uri = event.get("transcriptFileUri")
        language = event.get("language", "ja")
        
        # 必須パラメータの検証
        if not all([session_id, transcript_file_uri]):
            raise ValueError("sessionId, transcriptFileUriが必要です")
        
        # 進行状況を更新
        update_analysis_progress(session_id, "ANALYZING", {
            "transcribeJobName": transcribe_job_name,
            "transcribeStatus": "COMPLETED"
        })
        
        # 転写結果をダウンロード
        logger.info("転写結果をダウンロード中", extra={
            "transcript_uri": transcript_file_uri,
            "session_id": session_id
        })
        
        try:
            # transcript_file_uriからS3バケット名とキーを抽出
            # 例: https://s3.us-west-2.amazonaws.com/bucket-name/key -> bucket-name, key
            if transcript_file_uri.startswith('https://s3.'):
                # S3 URLからバケット名とキーを抽出
                url_parts = transcript_file_uri.split('/')
                bucket_name = url_parts[3]  # https://s3.region.amazonaws.com/bucket-name/...
                transcript_key = '/'.join(url_parts[4:])  # transcripts/session.json
            else:
                # 環境変数から取得
                bucket_name = AUDIO_STORAGE_BUCKET
                transcript_key = f"transcripts/{session_id}.json"
            
            logger.info("S3から転写結果を取得", extra={
                "bucket": bucket_name,
                "key": transcript_key,
                "session_id": session_id
            })
            
            # S3クライアントを使用して転写結果を取得
            transcript_obj = s3_client.get_object(Bucket=bucket_name, Key=transcript_key)
            transcription_data = json.loads(transcript_obj['Body'].read().decode('utf-8'))
                
            logger.info("転写結果ダウンロード完了", extra={
                "session_id": session_id,
                "has_results": "results" in transcription_data,
                "has_speaker_labels": "speaker_labels" in transcription_data.get("results", {})
            })
            
        except Exception as download_error:
            logger.error("転写結果ダウンロードエラー", extra={
                "error": str(download_error),
                "transcript_uri": transcript_file_uri,
                "bucket": bucket_name if 'bucket_name' in locals() else "不明",
                "key": transcript_key if 'transcript_key' in locals() else "不明"
            })
            raise ValueError(f"転写結果のダウンロードに失敗しました: {str(download_error)}")
        
        # Strands Agentで話者役割分析を実行
        logger.info("Strands Agent分析開始", extra={
            "session_id": session_id,
            "language": language
        })
        
        try:
            analysis_result: AudioAnalysisOutput = analyze_speakers_and_roles(
                transcription_data,
                language
            )
            
            logger.info("Strands Agent分析完了", extra={
                "session_id": session_id,
                "speakers_count": len(analysis_result.speakers),
                "segments_count": len(analysis_result.segments)
            })
            
        except Exception as analysis_error:
            logger.error("Strands Agent分析エラー", extra={
                "error": str(analysis_error),
                "session_id": session_id
            })
            raise ValueError(f"AI分析処理に失敗しました: {str(analysis_error)}")
        
        # Transcribeジョブをクリーンアップ（リソース節約）
        if transcribe_job_name:
            try:
                transcribe_client.delete_transcription_job(
                    TranscriptionJobName=transcribe_job_name
                )
                logger.info("Transcribeジョブクリーンアップ完了", extra={
                    "job_name": transcribe_job_name,
                    "session_id": session_id
                })
            except Exception as cleanup_error:
                logger.warning("Transcribeジョブクリーンアップエラー", extra={
                    "error": str(cleanup_error),
                    "job_name": transcribe_job_name
                })
                # クリーンアップエラーは処理を停止させない
        
        # Step Functions次ステップ用の出力を作成
        output = {
            **event,  # 前ステップの出力を継承
            "audioAnalysisResult": analysis_result.model_dump(),
            "analysisCompletedTime": datetime.utcnow().isoformat() + "Z"
        }
        
        logger.info("AI分析処理完了", extra={
            "session_id": session_id,
            "speakers_detected": len(analysis_result.speakers)
        })
        
        return output
        
    except Exception as e:
        logger.exception("AI分析処理エラー", extra={"error": str(e)})
        
        # エラー情報をDynamoDBに記録
        update_analysis_progress(event.get("sessionId"), "ERROR", {
            "error": str(e),
            "step": "AI_ANALYSIS"
        })
        
        # Step Functionsにエラーを伝える
        return {
            **event,
            "success": False,
            "error": str(e),
            "errorType": "AIAnalysisError"
        }

def update_analysis_progress(session_id: str, step: str, additional_data: Dict[str, Any] = None):
    """
    分析進行状況をDynamoDBに更新
    
    Args:
        session_id: セッションID
        step: 現在のステップ
        additional_data: 追加データ
    """
    if not session_id:
        logger.warning("セッションIDが無効なため進行状況更新をスキップ")
        return
        
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
