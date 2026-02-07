"""
アバター管理Lambda関数

VRMアバターファイルのCRUD操作と署名付きURL生成を行う。
- GET /avatars - ユーザーのアバター一覧取得
- POST /avatars - アバターメタデータ登録 + アップロードURL生成
- GET /avatars/{avatarId} - アバター詳細取得
- DELETE /avatars/{avatarId} - アバター削除
- GET /avatars/{avatarId}/download-url - ダウンロード用署名付きURL生成
"""

import json
import os
import uuid
import time
import boto3
from botocore.config import Config
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
AVATAR_BUCKET = os.environ.get('AVATAR_BUCKET', '')
AVATAR_TABLE = os.environ.get('AVATAR_TABLE', '')
MAX_AVATAR_SIZE_MB = int(os.environ.get('MAX_AVATAR_SIZE_MB', '50'))
DEFAULT_PRESIGNED_URL_EXPIRY = int(os.environ.get('DEFAULT_PRESIGNED_URL_EXPIRY', '600'))

# CORS設定
cors_config = CORSConfig(allow_origin="*", allow_headers=["*"], max_age=300)
app = APIGatewayRestResolver(cors=cors_config)
logger = Logger(service="avatars-api")

# AWSクライアント
s3_client = boto3.client(
    's3',
    region_name=os.environ.get('AWS_REGION'),
    config=Config(
        signature_version='s3v4',
        s3={'addressing_style': 'virtual'},
        retries={'max_attempts': 3}
    )
) if AVATAR_BUCKET else None

dynamodb = boto3.resource('dynamodb')
avatar_table = dynamodb.Table(AVATAR_TABLE) if AVATAR_TABLE else None


def _get_user_id(event):
    """CognitoトークンからユーザーIDを取得"""
    try:
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        return claims.get('sub', '')
    except Exception:
        return ''


@app.get("/avatars")
def list_avatars():
    """ユーザーのアバター一覧を取得"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return {"success": False, "message": "認証が必要です"}, 401

    try:
        response = avatar_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('userId').eq(user_id)
        )
        avatars = response.get('Items', [])

        return {
            "success": True,
            "avatars": avatars,
            "count": len(avatars)
        }
    except Exception as e:
        logger.error(f"アバター一覧取得エラー: {e}")
        return {"success": False, "message": "アバター一覧の取得に失敗しました"}, 500


@app.post("/avatars")
def create_avatar():
    """アバターメタデータ登録 + アップロード用署名付きURL生成"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return {"success": False, "message": "認証が必要です"}, 401

    body = app.current_event.json_body or {}
    file_name = body.get('fileName', '')
    content_type = body.get('contentType', 'application/octet-stream')
    avatar_name = body.get('name', file_name)

    if not file_name:
        return {"success": False, "message": "fileNameは必須です"}, 400

    # VRMファイルのみ許可
    if not file_name.lower().endswith('.vrm'):
        return {"success": False, "message": "VRMファイルのみアップロード可能です"}, 400

    avatar_id = str(uuid.uuid4())
    s3_key = f"avatars/{user_id}/{avatar_id}/{file_name}"
    timestamp = int(time.time())

    try:
        # 署名付きアップロードURL生成（POST形式）
        presigned_post = s3_client.generate_presigned_post(
            Bucket=AVATAR_BUCKET,
            Key=s3_key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, MAX_AVATAR_SIZE_MB * 1024 * 1024],
            ],
            ExpiresIn=DEFAULT_PRESIGNED_URL_EXPIRY,
        )

        # DynamoDBにメタデータ保存
        item = {
            'userId': user_id,
            'avatarId': avatar_id,
            'name': avatar_name,
            'fileName': file_name,
            's3Key': s3_key,
            'contentType': content_type,
            'status': 'uploading',
            'createdAt': timestamp,
            'updatedAt': timestamp,
        }
        avatar_table.put_item(Item=item)

        return {
            "success": True,
            "avatarId": avatar_id,
            "uploadUrl": presigned_post['url'],
            "formData": presigned_post['fields'],
            "avatar": item,
        }
    except Exception as e:
        logger.error(f"アバター作成エラー: {e}")
        return {"success": False, "message": "アバターの作成に失敗しました"}, 500


@app.get("/avatars/<avatar_id>")
def get_avatar(avatar_id: str):
    """アバター詳細取得"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return {"success": False, "message": "認証が必要です"}, 401

    try:
        response = avatar_table.get_item(Key={'userId': user_id, 'avatarId': avatar_id})
        item = response.get('Item')
        if not item:
            return {"success": False, "message": "アバターが見つかりません"}, 404

        return {"success": True, "avatar": item}
    except Exception as e:
        logger.error(f"アバター取得エラー: {e}")
        return {"success": False, "message": "アバターの取得に失敗しました"}, 500


@app.delete("/avatars/<avatar_id>")
def delete_avatar(avatar_id: str):
    """アバター削除（S3 + DynamoDB）"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return {"success": False, "message": "認証が必要です"}, 401

    try:
        # メタデータ取得
        response = avatar_table.get_item(Key={'userId': user_id, 'avatarId': avatar_id})
        item = response.get('Item')
        if not item:
            return {"success": False, "message": "アバターが見つかりません"}, 404

        # S3からファイル削除
        s3_key = item.get('s3Key', '')
        if s3_key:
            s3_client.delete_object(Bucket=AVATAR_BUCKET, Key=s3_key)

        # DynamoDBからメタデータ削除
        avatar_table.delete_item(Key={'userId': user_id, 'avatarId': avatar_id})

        return {"success": True, "message": "アバターを削除しました", "avatarId": avatar_id}
    except Exception as e:
        logger.error(f"アバター削除エラー: {e}")
        return {"success": False, "message": "アバターの削除に失敗しました"}, 500


@app.get("/avatars/<avatar_id>/download-url")
def get_download_url(avatar_id: str):
    """ダウンロード用署名付きURL生成"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return {"success": False, "message": "認証が必要です"}, 401

    try:
        response = avatar_table.get_item(Key={'userId': user_id, 'avatarId': avatar_id})
        item = response.get('Item')
        if not item:
            return {"success": False, "message": "アバターが見つかりません"}, 404

        s3_key = item.get('s3Key', '')
        download_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': AVATAR_BUCKET, 'Key': s3_key},
            ExpiresIn=DEFAULT_PRESIGNED_URL_EXPIRY,
        )

        # ステータスをactiveに更新（初回ダウンロード時）
        if item.get('status') == 'uploading':
            avatar_table.update_item(
                Key={'userId': user_id, 'avatarId': avatar_id},
                UpdateExpression='SET #s = :s, updatedAt = :t',
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues={':s': 'active', ':t': int(time.time())},
            )

        return {
            "success": True,
            "downloadUrl": download_url,
            "avatarId": avatar_id,
            "expiresIn": DEFAULT_PRESIGNED_URL_EXPIRY,
        }
    except Exception as e:
        logger.error(f"ダウンロードURL生成エラー: {e}")
        return {"success": False, "message": "ダウンロードURLの生成に失敗しました"}, 500


@app.put("/avatars/<avatar_id>/confirm")
def confirm_upload(avatar_id: str):
    """アップロード完了確認（ステータスをactiveに更新）"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return {"success": False, "message": "認証が必要です"}, 401

    try:
        # 存在確認 + 所有者確認
        response = avatar_table.get_item(Key={'userId': user_id, 'avatarId': avatar_id})
        item = response.get('Item')
        if not item:
            return {"success": False, "message": "アバターが見つかりません"}, 404

        if item.get('status') != 'uploading':
            return {"success": False, "message": "確認済みのアバターです"}, 409

        avatar_table.update_item(
            Key={'userId': user_id, 'avatarId': avatar_id},
            UpdateExpression='SET #s = :s, updatedAt = :t',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':s': 'active', ':t': int(time.time())},
            ConditionExpression='attribute_exists(userId)',
        )
        return {"success": True, "message": "アップロード確認完了", "avatarId": avatar_id}
    except Exception as e:
        logger.error(f"アップロード確認エラー: {e}")
        return {"success": False, "message": "アップロード確認に失敗しました"}, 500


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    """Lambda関数のエントリーポイント"""
    return app.resolve(event, context)
