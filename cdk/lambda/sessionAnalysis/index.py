"""
セッション分析API Lambda関数

セッション分析の開始、ステータス確認、結果取得のAPIを提供します。
"""

import os
import json
import time
import boto3
import boto3.dynamodb.conditions
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
from typing import Dict, Any

# ロガー設定
logger = Logger(service="session-analysis-api")

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE")
STATE_MACHINE_ARN = os.environ.get("SESSION_ANALYSIS_STATE_MACHINE_ARN")

# AWSクライアント
dynamodb = boto3.resource("dynamodb")
sfn = boto3.client("stepfunctions")

# CORS設定
cors_config = CORSConfig(
    allow_origin="*",
    allow_headers=["*"],
    max_age=300
)

# APIルーター
app = APIGatewayRestResolver(cors=cors_config)


def get_user_id_from_event(app: APIGatewayRestResolver) -> str:
    """認証情報からユーザーIDを取得"""
    try:
        claims = app.current_event.request_context.authorizer.claims
        return claims.get("sub") or claims.get("cognito:username")
    except Exception:
        raise ValueError("認証情報が取得できません")


@app.post("/sessions/<session_id>/analyze")
def start_analysis(session_id: str):
    """
    セッション分析を開始
    
    Step Functionsを起動して非同期で分析を実行します。
    """
    try:
        user_id = get_user_id_from_event(app)
        
        # リクエストボディから言語設定を取得
        body = app.current_event.json_body or {}
        language = body.get("language", "ja")
        
        logger.info("セッション分析開始リクエスト", extra={
            "session_id": session_id,
            "user_id": user_id,
            "language": language
        })
        
        # セッションの存在確認
        sessions_table = dynamodb.Table(SESSIONS_TABLE)
        response = sessions_table.get_item(
            Key={
                "userId": user_id,
                "sessionId": session_id
            }
        )
        
        if "Item" not in response:
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "success": False,
                    "message": "セッションが見つかりません"
                })
            }
        
        # 既に分析中かどうかを確認
        existing_status = get_analysis_status(session_id)
        if existing_status and existing_status.get("status") == "processing":
            return {
                "success": True,
                "message": "分析は既に実行中です",
                "sessionId": session_id,
                "status": "processing",
                "executionArn": existing_status.get("executionArn")
            }
        
        # Step Functions実行
        execution_name = f"session-{session_id}-{int(time.time())}"
        
        sfn_response = sfn.start_execution(
            stateMachineArn=STATE_MACHINE_ARN,
            name=execution_name,
            input=json.dumps({
                "sessionId": session_id,
                "userId": user_id,
                "language": language
            })
        )
        
        execution_arn = sfn_response["executionArn"]
        
        # 実行ARNを保存
        save_execution_arn(session_id, execution_arn)
        
        logger.info("Step Functions実行開始", extra={
            "session_id": session_id,
            "execution_arn": execution_arn
        })
        
        return {
            "success": True,
            "message": "分析を開始しました",
            "sessionId": session_id,
            "status": "processing",
            "executionArn": execution_arn
        }
        
    except ValueError as e:
        logger.error(f"認証エラー: {str(e)}")
        return {
            "statusCode": 401,
            "body": json.dumps({
                "success": False,
                "message": str(e)
            })
        }
    except Exception as e:
        logger.exception("分析開始エラー", extra={"error": str(e)})
        return {
            "statusCode": 500,
            "body": json.dumps({
                "success": False,
                "message": f"分析開始中にエラーが発生しました: {str(e)}"
            })
        }


@app.get("/sessions/<session_id>/analysis-status")
def get_status(session_id: str):
    """
    セッション分析のステータスを取得
    
    ポーリング用のエンドポイントです。
    """
    try:
        user_id = get_user_id_from_event(app)
        
        logger.info("分析ステータス取得", extra={
            "session_id": session_id,
            "user_id": user_id
        })
        
        # 分析ステータスを取得
        status_data = get_analysis_status(session_id)
        
        if not status_data:
            return {
                "success": True,
                "sessionId": session_id,
                "status": "not_started",
                "message": "分析はまだ開始されていません"
            }
        
        status = status_data.get("status", "unknown")
        
        # Step Functionsの実行状態も確認
        execution_arn = status_data.get("executionArn")
        if execution_arn and status == "processing":
            try:
                sfn_response = sfn.describe_execution(executionArn=execution_arn)
                sfn_status = sfn_response.get("status")
                
                if sfn_status == "SUCCEEDED":
                    status = "completed"
                elif sfn_status == "FAILED":
                    status = "failed"
                elif sfn_status == "TIMED_OUT":
                    status = "timeout"
                    
            except Exception as e:
                logger.warning(f"Step Functions状態取得エラー: {str(e)}")
        
        response = {
            "success": True,
            "sessionId": session_id,
            "status": status,
            "updatedAt": status_data.get("updatedAt")
        }
        
        if status == "failed":
            response["errorMessage"] = status_data.get("errorMessage")
        
        return response
        
    except ValueError as e:
        logger.error(f"認証エラー: {str(e)}")
        return {
            "statusCode": 401,
            "body": json.dumps({
                "success": False,
                "message": str(e)
            })
        }
    except Exception as e:
        logger.exception("ステータス取得エラー", extra={"error": str(e)})
        return {
            "statusCode": 500,
            "body": json.dumps({
                "success": False,
                "message": f"ステータス取得中にエラーが発生しました: {str(e)}"
            })
        }


def get_analysis_status(session_id: str) -> Dict[str, Any]:
    """DynamoDBから分析ステータスを取得"""
    try:
        feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
        
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("analysis-status"),
            ScanIndexForward=False,
            Limit=1
        )
        
        items = response.get("Items", [])
        return items[0] if items else None
        
    except Exception as e:
        logger.error(f"ステータス取得エラー: {str(e)}")
        return None


def save_execution_arn(session_id: str, execution_arn: str):
    """実行ARNをDynamoDBに保存"""
    try:
        feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
        current_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        
        item = {
            "sessionId": session_id,
            "createdAt": current_time,
            "dataType": "analysis-status",
            "status": "processing",
            "executionArn": execution_arn,
            "updatedAt": current_time,
            "expireAt": int(time.time()) + (24 * 60 * 60)
        }
        
        feedback_table.put_item(Item=item)
        
    except Exception as e:
        logger.error(f"実行ARN保存エラー: {str(e)}")


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
                "Access-Control-Allow-Methods": "*"
            }
        }
