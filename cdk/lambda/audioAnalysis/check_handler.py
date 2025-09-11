"""
Transcribe状況確認Lambda関数

Amazon Transcribeジョブの完了状況を確認し、
Step Functionsの条件分岐のための状態を返します。
"""

import json
import os
import boto3
import boto3.dynamodb.conditions
from typing import Dict, Any
from datetime import datetime

from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")

# ロガー
logger = Logger(service="audioAnalysis-check")

# AWSクライアント
transcribe_client = boto3.client("transcribe")
dynamodb = boto3.resource("dynamodb")

def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    Transcribe状況確認Lambda関数のエントリポイント
    
    Step Functions入力:
    {
        "success": true,
        "sessionId": "session456",
        "transcribeJobName": "audio-analysis-session456-1234567890",
        "jobStatus": "IN_PROGRESS",
        "outputLocation": "s3://bucket/transcripts/session456.json",
        ...
    }
    
    Step Functions出力:
    {
        "success": true,
        "sessionId": "session456", 
        "transcribeJobName": "audio-analysis-session456-1234567890",
        "jobStatus": "COMPLETED|IN_PROGRESS|FAILED",
        "outputLocation": "s3://bucket/transcripts/session456.json",
        "transcriptFileUri": "https://s3.amazonaws.com/...",
        "completionTime": "2023-12-01T10:30:00Z",
        ...
    }
    """
    try:
        logger.info("Transcribe状況確認処理を開始", extra={"event": event})
        
        # 入力パラメータを取得
        session_id = event.get("sessionId")
        transcribe_job_name = event.get("transcribeJobName")
        
        # 必須パラメータの検証
        if not all([session_id, transcribe_job_name]):
            raise ValueError("sessionId, transcribeJobNameが必要です")
        
        # Transcribeジョブの状況を確認
        try:
            job_response = transcribe_client.get_transcription_job(
                TranscriptionJobName=transcribe_job_name
            )
            
            transcription_job = job_response['TranscriptionJob']
            job_status = transcription_job['TranscriptionJobStatus']
            
            logger.info("Transcribeジョブ状況確認", extra={
                "job_name": transcribe_job_name,
                "status": job_status,
                "session_id": session_id
            })
            
            # 出力データを作成（前ステップのデータを継承）
            output = {
                **event,
                "jobStatus": job_status,
                "checkTime": datetime.utcnow().isoformat() + "Z"
            }
            
            # 完了時は転写結果情報を追加
            if job_status == 'COMPLETED':
                transcript = transcription_job.get('Transcript', {})
                transcript_file_uri = transcript.get('TranscriptFileUri', '')
                completion_time = transcription_job.get('CompletionTime')
                
                output["transcriptFileUri"] = transcript_file_uri
                if completion_time:
                    # CompletionTimeが既にdatetimeオブジェクトの場合とtimestampの場合を処理
                    if isinstance(completion_time, datetime):
                        output["completionTime"] = completion_time.isoformat() + "Z"
                    else:
                        output["completionTime"] = datetime.fromtimestamp(completion_time).isoformat() + "Z"
                
                # 進行状況を更新
                update_analysis_progress(session_id, "TRANSCRIBE_COMPLETED", {
                    "transcribeJobName": transcribe_job_name,
                    "transcribeStatus": "COMPLETED",
                    "transcriptFileUri": transcript_file_uri
                })
                
                logger.info("Transcribe完了確認", extra={
                    "session_id": session_id,
                    "transcript_uri": transcript_file_uri
                })
                
            elif job_status == 'FAILED':
                failure_reason = transcription_job.get('FailureReason', 'Unknown error')
                output["failureReason"] = failure_reason
                
                # エラー情報を更新
                update_analysis_progress(session_id, "ERROR", {
                    "transcribeJobName": transcribe_job_name,
                    "transcribeStatus": "FAILED",
                    "error": failure_reason,
                    "step": "TRANSCRIBE"
                })
                
                logger.error("Transcribe失敗確認", extra={
                    "session_id": session_id,
                    "failure_reason": failure_reason
                })
                
            else:
                # IN_PROGRESS状態の場合は進行状況のみ更新
                start_time = transcription_job.get('StartTime')
                if start_time:
                    # StartTimeが既にdatetimeオブジェクトの場合とtimestampの場合を処理
                    if isinstance(start_time, datetime):
                        output["transcribeStartTime"] = start_time.isoformat() + "Z"
                    else:
                        output["transcribeStartTime"] = datetime.fromtimestamp(start_time).isoformat() + "Z"
                
                update_analysis_progress(session_id, "TRANSCRIBING", {
                    "transcribeJobName": transcribe_job_name,
                    "transcribeStatus": job_status
                })
                
                logger.info("Transcribe実行中", extra={
                    "session_id": session_id,
                    "status": job_status
                })
            
            return output
            
        except transcribe_client.exceptions.BadRequestException as bad_request:
            logger.error("Transcribeジョブが見つかりません", extra={
                "error": str(bad_request),
                "job_name": transcribe_job_name
            })
            
            # ジョブが見つからない場合は失敗として扱う
            update_analysis_progress(session_id, "ERROR", {
                "error": f"Transcribeジョブが見つかりません: {transcribe_job_name}",
                "step": "CHECK_TRANSCRIBE"
            })
            
            return {
                **event,
                "jobStatus": "FAILED",
                "error": f"Transcribeジョブが見つかりません: {transcribe_job_name}",
                "errorType": "JobNotFound"
            }
            
    except Exception as e:
        logger.exception("Transcribe状況確認処理エラー", extra={"error": str(e)})
        
        # エラー情報をDynamoDBに記録
        update_analysis_progress(event.get("sessionId"), "ERROR", {
            "error": str(e),
            "step": "CHECK_TRANSCRIBE"
        })
        
        # Step Functionsにエラーを伝える
        return {
            **event,
            "success": False,
            "jobStatus": "FAILED",
            "error": str(e),
            "errorType": "TranscribeCheckError"
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
