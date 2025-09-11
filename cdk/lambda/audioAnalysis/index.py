"""
音声分析API Lambda関数

フロントエンドからの音声分析リクエストを処理する統合API。
Step Functionsワークフローの制御と状況管理を行います。

主な機能：
- 音声ファイルのアップロード用署名付きURL生成
- Step Functions音声分析ワークフローの開始
- 分析進行状況の確認（ポーリング対応）
- 分析結果の取得

環境変数:
- AUDIO_STORAGE_BUCKET: 音声ファイル用S3バケット名
- SESSION_FEEDBACK_TABLE: セッションフィードバック用DynamoDBテーブル名
- SCENARIOS_TABLE: シナリオ情報用DynamoDBテーブル名
- BEDROCK_MODEL_ANALYSIS: 音声分析用Bedrockモデル
- AUDIO_ANALYSIS_STATE_MACHINE_ARN: Step Functions ARN
"""

import json
import os
import time
import uuid
import boto3
import boto3.dynamodb.conditions
from datetime import datetime, timezone
import traceback
from typing import Dict, Any, Optional

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import (
    APIGatewayRestResolver,
    CORSConfig,
    Response,
)
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
AUDIO_STORAGE_BUCKET = os.environ.get("AUDIO_STORAGE_BUCKET")
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")
SCENARIOS_TABLE = os.environ.get("SCENARIOS_TABLE")
AUDIO_ANALYSIS_STATE_MACHINE_ARN = os.environ.get("AUDIO_ANALYSIS_STATE_MACHINE_ARN")

# CORS設定
cors_config = CORSConfig(allow_origin="*", allow_headers=["*"], max_age=300)

# APIGatewayルーター
app = APIGatewayRestResolver(cors=cors_config)

# ロガー
logger = Logger(service="audioAnalysis-api")

# AWSクライアント
s3_client = boto3.client("s3")
stepfunctions_client = boto3.client("stepfunctions")
dynamodb = boto3.resource("dynamodb")

# 例外クラス
class BadRequestError(Exception):
    pass

class ResourceNotFoundError(Exception):
    pass

class InternalServerError(Exception):
    pass

def get_user_id_from_event():
    """イベントからCognitoユーザーIDを抽出"""
    try:
        claims = app.current_event.request_context.authorizer.claims
        return claims.get('cognito:username', claims.get('sub', 'anonymous'))
    except (AttributeError, KeyError):
        logger.warning("ユーザーID取得失敗、匿名ユーザーとして処理")
        return "anonymous"

@app.post("/audio-analysis/upload-url")
def generate_upload_url():
    """
    音声ファイルアップロード用の署名付きURL生成
    
    Request Body:
    {
        "fileName": "sample.mp3",
        "contentType": "audio/mpeg",
        "language": "ja"
    }
    
    Response:
    {
        "uploadUrl": "https://...",
        "audioKey": "audio-analysis/user123/session456/sample.mp3",
        "sessionId": "session456"
    }
    """
    try:
        request_body = app.current_event.json_body
        
        # リクエスト検証
        file_name = request_body.get("fileName")
        content_type = request_body.get("contentType", "audio/mpeg")
        language = request_body.get("language", "ja")
        
        if not file_name:
            raise BadRequestError("ファイル名が必要です")
        
        # 対応音声形式の検証
        supported_formats = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/flac", "audio/ogg"]
        if content_type not in supported_formats:
            raise BadRequestError(f"対応していない音声形式です: {content_type}")
        
        # ユーザーIDとセッションIDを生成
        user_id = get_user_id_from_event()
        session_id = str(uuid.uuid4())
        
        # S3キーを生成
        audio_key = f"audio-analysis/{user_id}/{session_id}/{file_name}"
        
        # 署名付きPOSTフォーム生成（15分間有効）
        post_data = s3_client.generate_presigned_post(
            Bucket=AUDIO_STORAGE_BUCKET,
            Key=audio_key,
            Fields={'Content-Type': content_type},
            Conditions=[
                {'Content-Type': content_type},
                ['content-length-range', 1, 100 * 1024 * 1024]  # 1B～100MB
            ],
            ExpiresIn=900  # 15分
        )
        
        logger.info("音声アップロード用URL生成完了", extra={
            "user_id": user_id,
            "session_id": session_id,
            "audio_key": audio_key,
            "content_type": content_type,
            "language": language
        })
        
        return {
            "success": True,
            "uploadUrl": post_data['url'],
            "formData": post_data['fields'],
            "audioKey": audio_key,
            "sessionId": session_id,
            "language": language
        }
        
    except BadRequestError:
        raise
    except Exception as e:
        logger.exception("署名付きURL生成エラー", extra={"error": str(e)})
        raise InternalServerError(f"URL生成中にエラーが発生しました: {str(e)}")

@app.post("/audio-analysis/<session_id>/analyze")
def start_audio_analysis(session_id: str):
    """
    音声分析を開始する（Step Functions実行）
    
    Request Body:
    {
        "audioKey": "audio-analysis/user123/session456/sample.mp3",
        "scenarioId": "scenario123",
        "language": "ja"
    }
    
    Response:
    {
        "success": true,
        "sessionId": "session456",
        "executionArn": "arn:aws:states:...",
        "status": "STARTED"
    }
    """
    try:
        logger.info(f"音声分析開始要求: sessionId={session_id}")

        # 既存の分析結果をチェック
        existing_result = get_existing_analysis_result(session_id)
        if existing_result:
            logger.info(f"既存の分析結果を返します: sessionId={session_id}")
            return {
                "success": True,
                "sessionId": session_id,
                "status": "COMPLETED",
                "message": "分析は既に完了しています"
            }

        # 実行中フラグをチェック
        if is_analysis_in_progress(session_id):
            logger.info(f"音声分析が既に実行中です: sessionId={session_id}")
            return Response(
                status_code=409,
                content_type="application/json",
                body=json.dumps({
                    "error": "Analysis is already in progress",
                    "message": "音声分析が既に実行中です。完了までお待ちください。",
                    "sessionId": session_id,
                }),
            )

        request_body = app.current_event.json_body
        
        # リクエスト検証
        audio_key = request_body.get("audioKey")
        scenario_id = request_body.get("scenarioId")
        language = request_body.get("language", "ja")
        
        if not all([audio_key, scenario_id]):
            raise BadRequestError("audioKey、scenarioIdが必要です")
        
        user_id = get_user_id_from_event()
        
        # Step Functionsの入力データを作成
        step_functions_input = {
            "sessionId": session_id,
            "audioKey": audio_key,
            "scenarioId": scenario_id,
            "language": language,
            "userId": user_id
        }
        
        # Step Functions実行を開始
        try:
            execution_response = stepfunctions_client.start_execution(
                stateMachineArn=AUDIO_ANALYSIS_STATE_MACHINE_ARN,
                name=f"audio-analysis-{session_id}-{int(time.time())}",
                input=json.dumps(step_functions_input)
            )
            
            execution_arn = execution_response['executionArn']
            
            logger.info("Step Functions実行開始", extra={
                "session_id": session_id,
                "execution_arn": execution_arn,
                "scenario_id": scenario_id
            })
            
            return {
                "success": True,
                "sessionId": session_id,
                "executionArn": execution_arn,
                "status": "STARTED"
            }
            
        except Exception as step_functions_error:
            logger.error("Step Functions実行開始エラー", extra={
                "error": str(step_functions_error),
                "session_id": session_id
            })
            raise InternalServerError(f"音声分析開始に失敗しました: {str(step_functions_error)}")
        
    except ResourceNotFoundError:
        raise
    except InternalServerError:
        raise
    except Exception as e:
        logger.error(f"音声分析開始中に予期しないエラーが発生: sessionId={session_id}, error={str(e)}")
        logger.error(f"スタックトレース: {traceback.format_exc()}")
        raise InternalServerError(f"Unexpected error during audio analysis: {str(e)}")

@app.get("/audio-analysis/<session_id>/status")
def get_analysis_status(session_id: str):
    """
    音声分析の状況を確認する（ポーリング用）
    
    Response:
    {
        "success": true,
        "sessionId": "session456", 
        "status": "COMPLETED|IN_PROGRESS|FAILED|NOT_STARTED",
        "currentStep": "TRANSCRIBING|ANALYZING|SAVING",
        "hasResult": true,
        "progress": {...}
    }
    """
    try:
        if not session_id:
            raise BadRequestError("セッションIDが必要です")
        
        user_id = get_user_id_from_event()
        
        # 既存の分析結果をチェック
        existing_result = get_existing_analysis_result(session_id)
        if existing_result:
            # ユーザーの所有権を確認
            if existing_result.get("userId") != user_id:
                raise ResourceNotFoundError(f"セッションが見つかりません: {session_id}")
            
            logger.info(f"分析結果が存在します: sessionId={session_id}")
            return {
                "success": True,
                "sessionId": session_id,
                "status": "COMPLETED",
                "hasResult": True
            }
        
        # 進行状況をチェック
        progress_data = get_analysis_progress(session_id)
        if progress_data:
            # ユーザーの所有権を確認
            if progress_data.get("userId") != user_id:
                raise ResourceNotFoundError(f"セッションが見つかりません: {session_id}")
            
            current_step = progress_data.get("currentStep", "UNKNOWN")
            status = progress_data.get("status", "IN_PROGRESS")
            
            logger.info(f"分析実行中: sessionId={session_id}, step={current_step}")
            return {
                "success": True,
                "sessionId": session_id,
                "status": status,
                "currentStep": current_step,
                "hasResult": False,
                "progress": progress_data
            }
        
        # 結果も実行中フラグもない場合
        logger.info(f"分析が開始されていません: sessionId={session_id}")
        return {
            "success": True,
            "sessionId": session_id,
            "status": "NOT_STARTED",
            "hasResult": False
        }
        
    except (BadRequestError, ResourceNotFoundError):
        raise
    except Exception as e:
        logger.exception("分析状況確認エラー", extra={"error": str(e), "session_id": session_id})
        raise InternalServerError(f"状況確認中にエラーが発生しました: {str(e)}")

@app.get("/audio-analysis/<session_id>/results")  
def get_analysis_results(session_id: str):
    """
    音声分析結果を取得する
    
    Response:
    {
        "success": true,
        "sessionId": "session456",
        "audioAnalysis": {...},
        "scenarioId": "scenario123",
        "language": "ja"
    }
    """
    try:
        if not session_id:
            raise BadRequestError("セッションIDが必要です")
        
        user_id = get_user_id_from_event()
        
        # 分析結果を取得
        result = get_existing_analysis_result(session_id)
        
        if not result:
            raise ResourceNotFoundError(f"分析結果が見つかりません: {session_id}")
        
        # ユーザーの所有権を確認
        if result.get("userId") != user_id:
            raise ResourceNotFoundError(f"セッションが見つかりません: {session_id}")
        
        logger.info("分析結果取得完了", extra={
            "session_id": session_id,
            "has_audio_analysis": "audioAnalysisData" in result
        })
        
        return {
            "success": True,
            "sessionId": session_id,
            "audioAnalysis": result.get("audioAnalysisData"),
            "scenarioId": result.get("scenarioId"),
            "language": result.get("language"),
            "createdAt": result.get("createdAt")
        }
        
    except (BadRequestError, ResourceNotFoundError):
        raise
    except Exception as e:
        logger.exception("分析結果取得エラー", extra={"error": str(e), "session_id": session_id})
        raise InternalServerError(f"結果取得中にエラーが発生しました: {str(e)}")

def get_existing_analysis_result(session_id: str) -> Optional[Dict[str, Any]]:
    """
    既存の音声分析結果をDynamoDBから取得する

    Args:
      session_id: セッションID

    Returns:
      既存の分析結果、存在しない場合はNone
    """
    logger.debug(f"既存の音声分析結果を検索: sessionId={session_id}")

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    try:
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("audio-analysis-result"),
            ScanIndexForward=False,  # 降順ソート（最新が先頭）
        )

        items = response.get("Items", [])
        if items:
            logger.info(f"既存の音声分析結果が見つかりました: sessionId={session_id}")
            return items[0]
        else:
            logger.info(f"既存の音声分析結果が見つかりません: sessionId={session_id}")
            return None

    except Exception as e:
        logger.error(f"既存の音声分析結果の取得中にエラー: {str(e)}")
        return None

def is_analysis_in_progress(session_id: str) -> bool:
    """
    音声分析が実行中かどうかを確認する

    Args:
      session_id: セッションID

    Returns:
      実行中の場合True、そうでなければFalse
    """
    progress_data = get_analysis_progress(session_id)
    return progress_data is not None

def get_analysis_progress(session_id: str) -> Optional[Dict[str, Any]]:
    """
    音声分析の進行状況をDynamoDBから取得する

    Args:
      session_id: セッションID

    Returns:
      進行状況データ、存在しない場合はNone
    """
    logger.debug(f"音声分析進行状況を確認: sessionId={session_id}")

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    try:
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("audio-analysis-in-progress"),
            ScanIndexForward=False,  # 降順ソート（最新が先頭）
        )

        items = response.get("Items", [])
        if items:
            # 進行中フラグが存在する場合、作成時刻をチェック（古すぎる場合は無効とする）
            created_at = items[0].get("createdAt")
            if created_at:

                try:
                    created_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    current_time = datetime.now(timezone.utc)
                    # 3時間以上古い場合は無効とする（処理が異常終了した可能性）
                    if (current_time - created_time).total_seconds() > 10800:
                        logger.warn(f"古い進行中フラグを検出（3時間以上前）: sessionId={session_id}, createdAt={created_at}")
                        return None
                    else:
                        logger.info(f"音声分析実行中: sessionId={session_id}")
                        return items[0]
                except Exception as e:
                    logger.error(f"進行中フラグの時刻解析エラー: {str(e)}")
                    return items[0]  # エラーの場合は存在するものとして扱う
            else:
                logger.info(f"音声分析実行中: sessionId={session_id}")
                return items[0]
        else:
            logger.debug(f"音声分析進行中フラグなし: sessionId={session_id}")
            return None

    except Exception as e:
        logger.error(f"進行中フラグの確認中にエラー: {str(e)}")
        return None

# Lambda handler
@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """Lambda関数のエントリポイント"""
    try:
        return app.resolve(event, context)
    except Exception as e:
        logger.exception(f"Unhandled exception: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"}),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
        }
