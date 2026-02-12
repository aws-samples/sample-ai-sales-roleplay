"""
アバター管理Lambda関数

VRMアバターファイルのCRUD操作と署名付きURL生成を行う。
- POST /avatars - アバターメタデータ登録 + アップロードURL生成
- GET /avatars/{avatarId} - アバター詳細取得
- DELETE /avatars/{avatarId} - アバター削除
- PUT /avatars/{avatarId}/confirm - アップロード完了確認
"""

import json
import os
import re
import uuid
import time
import struct
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig, Response
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
AVATAR_BUCKET = os.environ.get('AVATAR_BUCKET', '')
AVATAR_TABLE = os.environ.get('AVATAR_TABLE', '')
MAX_AVATAR_SIZE_MB = int(os.environ.get('MAX_AVATAR_SIZE_MB', '50'))
DEFAULT_PRESIGNED_URL_EXPIRY = int(os.environ.get('DEFAULT_PRESIGNED_URL_EXPIRY', '600'))
ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', '')

# 許可するContent-Type
ALLOWED_CONTENT_TYPES = {'application/octet-stream', 'model/gltf-binary'}

# CORS設定
cors_config = CORSConfig(
    allow_origin=ALLOWED_ORIGIN or '*',
    allow_headers=['Content-Type', 'Authorization'],
    max_age=300
)
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


@app.post("/avatars")
def create_avatar():
    """アバターメタデータ登録 + アップロード用署名付きURL生成"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return Response(status_code=401, content_type="application/json",
                        body=json.dumps({"success": False, "message": "認証が必要です"}))

    body = app.current_event.json_body or {}
    file_name = body.get('fileName', '')
    content_type = body.get('contentType', 'application/octet-stream')
    avatar_name = body.get('name', file_name)

    if not file_name:
        return Response(status_code=400, content_type="application/json",
                        body=json.dumps({"success": False, "message": "fileNameは必須です"}))

    # CR-004: パストラバーサル防止 — ベースネーム抽出 + 安全な文字のみ許可
    file_name = os.path.basename(file_name)
    if not re.match(r'^[a-zA-Z0-9_\-]+\.vrm$', file_name, re.IGNORECASE):
        return Response(status_code=400, content_type="application/json",
                        body=json.dumps({"success": False, "message": "無効なファイル名です。英数字・ハイフン・アンダースコアのみ使用可能です"}))

    # CR-005: contentTypeホワイトリスト検証 — Stored XSS防止
    if content_type not in ALLOWED_CONTENT_TYPES:
        content_type = 'application/octet-stream'

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
        return Response(status_code=500, content_type="application/json",
                        body=json.dumps({"success": False, "message": "アバターの作成に失敗しました"}))


@app.get("/avatars/<avatar_id>")
def get_avatar(avatar_id: str):
    """アバター詳細取得"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return Response(status_code=401, content_type="application/json",
                        body=json.dumps({"success": False, "message": "認証が必要です"}))

    try:
        response = avatar_table.get_item(Key={'userId': user_id, 'avatarId': avatar_id})
        item = response.get('Item')
        if not item:
            return Response(status_code=404, content_type="application/json",
                            body=json.dumps({"success": False, "message": "アバターが見つかりません"}))

        return {"success": True, "avatar": item}
    except Exception as e:
        logger.error(f"アバター取得エラー: {e}")
        return Response(status_code=500, content_type="application/json",
                        body=json.dumps({"success": False, "message": "アバターの取得に失敗しました"}))


@app.delete("/avatars/<avatar_id>")
def delete_avatar(avatar_id: str):
    """アバター削除（S3 + DynamoDB）"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return Response(status_code=401, content_type="application/json",
                        body=json.dumps({"success": False, "message": "認証が必要です"}))

    try:
        # メタデータ取得
        response = avatar_table.get_item(Key={'userId': user_id, 'avatarId': avatar_id})
        item = response.get('Item')
        if not item:
            return Response(status_code=404, content_type="application/json",
                            body=json.dumps({"success": False, "message": "アバターが見つかりません"}))

        # CR-003: 3段階削除 — ステータス更新→S3削除→DynamoDB削除
        # Step 1: ステータスを 'deleting' に更新（論理削除）
        avatar_table.update_item(
            Key={'userId': user_id, 'avatarId': avatar_id},
            UpdateExpression='SET #s = :s',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':s': 'deleting'},
        )

        # Step 2: S3からファイル削除
        s3_key = item.get('s3Key', '')
        if s3_key:
            s3_client.delete_object(Bucket=AVATAR_BUCKET, Key=s3_key)

        # Step 3: DynamoDBからメタデータ削除
        avatar_table.delete_item(Key={'userId': user_id, 'avatarId': avatar_id})

        return {"success": True, "message": "アバターを削除しました", "avatarId": avatar_id}
    except Exception as e:
        logger.error(f"アバター削除エラー: {e}")
        return Response(status_code=500, content_type="application/json",
                        body=json.dumps({"success": False, "message": "アバターの削除に失敗しました"}))


@app.put("/avatars/<avatar_id>/confirm")
def confirm_upload(avatar_id: str):
    """アップロード完了確認（VRMマジックバイト検証 + ステータスをactiveに更新）"""
    user_id = _get_user_id(app.current_event.raw_event)
    if not user_id:
        return Response(status_code=401, content_type="application/json",
                        body=json.dumps({"success": False, "message": "認証が必要です"}))

    try:
        # 存在確認 + 所有者確認
        response = avatar_table.get_item(Key={'userId': user_id, 'avatarId': avatar_id})
        item = response.get('Item')
        if not item:
            return Response(status_code=404, content_type="application/json",
                            body=json.dumps({"success": False, "message": "アバターが見つかりません"}))

        if item.get('status') != 'uploading':
            return Response(status_code=409, content_type="application/json",
                            body=json.dumps({"success": False, "message": "確認済みのアバターです"}))

        # VRMファイル検証（glTF 2.0 Binary形式）
        # 検証項目:
        #   1. マジックバイト: 先頭4バイトが "glTF" (0x676C5446)
        #   2. glTFバージョン: バイト4-7がリトルエンディアンで2（glTF 2.0）
        #   3. ファイルサイズ: S3オブジェクトサイズが上限以内
        s3_key = item.get('s3Key', '')
        if s3_key:
            try:
                # S3オブジェクトサイズを検証
                head_obj = s3_client.head_object(Bucket=AVATAR_BUCKET, Key=s3_key)
                file_size = head_obj.get('ContentLength', 0)
                max_size = MAX_AVATAR_SIZE_MB * 1024 * 1024
                if file_size > max_size:
                    logger.warning(f"VRMファイルサイズ超過: {file_size} bytes > {max_size} bytes (avatarId={avatar_id})")
                    s3_client.delete_object(Bucket=AVATAR_BUCKET, Key=s3_key)
                    avatar_table.delete_item(Key={'userId': user_id, 'avatarId': avatar_id})
                    return Response(status_code=400, content_type="application/json",
                                    body=json.dumps({"success": False, "message": f"ファイルサイズが上限（{MAX_AVATAR_SIZE_MB}MB）を超えています"}))

                # glTFヘッダー検証（先頭12バイト: magic[4] + version[4] + length[4]）
                header_response = s3_client.get_object(
                    Bucket=AVATAR_BUCKET,
                    Key=s3_key,
                    Range='bytes=0-11'
                )
                header_bytes = header_response['Body'].read(12)

                if len(header_bytes) < 12:
                    logger.warning(f"VRMファイルが小さすぎます: {len(header_bytes)} bytes (avatarId={avatar_id})")
                    s3_client.delete_object(Bucket=AVATAR_BUCKET, Key=s3_key)
                    avatar_table.delete_item(Key={'userId': user_id, 'avatarId': avatar_id})
                    return Response(status_code=400, content_type="application/json",
                                    body=json.dumps({"success": False, "message": "無効なVRMファイルです。ファイルが破損している可能性があります"}))

                # マジックバイト検証
                magic = header_bytes[0:4]
                if magic != b'glTF':
                    logger.warning(f"無効なVRMファイル: マジックバイト不一致 (avatarId={avatar_id})")
                    s3_client.delete_object(Bucket=AVATAR_BUCKET, Key=s3_key)
                    avatar_table.delete_item(Key={'userId': user_id, 'avatarId': avatar_id})
                    return Response(status_code=400, content_type="application/json",
                                    body=json.dumps({"success": False, "message": "無効なVRMファイルです。glTF形式のファイルをアップロードしてください"}))

                # glTFバージョン検証（リトルエンディアン uint32、VRMはglTF 2.0必須）
                version = struct.unpack('<I', header_bytes[4:8])[0]
                if version != 2:
                    logger.warning(f"非対応glTFバージョン: {version} (avatarId={avatar_id})")
                    s3_client.delete_object(Bucket=AVATAR_BUCKET, Key=s3_key)
                    avatar_table.delete_item(Key={'userId': user_id, 'avatarId': avatar_id})
                    return Response(status_code=400, content_type="application/json",
                                    body=json.dumps({"success": False, "message": "非対応のglTFバージョンです。glTF 2.0形式のVRMファイルをアップロードしてください"}))

            except s3_client.exceptions.NoSuchKey:
                return Response(status_code=404, content_type="application/json",
                                body=json.dumps({"success": False, "message": "ファイルが見つかりません。再度アップロードしてください"}))
            except ClientError as e:
                # CR-012: S3の一時的障害時はファイルを削除せず、リトライ可能なエラーとして返す
                logger.error(f'VRMファイル検証中のS3エラー: {e} (avatarId={avatar_id})')
                return Response(status_code=503, content_type="application/json",
                                body=json.dumps({"success": False, "message": "ファイル検証中にエラーが発生しました。しばらく後に再試行してください"}))

        avatar_table.update_item(
            Key={'userId': user_id, 'avatarId': avatar_id},
            UpdateExpression='SET #s = :s, updatedAt = :t',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':s': 'active', ':t': int(time.time()), ':uploading': 'uploading'},
            ConditionExpression='attribute_exists(userId) AND #s = :uploading',
        )
        return {"success": True, "message": "アップロード確認完了", "avatarId": avatar_id}
    except Exception as e:
        logger.error(f"アップロード確認エラー: {e}")
        return Response(status_code=500, content_type="application/json",
                        body=json.dumps({"success": False, "message": "アップロード確認に失敗しました"}))


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    """Lambda関数のエントリーポイント"""
    return app.resolve(event, context)
