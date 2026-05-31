"""
動画管理Lambda関数

このモジュールは、録画動画のアップロード処理を行うLambda関数を実装します。
録画動画はファイルサイズに関わらずマルチパートアップロードで送信するため、
20分超の長時間セッション（動画+音声で200MBを超える）でも
S3の EntityTooLarge エラーが発生しない。

主な機能は以下の通りです：
- マルチパートアップロード開始 (/videos/multipart/create)
- マルチパートアップロード完了 (/videos/multipart/complete)
- マルチパートアップロード中断 (/videos/multipart/abort)

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
# マルチパートアップロード用の署名付きURL有効期限（長時間アップロードに備えてデフォルト1時間）
MULTIPART_PRESIGNED_URL_EXPIRY = int(os.environ.get('MULTIPART_PRESIGNED_URL_EXPIRY', '3600'))
# マルチパートアップロードの最大パート数（S3の上限は10,000）
# 録画は1.5Mbps映像+音声≈1.6Mbps。10MB/パート換算で60分≈68パート、2時間≈150パート程度のため、
# 余裕を持たせた500（10MB×500=5GB相当）をデフォルトとし、過大なpartCount要求による
# 署名付きURLの大量同期生成（Lambdaのブロッキング/DoS）を防ぐ。
MAX_MULTIPART_PARTS = int(os.environ.get('MAX_MULTIPART_PARTS', '500'))

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

# マルチパートアップロード開始
@app.post("/videos/multipart/create")
def create_multipart_upload():
    """
    マルチパートアップロードを開始し、各パートの署名付きURLを生成するエンドポイント

    長時間セッション（20分超など）の大容量動画ファイルに対応するため、
    ファイルを複数パートに分割してアップロードする。

    リクエストボディ:
    - sessionId: セッションID
    - contentType: 動画のMIMEタイプ（video/mp4のみサポート）
    - fileName: ファイル名（オプション）
    - partCount: 分割するパート数（1〜MAX_MULTIPART_PARTS）

    レスポンス:
    - uploadId: マルチパートアップロードID
    - videoKey: S3バケット内のオブジェクトキー
    - partUrls: 各パートの署名付きURLリスト [{ partNumber, url }]
    - expiresIn: 署名付きURLの有効期限（秒）
    """
    try:
        body = app.current_event.json_body or {}

        session_id = body.get("sessionId")
        content_type = body.get("contentType")
        file_name = body.get("fileName", "recording.mp4")
        part_count = body.get("partCount")

        # 入力検証
        if not session_id:
            raise BadRequestError("sessionId is required")

        if not content_type:
            raise BadRequestError("contentType is required")

        if content_type != "video/mp4":
            raise BadRequestError("Only video/mp4 format is supported")

        if not isinstance(part_count, int) or part_count < 1 or part_count > MAX_MULTIPART_PARTS:
            raise BadRequestError(
                f"partCount must be an integer between 1 and {MAX_MULTIPART_PARTS}"
            )

        if not VIDEO_BUCKET:
            raise InternalServerError("VIDEO_BUCKET environment variable is not set")

        # S3オブジェクトキーの生成（既存のPOST方式と同一の命名規則）
        timestamp = int(time.time())
        video_key = f"videos/{session_id}/{timestamp}_{file_name}"

        logger.info(
            f"マルチパートアップロード開始: bucket={VIDEO_BUCKET}, key={video_key}, "
            f"partCount={part_count}, contentType={content_type}"
        )

        # マルチパートアップロードを開始
        create_response = s3.create_multipart_upload(
            Bucket=VIDEO_BUCKET,
            Key=video_key,
            ContentType=content_type,
        )
        upload_id = create_response["UploadId"]

        # 各パートのアップロード用署名付きURLを生成
        part_urls = []
        for part_number in range(1, part_count + 1):
            url = s3.generate_presigned_url(
                "upload_part",
                Params={
                    "Bucket": VIDEO_BUCKET,
                    "Key": video_key,
                    "UploadId": upload_id,
                    "PartNumber": part_number,
                },
                ExpiresIn=MULTIPART_PRESIGNED_URL_EXPIRY,
            )
            part_urls.append({"partNumber": part_number, "url": url})

        logger.info(
            f"マルチパートアップロードURL生成成功: key={video_key}, "
            f"uploadId={upload_id}, parts={len(part_urls)}"
        )

        return {
            "uploadId": upload_id,
            "videoKey": video_key,
            "partUrls": part_urls,
            "expiresIn": MULTIPART_PRESIGNED_URL_EXPIRY,
        }

    except BadRequestError as e:
        logger.warning(f"Bad request: {str(e)}")
        return {"error": str(e)}, 400

    except InternalServerError as e:
        logger.error(f"Internal server error: {str(e)}")
        return {"error": "Internal server error"}, 500

    except Exception as e:
        logger.error(f"Error creating multipart upload: {str(e)}")
        return {"error": "Failed to create multipart upload"}, 500


# マルチパートアップロード完了
@app.post("/videos/multipart/complete")
def complete_multipart_upload():
    """
    マルチパートアップロードを完了するエンドポイント

    全パートのアップロード完了後、S3に対してパートの結合を指示する。

    リクエストボディ:
    - videoKey: S3バケット内のオブジェクトキー
    - uploadId: マルチパートアップロードID
    - parts: 各パートの情報リスト [{ partNumber, eTag }]

    レスポンス:
    - videoKey: S3バケット内のオブジェクトキー
    - location: アップロード完了したオブジェクトのURL
    """
    try:
        body = app.current_event.json_body or {}

        video_key = body.get("videoKey")
        upload_id = body.get("uploadId")
        parts = body.get("parts")

        # 入力検証
        if not video_key:
            raise BadRequestError("videoKey is required")

        if not upload_id:
            raise BadRequestError("uploadId is required")

        if not isinstance(parts, list) or len(parts) == 0:
            raise BadRequestError("parts must be a non-empty list")

        if not VIDEO_BUCKET:
            raise InternalServerError("VIDEO_BUCKET environment variable is not set")

        # S3が要求する形式に変換（PartNumber昇順でソート）
        multipart_parts = []
        for part in parts:
            part_number = part.get("partNumber")
            etag = part.get("eTag")
            if not isinstance(part_number, int) or not etag:
                raise BadRequestError("Each part must have partNumber (int) and eTag")
            multipart_parts.append({"PartNumber": part_number, "ETag": etag})

        multipart_parts.sort(key=lambda p: p["PartNumber"])

        logger.info(
            f"マルチパートアップロード完了処理: key={video_key}, "
            f"uploadId={upload_id}, parts={len(multipart_parts)}"
        )

        complete_response = s3.complete_multipart_upload(
            Bucket=VIDEO_BUCKET,
            Key=video_key,
            UploadId=upload_id,
            MultipartUpload={"Parts": multipart_parts},
        )

        logger.info(f"マルチパートアップロード完了成功: key={video_key}")

        return {
            "videoKey": video_key,
            "location": complete_response.get("Location", ""),
        }

    except BadRequestError as e:
        logger.warning(f"Bad request: {str(e)}")
        return {"error": str(e)}, 400

    except InternalServerError as e:
        logger.error(f"Internal server error: {str(e)}")
        return {"error": "Internal server error"}, 500

    except Exception as e:
        logger.error(f"Error completing multipart upload: {str(e)}")
        return {"error": "Failed to complete multipart upload"}, 500


# マルチパートアップロード中断
@app.post("/videos/multipart/abort")
def abort_multipart_upload():
    """
    マルチパートアップロードを中断するエンドポイント

    アップロード失敗時に呼び出し、アップロード済みパートを破棄して
    不要なストレージ課金を防ぐ。

    リクエストボディ:
    - videoKey: S3バケット内のオブジェクトキー
    - uploadId: マルチパートアップロードID

    レスポンス:
    - aborted: 中断成功フラグ
    """
    try:
        body = app.current_event.json_body or {}

        video_key = body.get("videoKey")
        upload_id = body.get("uploadId")

        # 入力検証
        if not video_key:
            raise BadRequestError("videoKey is required")

        if not upload_id:
            raise BadRequestError("uploadId is required")

        if not VIDEO_BUCKET:
            raise InternalServerError("VIDEO_BUCKET environment variable is not set")

        logger.info(
            f"マルチパートアップロード中断: key={video_key}, uploadId={upload_id}"
        )

        s3.abort_multipart_upload(
            Bucket=VIDEO_BUCKET,
            Key=video_key,
            UploadId=upload_id,
        )

        logger.info(f"マルチパートアップロード中断成功: key={video_key}")

        return {"aborted": True}

    except BadRequestError as e:
        logger.warning(f"Bad request: {str(e)}")
        return {"error": str(e)}, 400

    except InternalServerError as e:
        logger.error(f"Internal server error: {str(e)}")
        return {"error": "Internal server error"}, 500

    except Exception as e:
        logger.error(f"Error aborting multipart upload: {str(e)}")
        return {"error": "Failed to abort multipart upload"}, 500

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
