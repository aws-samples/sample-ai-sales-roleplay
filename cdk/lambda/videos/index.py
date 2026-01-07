"""
動画管理Lambda関数

このモジュールは、録画動画のアップロード処理を行うLambda関数を実装します。
主な機能は以下の通りです：
- 録画動画アップロード用の署名付きURL生成 (/videos/upload-url)

注意: 動画分析はStep Functionsで実行されるため、このLambdaでは行いません。
"""

import json
import os
import time
import boto3
from botocore.config import Config
from typing import Dict, Any
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
VIDEO_BUCKET = os.environ.get('VIDEO_BUCKET', '')
MAX_VIDEO_SIZE_MB = int(os.environ.get('MAX_VIDEO_SIZE_MB', '100'))  # デフォルト最大100MB
DEFAULT_PRESIGNED_URL_EXPIRY = int(os.environ.get('DEFAULT_PRESIGNED_URL_EXPIRY', '600'))  # デフォルト10分

# CORS設定
cors_config = CORSConfig(
    allow_origin="*",
    allow_headers=["*"],
    max_age=300
)

# APIGatewayルーター
app = APIGatewayRestResolver(cors=cors_config)

# ロガー
logger = Logger(service="videos-api")

# AWSクライアント - リージョン指定と署名バージョン設定
if VIDEO_BUCKET:
    s3 = boto3.client(
        's3',
        region_name=os.environ.get('AWS_REGION'),  # Lambda実行リージョンを自動取得
        config=Config(
            signature_version='s3v4',  # 署名バージョンv4を明示指定
            s3={'addressing_style': 'virtual'},  # virtual-hosted-style URLを使用
            retries={'max_attempts': 3}  # リトライ設定
        )
    )
    logger.info(f"S3クライアント初期化完了（動画用）: region={os.environ.get('AWS_REGION')}")
else:
    s3 = None
    logger.warning("VIDEO_BUCKET環境変数が設定されていません")

# 例外クラス
class BadRequestError(Exception):
    pass

class InternalServerError(Exception):
    pass

# S3アップロード用の署名付きURL生成
@app.get("/videos/upload-url")
def generate_upload_url():
    """
    動画アップロード用の署名付きURLを生成するエンドポイント
    
    クエリパラメータ:
    - sessionId: セッションID
    - contentType: 動画のMIMEタイプ（video/mp4のみサポート）
    - fileName: ファイル名（オプション）
    
    レスポンス:
    - uploadUrl: アップロード用の署名付きURL
    - videoKey: S3バケット内のオブジェクトキー
    """
    try:
        # リクエストパラメータの取得
        session_id = app.current_event.get_query_string_value(name="sessionId", default_value=None)
        content_type = app.current_event.get_query_string_value(name="contentType", default_value=None)
        file_name = app.current_event.get_query_string_value(name="fileName", default_value="recording.mp4")
        
        if not session_id:
            raise BadRequestError("sessionId is required")
        
        if not content_type:
            raise BadRequestError("contentType is required")
        
        if content_type != 'video/mp4':
            raise BadRequestError("Only video/mp4 format is supported")
        
        # S3オブジェクトキーの生成
        timestamp = int(time.time())
        video_key = f"videos/{session_id}/{timestamp}_{file_name}"
        
        # S3署名付きPOSTフォーム作成（CORS回避のため）
        if not VIDEO_BUCKET:
            raise InternalServerError("VIDEO_BUCKET environment variable is not set")
        
        logger.info(f"署名付きURL生成開始（動画用）: bucket={VIDEO_BUCKET}, key={video_key}, contentType={content_type}, region={os.environ.get('AWS_REGION')}")
        
        # generate_presigned_postを使用してCORSプリフライトリクエストを回避
        post_data = s3.generate_presigned_post(
            Bucket=VIDEO_BUCKET,
            Key=video_key,
            Fields={'Content-Type': content_type},
            Conditions=[
                ['content-length-range', 1, MAX_VIDEO_SIZE_MB * 1024 * 1024],  # 100MB制限
                {'Content-Type': content_type}
            ],
            ExpiresIn=DEFAULT_PRESIGNED_URL_EXPIRY
        )
        
        logger.info(f"署名付きPOST URL生成成功（動画用）: bucket={VIDEO_BUCKET}, key={video_key}")
        logger.info(f"生成されたURL（動画用）: {post_data['url']}")
        logger.info(f"フォームデータのフィールド数（動画用）: {len(post_data['fields'])}")
        logger.info(f"フォームデータの内容（動画用）: {json.dumps(post_data['fields'], default=str)}")
        
        return {
            "uploadUrl": post_data["url"],
            "formData": post_data["fields"],
            "videoKey": video_key,
            "expiresIn": DEFAULT_PRESIGNED_URL_EXPIRY
        }
        
    except BadRequestError as e:
        logger.warn(f"Bad request: {str(e)}")
        return {"error": str(e)}, 400
    
    except InternalServerError as e:
        logger.error(f"Internal server error: {str(e)}")
        return {"error": "Internal server error"}, 500
    
    except Exception as e:
        logger.error(f"Error generating presigned URL: {str(e)}")
        return {"error": "Failed to generate upload URL"}, 500

# Lambda handler
@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    Lambda関数のエントリポイント
    """
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
