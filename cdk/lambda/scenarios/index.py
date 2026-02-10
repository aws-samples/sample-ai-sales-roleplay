"""
シナリオ管理Lambda関数

このモジュールは、ユーザーシナリオを管理するLambda関数を実装します。
主な機能は以下の通りです：
- シナリオ一覧の取得 (/scenarios)
- シナリオ詳細の取得 (/scenarios/{scenarioId})
- シナリオ作成 (/scenarios) - POST
- シナリオ更新 (/scenarios/{scenarioId}) - PUT
- シナリオ削除 (/scenarios/{scenarioId}) - DELETE
- シナリオ共有設定 (/scenarios/{scenarioId}/share) - POST
- PDFおよびメタデータファイルアップロード用署名付きURL発行 (/scenarios/{scenarioId}/pdf-upload-url) - POST

環境変数:
- SCENARIOS_TABLE: シナリオ情報を格納するDynamoDBテーブル名
- PDF_BUCKET: PDF保存用S3バケット名
"""

import json
import os
import boto3
from botocore.config import Config
import uuid
import time
import urllib.parse
from datetime import datetime
from decimal import Decimal
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.event_handler.exceptions import (
    InternalServerError, NotFoundError, BadRequestError
)

# Powertools ロガー設定
logger = Logger(service="scenarios-api")

# CORS設定 - 開発環境では全てのオリジンを許可
cors_config = CORSConfig(
    allow_origin="*",  # 本番環境では特定のドメインに限定
    max_age=300,
    allow_headers=["Content-Type", "Authorization", "X-Api-Key", "X-Amz-Security-Token", "X-Amz-Date"],
    allow_credentials=True  # 認証情報を許可
)

# APIGatewayRestResolverの初期化
app = APIGatewayRestResolver(cors=cors_config)

# 環境変数
SCENARIOS_TABLE = os.environ.get('SCENARIOS_TABLE')
PDF_BUCKET = os.environ.get('PDF_BUCKET')
KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID')

# DynamoDB クライアント
dynamodb = boto3.resource('dynamodb')
scenarios_table = dynamodb.Table(SCENARIOS_TABLE)

# S3クライアント（PDF保存用） - リージョン指定と署名バージョン設定
if PDF_BUCKET:
    s3_client = boto3.client(
        's3',
        region_name=os.environ.get('AWS_REGION'),  # Lambda実行リージョンを自動取得
        config=Config(
            signature_version='s3v4',  # 署名バージョンv4を明示指定
            s3={'addressing_style': 'virtual'},  # virtual-hosted-style URLを使用
            retries={'max_attempts': 3}  # リトライ設定
        )
    )
    logger.info(f"S3クライアント初期化完了: region={os.environ.get('AWS_REGION')}")
else:
    s3_client = None

# Bedrock Agentクライアント（Knowledge Base ingestion用）
bedrock_agent_client = boto3.client('bedrock-agent') if KNOWLEDGE_BASE_ID else None

dynamodb = boto3.resource('dynamodb')
scenarios_table = None

def init_tables():
    """
    DynamoDBテーブルのリソースを初期化
    """
    global scenarios_table
    
    if SCENARIOS_TABLE:
        scenarios_table = dynamodb.Table(SCENARIOS_TABLE)
        logger.info(f"DynamoDBテーブルを初期化しました: {SCENARIOS_TABLE}")
    else:
        logger.error("SCENARIOS_TABLE環境変数が設定されていません")

# テーブルの初期化
init_tables()

def convert_decimal_to_json_serializable(obj):
    """
    DynamoDBのDecimal型をJSONシリアライズ可能な形式に変換する
    
    Args:
        obj: 変換対象のオブジェクト
        
    Returns:
        JSONシリアライズ可能なオブジェクト
    """
    if isinstance(obj, Decimal):
        # Decimalを適切な数値型に変換
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    elif isinstance(obj, dict):
        return {key: convert_decimal_to_json_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimal_to_json_serializable(item) for item in obj]
    else:
        return obj


# ユーザー認証からユーザーIDを取得するヘルパー関数
def get_user_id_from_token():
    """
    リクエストの認証トークンからユーザーIDを取得
    
    Returns:
        str: ユーザーID、または認証されていない場合はNone
    """
    try:
        # APIGatewayからの認証情報を取得
        event = app.current_event.raw_event
        if "requestContext" in event and "authorizer" in event["requestContext"]:
            authorizer = event["requestContext"]["authorizer"]
            if "claims" in authorizer:
                # Cognito認証の場合はcognito:usernameまたはsub
                if "cognito:username" in authorizer["claims"]:
                    return authorizer["claims"]["cognito:username"]
                elif "sub" in authorizer["claims"]:
                    return authorizer["claims"]["sub"]
        
        # テスト環境またはheaderから取得（開発環境用）
        if app.current_event.headers and "x-user-id" in app.current_event.headers:
            return app.current_event.headers["x-user-id"]
            
        return None
    except Exception as e:
        logger.warning("ユーザーID取得エラー", extra={"error": str(e)})
        return None


def check_scenario_id_exists(scenario_id: str) -> bool:
    """
    指定されたシナリオIDが既に存在するかをチェックする
    
    Args:
        scenario_id (str): チェック対象のシナリオID
        
    Returns:
        bool: 存在する場合はTrue、存在しない場合はFalse
        
    Raises:
        InternalServerError: DynamoDBアクセスエラーの場合
    """
    if not scenarios_table:
        raise InternalServerError("シナリオテーブルが初期化されていません")
    
    try:
        response = scenarios_table.get_item(
            Key={'scenarioId': scenario_id}
        )
        return 'Item' in response
    except Exception as e:
        logger.error(f"シナリオID存在チェックエラー: {str(e)}")
        raise InternalServerError("シナリオIDの存在チェック中にエラーが発生しました")


def validate_and_check_scenario_id(scenario_id: str, exclude_id: str = None) -> None:
    """
    シナリオIDのバリデーションと重複チェックを実行する
    
    Args:
        scenario_id (str): チェック対象のシナリオID
        exclude_id (str, optional): 重複チェックから除外するID（更新時に使用）
        
    Raises:
        BadRequestError: バリデーションエラーまたは重複エラーの場合
        InternalServerError: システムエラーの場合
    """
    import re
    
    # フォーマットバリデーション
    if not re.match(r'^[a-zA-Z0-9-]+$', scenario_id):
        raise BadRequestError("シナリオIDは英数字とハイフンのみ使用できます")
    if len(scenario_id) > 50:
        raise BadRequestError("シナリオIDは50文字以内で入力してください")
    
    # 重複チェック（exclude_idが指定されている場合は、そのIDは除外）
    if exclude_id != scenario_id and check_scenario_id_exists(scenario_id):
        raise BadRequestError(f"シナリオID '{scenario_id}' は既に使用されています。別のIDを指定してください")


def start_knowledge_base_ingestion():
    """
    Knowledge BaseのData Sourceに対してingestion jobを開始する
    
    Returns:
        dict: ingestion job開始結果
    """
    if not KNOWLEDGE_BASE_ID or not bedrock_agent_client:
        logger.warning("KNOWLEDGE_BASE_IDまたはbedrock_agent_clientが設定されていません。ingestion jobをスキップします。")
        return {"status": "skipped", "reason": "Knowledge Base設定なし"}
    
    try:
        logger.info(f"Knowledge Base ingestion job開始: knowledge_base_id={KNOWLEDGE_BASE_ID}")
        
        # Knowledge BaseのData Sourceリストを取得
        list_response = bedrock_agent_client.list_data_sources(
            knowledgeBaseId=KNOWLEDGE_BASE_ID
        )
        
        data_sources = list_response.get('dataSourceSummaries', [])
        if not data_sources:
            logger.warning(f"Knowledge Base {KNOWLEDGE_BASE_ID} にData Sourceが見つかりません")
            return {"status": "skipped", "reason": "Data Sourceなし"}
        
        ingestion_results = []
        
        # 各Data Sourceに対してingestion jobを開始
        for data_source in data_sources:
            data_source_id = data_source['dataSourceId']
            data_source_name = data_source.get('name', 'Unknown')
            data_source_status = data_source.get('status', 'Unknown')
            
            logger.info(f"Data Source処理開始: id={data_source_id}, name={data_source_name}, status={data_source_status}")
            
            # Data SourceがAVAILABLE状態の場合のみingestion jobを開始
            if data_source_status == 'AVAILABLE':
                try:
                    ingestion_response = bedrock_agent_client.start_ingestion_job(
                        knowledgeBaseId=KNOWLEDGE_BASE_ID,
                        dataSourceId=data_source_id,
                        description=f"シナリオ更新によるingestion job - {datetime.utcnow().isoformat()}"
                    )
                    
                    ingestion_job = ingestion_response.get('ingestionJob', {})
                    ingestion_job_id = ingestion_job.get('ingestionJobId')
                    ingestion_status = ingestion_job.get('status')
                    
                    logger.info(f"Ingestion job開始成功: data_source_id={data_source_id}, job_id={ingestion_job_id}, status={ingestion_status}")
                    
                    ingestion_results.append({
                        "dataSourceId": data_source_id,
                        "dataSourceName": data_source_name,
                        "ingestionJobId": ingestion_job_id,
                        "status": ingestion_status,
                        "success": True
                    })
                    
                except Exception as ingestion_error:
                    logger.error(f"Ingestion job開始失敗: data_source_id={data_source_id}, error={str(ingestion_error)}")
                    ingestion_results.append({
                        "dataSourceId": data_source_id,
                        "dataSourceName": data_source_name,
                        "error": str(ingestion_error),
                        "success": False
                    })
            else:
                logger.warning(f"Data Sourceが利用不可状態のためスキップ: id={data_source_id}, status={data_source_status}")
                ingestion_results.append({
                    "dataSourceId": data_source_id,
                    "dataSourceName": data_source_name,
                    "status": data_source_status,
                    "success": False,
                    "reason": "Data Source利用不可"
                })
        
        successful_jobs = [r for r in ingestion_results if r.get('success')]
        failed_jobs = [r for r in ingestion_results if not r.get('success')]
        
        logger.info(f"Ingestion job開始完了: 成功={len(successful_jobs)}, 失敗={len(failed_jobs)}")
        
        return {
            "status": "completed",
            "successful": len(successful_jobs),
            "failed": len(failed_jobs),
            "results": ingestion_results
        }
        
    except Exception as e:
        logger.error(f"Knowledge Base ingestion job開始中にエラーが発生しました: {str(e)}")
        return {
            "status": "error",
            "error": str(e)
        }


def delete_scenario_s3_files(scenario_id: str, scenario_data: dict = None) -> tuple:
    """
    シナリオに関連するS3ファイルを削除する
    
    Args:
        scenario_id (str): シナリオID
        scenario_data (dict, optional): シナリオデータ（PDFファイル情報を含む）
        
    Returns:
        tuple: (削除されたファイルのリスト, 削除に失敗したファイルのリスト)
    """
    deleted_files = []
    failed_deletions = []
    
    if not PDF_BUCKET or not s3_client:
        logger.warning("PDF_BUCKETまたはs3_clientが設定されていません。S3削除をスキップします。")
        return deleted_files, failed_deletions
    
    try:
        objects_to_delete = []
        
        # S3のプレフィックスを使用してシナリオフォルダ内のすべてのオブジェクトを取得
        s3_prefix = f"scenarios/{scenario_id}/"
        logger.info(f"S3からPDFファイルを削除開始: bucket={PDF_BUCKET}, prefix={s3_prefix}")
        
        list_response = s3_client.list_objects_v2(
            Bucket=PDF_BUCKET,
            Prefix=s3_prefix
        )
        
        if 'Contents' in list_response:
            logger.info(f"S3から発見されたファイル: {len(list_response['Contents'])}件")
            for obj in list_response['Contents']:
                obj_key = {'Key': obj['Key']}
                if obj_key not in objects_to_delete:
                    objects_to_delete.append(obj_key)
                    logger.debug(f"削除対象ファイル（S3から）: {obj['Key']}")
        
        # ファイルが存在する場合は削除を実行
        if objects_to_delete:
            logger.info(f"合計削除対象ファイル数: {len(objects_to_delete)}")
            
            # 一括削除を実行
            delete_response = s3_client.delete_objects(
                Bucket=PDF_BUCKET,
                Delete={
                    'Objects': objects_to_delete,
                    'Quiet': False
                }
            )
            
            # 削除結果を記録
            if 'Deleted' in delete_response:
                for deleted in delete_response['Deleted']:
                    deleted_files.append(deleted['Key'])
                    logger.info(f"S3ファイル削除成功: {deleted['Key']}")
            
            if 'Errors' in delete_response:
                for error in delete_response['Errors']:
                    failed_deletions.append({
                        'key': error['Key'],
                        'code': error['Code'],
                        'message': error['Message']
                    })
                    logger.error(f"S3ファイル削除失敗: {error['Key']}, エラー: {error['Code']} - {error['Message']}")
        else:
            logger.info(f"削除対象のPDFファイルが見つかりませんでした: {s3_prefix}")
            
    except Exception as s3_error:
        logger.error(f"S3ファイル削除中にエラーが発生しました: {str(s3_error)}")
        failed_deletions.append({
            'error': str(s3_error),
            'message': 'S3削除処理中にエラーが発生しました'
        })
    
    return deleted_files, failed_deletions

@app.get("/scenarios")
def get_scenarios():
    """
    シナリオ一覧を取得

    クエリパラメータ:
    - category: カテゴリでフィルタ
    - difficulty: 難易度でフィルタ 
    - limit: 取得する最大件数 (デフォルト: 20)
    - nextToken: 次ページのトークン
    - visibility: 公開設定でフィルタ (public, private, shared, all)
    - includeShared: 共有されているシナリオも含める (true/false)

    Returns:
        dict: シナリオ一覧と次ページトークン
    """
    try:
        logger.info("シナリオ一覧取得処理を開始")
        # クエリパラメータ
        query_params = app.current_event.query_string_parameters or {}
        logger.info(f"リクエストクエリパラメータ: {query_params}")
        
        limit = int(query_params.get('limit', 20))
        next_token = query_params.get('nextToken')
        category = query_params.get('category')
        difficulty = query_params.get('difficulty')
        visibility = query_params.get('visibility')
        include_shared = query_params.get('includeShared', 'false').lower() == 'true'
        
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        logger.info(f"認証済みユーザーID: {user_id}")
        
        # クエリパラメータのバリデーション
        if limit < 1 or limit > 100:
            limit = 20  # デフォルト値に設定
        
        if scenarios_table:
            # カテゴリと難易度の両方が指定されている場合
            if category and difficulty:
                # CategoryIndexを使用してクエリ
                query_params = {
                    'IndexName': 'CategoryIndex',
                    'KeyConditionExpression': 'category = :cat AND difficulty = :diff',
                    'ExpressionAttributeValues': {
                        ':cat': category,
                        ':diff': difficulty
                    },
                    'Limit': limit
                }
                
                # ページネーショントークンの追加
                if next_token:
                    query_params['ExclusiveStartKey'] = json.loads(next_token)
                    
                response = scenarios_table.query(**query_params)
                
            # カテゴリのみが指定されている場合
            elif category:
                # CategoryIndexを使用してクエリ
                query_params = {
                    'IndexName': 'CategoryIndex',
                    'KeyConditionExpression': 'category = :cat',
                    'ExpressionAttributeValues': {
                        ':cat': category
                    },
                    'Limit': limit
                }
                
                # ページネーショントークンの追加
                if next_token:
                    query_params['ExclusiveStartKey'] = json.loads(next_token)
                    
                response = scenarios_table.query(**query_params)
                
            # フィルタなしの場合はスキャン
            else:
                logger.info("フィルタなしのシナリオ一覧取得を実行")
                logger.info(f"ユーザーID: {user_id}, 難易度: {difficulty}, 公開設定: {visibility}, 共有含む: {include_shared}")
                
                scan_params = {
                    'Limit': limit
                }
                
                filter_expressions = []
                expression_attribute_values = {}
                
                # 難易度でフィルタリング
                if difficulty:
                    filter_expressions.append('difficulty = :diff')
                    expression_attribute_values[':diff'] = difficulty
                
                # 公開範囲でフィルタリング
                if visibility:
                    if visibility == 'public':
                        filter_expressions.append('visibility = :vis')
                        expression_attribute_values[':vis'] = 'public'
                    elif visibility == 'private' and user_id:
                        filter_expressions.append('createdBy = :uid AND visibility = :vis')
                        expression_attribute_values[':uid'] = user_id
                        expression_attribute_values[':vis'] = 'private'
                    elif visibility == 'shared' and user_id:
                        filter_expressions.append('(visibility = :shared AND contains(sharedWithUsers, :uid)) OR (createdBy = :uid AND visibility = :shared)')
                        expression_attribute_values[':shared'] = 'shared'
                        expression_attribute_values[':uid'] = user_id
                elif user_id:
                    # ユーザーが見ることができるシナリオをすべて返す
                    # 1. 公開シナリオ (public)
                    # 2. 自分のシナリオ (createdBy = user_id)
                    # 3. 共有シナリオ (shared + ユーザーIDが共有リストに含まれる)
                    filter_expressions.append('(visibility = :public) OR (createdBy = :uid) OR (visibility = :shared AND contains(sharedWithUsers, :uid))')
                    expression_attribute_values[':public'] = 'public'
                    expression_attribute_values[':shared'] = 'shared'
                    expression_attribute_values[':uid'] = user_id
                else:
                    # 未認証ユーザーは公開シナリオのみ表示
                    filter_expressions.append('visibility = :public')
                    expression_attribute_values[':public'] = 'public'
                
                # フィルター式を構築
                if filter_expressions:
                    scan_params['FilterExpression'] = ' AND '.join(filter_expressions)
                    scan_params['ExpressionAttributeValues'] = expression_attribute_values
                
                # ページネーショントークンの追加
                if next_token:
                    scan_params['ExclusiveStartKey'] = json.loads(next_token)
                
                logger.info(f"DynamoDB scanパラメータ: {scan_params}")
                response = scenarios_table.scan(**scan_params)
                logger.info(f"DynamoDB scanレスポンス: 件数={len(response.get('Items', []))}, LastEvaluatedKey={response.get('LastEvaluatedKey') is not None}")
            
            # レスポンス用のシナリオリストを作成
            scenarios = []
            for item in response.get('Items', []):
                # レスポンス用に必要なフィールドを抽出（完全版）
                scenario = {
                    'scenarioId': item.get('scenarioId'),
                    'title': item.get('title'),
                    'description': item.get('description'),
                    'difficulty': item.get('difficulty'),
                    'category': item.get('category')
                }
                
                # 初期メッセージを追加
                if 'initialMessage' in item:
                    scenario['initialMessage'] = item.get('initialMessage')
                    
                # 言語設定を追加
                if 'language' in item:
                    scenario['language'] = item.get('language')
                
                # NPC情報を完全に追加
                if 'npc' in item:
                    scenario['npcInfo'] = {
                        'id': item['npc'].get('id'),
                        'name': item['npc'].get('name'),
                        'role': item['npc'].get('role'),
                        'company': item['npc'].get('company'),
                        'personality': item['npc'].get('personality', []),
                        'avatar': item['npc'].get('avatar'),
                        'description': item['npc'].get('description')
                    }
                
                # goals情報を追加
                if 'goals' in item:
                    scenario['goals'] = item['goals']
                
                # objectives情報を追加
                if 'objectives' in item:
                    scenario['objectives'] = item['objectives']
                
                # initialMetrics情報を追加
                if 'initialMetrics' in item:
                    scenario['initialMetrics'] = item['initialMetrics']
                
                # 業界情報（industry）を追加
                if 'industry' in item:
                    scenario['industry'] = item['industry']
                
                # オーナー情報を追加（フロントエンドでのオーナー判定用）
                if 'createdBy' in item:
                    scenario['createdBy'] = item.get('createdBy')
                
                # カスタムシナリオフラグを追加
                if 'isCustom' in item:
                    scenario['isCustom'] = item.get('isCustom')
                
                # 公開設定を追加
                if 'visibility' in item:
                    scenario['visibility'] = item.get('visibility')
                
                # 作成日時・更新日時を追加
                if 'createdAt' in item:
                    scenario['createdAt'] = item.get('createdAt')
                if 'updatedAt' in item:
                    scenario['updatedAt'] = item.get('updatedAt')
                
                scenarios.append(scenario)
            
            # 次ページのトークン
            next_token = None
            if 'LastEvaluatedKey' in response:
                next_token = json.dumps(response['LastEvaluatedKey'])
            
            result = {
                'scenarios': scenarios,
                'nextToken': next_token
            }
            
            # デバッグ用: オーナー情報が含まれているシナリオの数をログ出力
            scenarios_with_owner = [s for s in scenarios if 'createdBy' in s]
            custom_scenarios = [s for s in scenarios if s.get('isCustom')]
            logger.info(f"シナリオ一覧取得結果: シナリオ数={len(scenarios)}, オーナー情報有り={len(scenarios_with_owner)}, カスタムシナリオ={len(custom_scenarios)}, 次ページトークン有無={next_token is not None}")
            
            return result
        else:
            logger.error("シナリオテーブル未定義", extra={"table_name": SCENARIOS_TABLE})
            raise InternalServerError("システムエラーが発生しました")
            
    except Exception as e:
        logger.exception("シナリオ一覧取得エラー", extra={"error": str(e)})
        raise InternalServerError(f"シナリオ一覧の取得中にエラーが発生しました: {str(e)}")

@app.get("/scenarios/<scenario_id>")
def get_scenario(scenario_id: str):
    """
    特定のシナリオの詳細を取得

    Args:
        scenario_id (str): シナリオID

    Returns:
        dict: シナリオ詳細情報
    """
    try:
        # パラメータのバリデーション
        if not scenario_id:
            raise BadRequestError("シナリオIDが指定されていません")
        
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        
        # シナリオ情報の取得
        if scenarios_table:
            response = scenarios_table.get_item(
                Key={
                    'scenarioId': scenario_id
                }
            )
            
            # シナリオが存在するかチェック
            if 'Item' not in response:
                raise NotFoundError(f"シナリオが見つかりません: {scenario_id}")
            
            item = response['Item']
            
            # initialMessageフィールドがitemに含まれている場合、それをシナリオに追加
            if 'initialMessage' in item:
                # そのまま返さずに変更を加える必要がある場合はここで処理
                pass
            
            # Decimal型の値をJSON互換形式に変換して返す
            scenario = convert_decimal_to_json_serializable(item)
            
            # オーナー情報が含まれていることを確認（デバッグ用ログ）
            logger.info(f"シナリオ詳細取得: scenarioId={scenario_id}, createdBy={scenario.get('createdBy')}, isCustom={scenario.get('isCustom')}")
            
            # アクセス権チェック
            visibility = scenario.get('visibility', 'public')  # デフォルトは公開
            
            if visibility == 'private' and scenario.get('createdBy') != user_id:
                # 非公開シナリオは作成者のみアクセス可能
                raise BadRequestError("このシナリオへのアクセス権がありません")
            elif visibility == 'shared':
                # 共有シナリオは、作成者または共有先ユーザーのみアクセス可能
                shared_with_users = scenario.get('sharedWithUsers', [])
                if scenario.get('createdBy') != user_id and user_id not in shared_with_users:
                    raise BadRequestError("このシナリオへのアクセス権がありません")
            return scenario
        else:
            logger.error("シナリオテーブル未定義", extra={"table_name": SCENARIOS_TABLE})
            raise InternalServerError("システムエラーが発生しました")
            
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except Exception as e:
        logger.exception("シナリオ詳細取得エラー", extra={"error": str(e), "scenario_id": scenario_id})
        raise InternalServerError(f"シナリオ詳細の取得中にエラーが発生しました: {str(e)}")

# シナリオ作成API
@app.post("/scenarios")
def create_scenario():
    """
    新しいシナリオを作成
    
    リクエストボディ:
    - scenarioId: シナリオID
    - title: シナリオのタイトル
    - description: シナリオの説明
    - difficulty: 難易度
    - category: カテゴリ
    - npc: NPC情報
    - visibility: 公開設定 ('public', 'private', 'shared')
    - sharedWithUsers: 共有先ユーザーID配列（visibilityが'shared'の場合）
    - guardrail: ガードレールの名前
    - language: 言語
    - initialMessage: NPCの初期メッセージ
    - maxTurns: 最大ターン数 (optional)
    - pdfFiles: PDF資料情報 (optional)
    
    Returns:
        dict: 作成されたシナリオ情報
    """
    try:
        # リクエストボディからデータを取得
        try:
            body = app.current_event.json_body
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"JSONパースエラー: {str(e)}")
            raise BadRequestError("無効なJSONリクエストです")
        
        if not body:
            raise BadRequestError("リクエストボディが必要です")
        logger.debug(f"body: {body}")
        
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        if not user_id:
            raise BadRequestError("認証されていないユーザーです")
        logger.debug(f"user_id: {user_id}")
        
        # 必須フィールドの検証
        required_fields = ["title", "description", "difficulty", "category", "guardrail", "language", "initialMessage"]
        for field in required_fields:
            if field not in body or not body[field]:
                raise BadRequestError(f"{field}は必須フィールドです")
        
        # NPCデータの検証
        if "npc" not in body or not isinstance(body["npc"], dict):
            raise BadRequestError("NPC情報は必須です")
        
        npc_required_fields = ["name", "role", "company"]
        for field in npc_required_fields:
            if field not in body["npc"] or not body["npc"][field]:
                raise BadRequestError(f"npc.{field}は必須フィールドです")
        
        # シナリオIDの生成（カスタムIDが指定されている場合はそれを使用、そうでなければUUID）
        if "scenarioId" in body and body["scenarioId"]:
            custom_scenario_id = body["scenarioId"]
            
            # バリデーションと重複チェック
            validate_and_check_scenario_id(custom_scenario_id)
            
            scenario_id = custom_scenario_id
            logger.info(f"カスタムシナリオIDを使用: {scenario_id}")
        else:
            scenario_id = str(uuid.uuid4())
            logger.info(f"自動生成されたシナリオIDを使用: {scenario_id}")
        
        # 現在のタイムスタンプ（ISO 8601形式）
        current_time = datetime.utcnow().isoformat() + 'Z'
        
        # 保存するシナリオデータの構築
        scenario_data = {
            "scenarioId": scenario_id,
            "title": body["title"],
            "description": body["description"],
            "difficulty": body["difficulty"],
            "category": body["category"],
            "npc": body["npc"],
            "createdBy": user_id,
            "isCustom": True,
            "visibility": body.get("visibility", "private"),  # デフォルトは非公開
            "language": body["language"],
            "guardrail": body["guardrail"],
            "initialMessage": body["initialMessage"],
            "createdAt": current_time,
            "updatedAt": current_time
        }
        
        # PDFファイル情報があれば追加（最大5件まで）
        if "pdfFiles" in body and body["pdfFiles"]:
            pdf_files = body["pdfFiles"]
            if len(pdf_files) > 5:
                # 5件を超える場合は警告し、先頭5件だけ使用
                logger.warning(f"PDFファイルが5件を超えています。先頭5件だけ使用します: {len(pdf_files)}件")
                pdf_files = pdf_files[:5]
            scenario_data["pdfFiles"] = pdf_files
        
        # オプションフィールドの追加
        optional_fields = ["goals", "initialMetrics", "objectives", "maxTurns", "avatarId"]
        for field in optional_fields:
            if field in body and body[field]:
                scenario_data[field] = body[field]
        
        # 共有設定の処理
        if scenario_data["visibility"] == "shared" and "sharedWithUsers" in body:
            scenario_data["sharedWithUsers"] = body["sharedWithUsers"]
        
        # DynamoDBに保存
        if scenarios_table:
            scenarios_table.put_item(Item=scenario_data)
            
            # Knowledge Base ingestion jobを開始
            ingestion_result = start_knowledge_base_ingestion()
            logger.info(f"シナリオ作成後のingestion job結果: {ingestion_result}")
            
            # 成功レスポンス
            response = {
                "message": "シナリオが正常に作成されました",
                "scenarioId": scenario_id,
                "scenario": convert_decimal_to_json_serializable(scenario_data)
            }
            
            # ingestion job結果を含める（デバッグ用）
            if ingestion_result.get("status") != "skipped":
                response["ingestionJob"] = ingestion_result
            
            return response
        else:
            logger.error("シナリオテーブル未定義", extra={"table_name": SCENARIOS_TABLE})
            raise InternalServerError("システムエラーが発生しました")
            
    except BadRequestError:
        raise
    except Exception as e:
        logger.exception("シナリオ作成エラー", extra={"error": str(e)})
        raise InternalServerError(f"シナリオの作成中にエラーが発生しました: {str(e)}")


# シナリオ更新API
@app.put("/scenarios/<scenario_id>")
def update_scenario(scenario_id: str):
    """
    既存のシナリオを更新
    
    Args:
        scenario_id (str): 更新対象のシナリオID
        
    Returns:
        dict: 更新されたシナリオ情報
    """
    try:

        # パラメータのバリデーション
        if not scenario_id:
            raise BadRequestError("シナリオIDが指定されていません")
        
        # リクエストボディからデータを取得
        try:
            body = app.current_event.json_body
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"JSONパースエラー: {str(e)}")
            raise BadRequestError("無効なJSONリクエストです")
        
        if not body:
            raise BadRequestError("リクエストボディが必要です")
        
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        if not user_id:
            raise BadRequestError("認証されていないユーザーです")
        logger.debug(f"user_id: {user_id}")
        
        # シナリオが存在するか確認
        if scenarios_table:
            response = scenarios_table.get_item(
                Key={"scenarioId": scenario_id}
            )
            
            if "Item" not in response:
                raise NotFoundError(f"シナリオが見つかりません: {scenario_id}")
                
            existing_scenario = response["Item"]
            
            # 所有者チェック
            if existing_scenario.get("createdBy") != user_id:
                raise BadRequestError("このシナリオを編集する権限がありません")
            
            # 現在のタイムスタンプ
            current_time = datetime.utcnow().isoformat() + 'Z'
            
            # 更新用のシナリオデータを構築
            set_expressions = ["updatedAt = :updatedAt"]
            remove_expressions = []
            expression_attribute_values = {":updatedAt": current_time}
            
            # 更新可能なフィールドを処理（フィールド名のマッピング）
            field_mappings = {
                "title": "title",
                "description": "description", 
                "difficulty": "difficulty",
                "category": "category",
                "npc": "npc",
                "goals": "goals",
                "initialMetrics": "initialMetrics",
                "objectives": "objectives",
                "visibility": "visibility",
                "language": "language",
                "guardrail": "guardrail",  # DynamoDBでは'guardrail'フィールド
                "initialMessage": "initialMessage",
                "pdfFiles": "pdfFiles",  # PDF資料情報
                "maxTurns": "maxTurns",  # 最大ターン数
                "avatarId": "avatarId"  # アバターID
            }
            
            for request_field, db_field in field_mappings.items():
                if request_field in body:
                    set_expressions.append(f"{db_field} = :{request_field}")
                    expression_attribute_values[f":{request_field}"] = body[request_field]
            
            # 共有設定の処理
            if body.get("visibility") == "shared" and "sharedWithUsers" in body:
                set_expressions.append("sharedWithUsers = :sharedWithUsers")
                expression_attribute_values[":sharedWithUsers"] = body["sharedWithUsers"]
            elif body.get("visibility") in ["public", "private"]:
                # 共有設定を解除する場合はフィールドを削除
                remove_expressions.append("sharedWithUsers")
            
            # 更新式の構築
            update_expression_parts = []
            if set_expressions:
                set_clause = "SET " + ", ".join(set_expressions)
                update_expression_parts.append(set_clause)
                logger.debug(f"SET clause: {set_clause}")
            if remove_expressions:
                remove_clause = "REMOVE " + ", ".join(remove_expressions)
                update_expression_parts.append(remove_clause)
                logger.debug(f"REMOVE clause: {remove_clause}")
            
            update_expression = " ".join(update_expression_parts)
            logger.debug(f"Final update_expression: {update_expression}")
            logger.debug(f"set_expressions list: {set_expressions}")
            logger.debug(f"expression_attribute_values: {expression_attribute_values}")
            
            # DynamoDBを更新
            response = scenarios_table.update_item(
                Key={"scenarioId": scenario_id},
                UpdateExpression=update_expression,
                ExpressionAttributeValues=expression_attribute_values,
                ReturnValues="ALL_NEW"
            )
            
            updated_scenario = response.get("Attributes", {})
            
            # Knowledge Base ingestion jobを開始
            ingestion_result = start_knowledge_base_ingestion()
            logger.info(f"シナリオ更新後のingestion job結果: {ingestion_result}")
            
            # 成功レスポンス
            response_data = {
                "message": "シナリオが正常に更新されました",
                "scenario": convert_decimal_to_json_serializable(updated_scenario)
            }
            
            # ingestion job結果を含める（デバッグ用）
            if ingestion_result.get("status") != "skipped":
                response_data["ingestionJob"] = ingestion_result
            
            return response_data
        else:
            logger.error("シナリオテーブル未定義", extra={"table_name": SCENARIOS_TABLE})
            raise InternalServerError("システムエラーが発生しました")
            
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except Exception as e:
        logger.exception("シナリオ更新エラー", extra={"error": str(e), "scenario_id": scenario_id})
        raise InternalServerError(f"シナリオの更新中にエラーが発生しました: {str(e)}")


# シナリオ削除API
@app.delete("/scenarios/<scenario_id>")
def delete_scenario(scenario_id: str):
    """
    シナリオを削除する
    
    Args:
        scenario_id (str): 削除対象のシナリオID
        
    Returns:
        dict: 削除成功メッセージ
    """
    try:
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        if not user_id:
            raise BadRequestError("認証されていないユーザーです")
        logger.debug(f"user_id: {user_id}")
        
        # シナリオが存在するか確認
        if scenarios_table:
            response = scenarios_table.get_item(
                Key={"scenarioId": scenario_id}
            )
            
            if "Item" not in response:
                raise NotFoundError(f"シナリオが見つかりません: {scenario_id}")
                
            existing_scenario = response["Item"]
            
            # 所有者チェック
            if existing_scenario.get("createdBy") != user_id:
                raise BadRequestError("このシナリオを削除する権限がありません")
            
            # S3からPDFファイルを削除
            deleted_files, failed_deletions = delete_scenario_s3_files(scenario_id, existing_scenario)
            
            # DynamoDBから削除
            scenarios_table.delete_item(
                Key={"scenarioId": scenario_id}
            )
            
            # 削除結果のサマリーを作成
            deletion_summary = {
                "message": "シナリオが正常に削除されました",
                "scenarioId": scenario_id,
                "s3Files": {
                    "deleted": len(deleted_files),
                    "failed": len(failed_deletions)
                }
            }
            
            # 詳細情報をログに出力
            if deleted_files:
                logger.info(f"削除されたS3ファイル数: {len(deleted_files)}")
            if failed_deletions:
                logger.warning(f"削除に失敗したS3ファイル数: {len(failed_deletions)}")
                # 失敗した削除の詳細をレスポンスに含める（デバッグ用）
                deletion_summary["s3Files"]["failures"] = failed_deletions
            
            return deletion_summary
        else:
            logger.error("シナリオテーブル未定義", extra={"table_name": SCENARIOS_TABLE})
            raise InternalServerError("システムエラーが発生しました")
            
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except Exception as e:
        logger.exception("シナリオ削除エラー", extra={"error": str(e), "scenario_id": scenario_id})
        raise InternalServerError(f"シナリオの削除中にエラーが発生しました: {str(e)}")


# シナリオ共有設定API
@app.post("/scenarios/<scenario_id>/share")
def set_scenario_sharing(scenario_id: str):
    """
    シナリオの共有設定を更新
    
    Args:
        scenario_id (str): 対象のシナリオID
        
    リクエストボディ:
    - visibility: 'public', 'private', 'shared'のいずれか
    - sharedWithUsers: visibilityが'shared'の場合のユーザーIDリスト
        
    Returns:
        dict: 更新された共有設定
    """
    try:
        # リクエストボディからデータを取得
        try:
            body = app.current_event.json_body
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"JSONパースエラー: {str(e)}")
            raise BadRequestError("無効なJSONリクエストです")
        
        if not body:
            raise BadRequestError("リクエストボディが必要です")
        
        # 必須フィールドの検証
        if "visibility" not in body:
            raise BadRequestError("visibility設定は必須です")
            
        visibility = body["visibility"]
        if visibility not in ["public", "private", "shared"]:
            raise BadRequestError("visibility値は 'public', 'private', 'shared' のいずれかである必要があります")
        
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        if not user_id:
            raise BadRequestError("認証されていないユーザーです")
        
        # シナリオが存在するか確認
        if scenarios_table:
            response = scenarios_table.get_item(
                Key={"scenarioId": scenario_id}
            )
            
            if "Item" not in response:
                raise NotFoundError(f"シナリオが見つかりません: {scenario_id}")
                
            existing_scenario = response["Item"]
            
            # 所有者チェック
            if existing_scenario.get("createdBy") != user_id:
                raise BadRequestError("このシナリオの共有設定を変更する権限がありません")
            
            # 現在のタイムスタンプ
            current_time = int(time.time())
            
            # 更新式の準備
            update_expression = "SET visibility = :visibility, updatedAt = :updatedAt"
            expression_attribute_values = {
                ":visibility": visibility,
                ":updatedAt": current_time
            }
            
            # 共有設定の処理
            if visibility == "shared":
                if "sharedWithUsers" not in body or not isinstance(body["sharedWithUsers"], list):
                    raise BadRequestError("sharedWithUsersリストが必要です")
                    
                update_expression += ", sharedWithUsers = :sharedWithUsers"
                expression_attribute_values[":sharedWithUsers"] = body["sharedWithUsers"]
            else:
                # 共有設定を解除する場合はフィールドを削除
                update_expression = "SET visibility = :visibility, updatedAt = :updatedAt REMOVE sharedWithUsers"
            
            # DynamoDBを更新
            response = scenarios_table.update_item(
                Key={"scenarioId": scenario_id},
                UpdateExpression=update_expression,
                ExpressionAttributeValues=expression_attribute_values,
                ReturnValues="ALL_NEW"
            )
            
            updated_scenario = response.get("Attributes", {})
            
            # 成功レスポンス
            return {
                "message": "シナリオの共有設定が正常に更新されました",
                "visibility": visibility,
                "sharedWithUsers": updated_scenario.get("sharedWithUsers", []) if visibility == "shared" else []
            }
        else:
            logger.error("シナリオテーブル未定義", extra={"table_name": SCENARIOS_TABLE})
            raise InternalServerError("システムエラーが発生しました")
            
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except Exception as e:
        logger.exception("共有設定更新エラー", extra={"error": str(e), "scenario_id": scenario_id})
        raise InternalServerError(f"共有設定の更新中にエラーが発生しました: {str(e)}")


# 単一シナリオエクスポートAPI
@app.get("/scenarios/<scenario_id>/export")
def export_single_scenario(scenario_id: str):
    """
    特定のシナリオをエクスポート用のJSON形式で取得
    
    Args:
        scenario_id (str): エクスポートするシナリオID
    
    Returns:
        dict: エクスポート用のシナリオデータ
    """
    try:
        logger.info(f"シナリオエクスポート処理を開始: {scenario_id}")
        
        # パラメータのバリデーション
        if not scenario_id:
            raise BadRequestError("シナリオIDが指定されていません")
        
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        logger.info(f"エクスポート実行ユーザー: {user_id}")
        
        if scenarios_table:
            # シナリオ情報の取得
            response = scenarios_table.get_item(
                Key={'scenarioId': scenario_id}
            )
            
            if 'Item' not in response:
                raise NotFoundError(f"シナリオが見つかりません: {scenario_id}")
            
            item = response['Item']
            
            # アクセス権チェック
            visibility = item.get('visibility', 'public')
            created_by = item.get('createdBy')
            shared_with_users = item.get('sharedWithUsers', [])
            
            # アクセス権の確認
            has_access = False
            if visibility == 'public':
                has_access = True
            elif user_id and created_by == user_id:
                has_access = True
            elif visibility == 'shared' and user_id and user_id in shared_with_users:
                has_access = True
            
            if not has_access:
                raise BadRequestError("このシナリオをエクスポートする権限がありません")
            
            # シナリオデータを変換
            scenario_data = convert_decimal_to_json_serializable(item)
            
            # NPC情報を抽出
            npcs = []
            if 'npc' in item:
                npc_data = convert_decimal_to_json_serializable(item['npc'])
                npcs.append(npc_data)
            
            # エクスポート用データの構築
            export_data = {
                'scenarios': [scenario_data],
                'npcs': npcs,
                'exportedAt': datetime.utcnow().isoformat() + 'Z',
                'exportedBy': user_id,
                'version': '1.0'
            }
            
            logger.info(f"シナリオエクスポート完了: {scenario_id}")
            
            return export_data
        else:
            logger.error("シナリオテーブル未定義", extra={"table_name": SCENARIOS_TABLE})
            raise InternalServerError("システムエラーが発生しました")
            
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except Exception as e:
        logger.exception("シナリオエクスポートエラー", extra={"error": str(e), "scenario_id": scenario_id})
        raise InternalServerError(f"シナリオエクスポート中にエラーが発生しました: {str(e)}")


# シナリオインポートAPI
@app.post("/scenarios/import")
def import_scenarios():
    """
    シナリオをJSON形式でインポート
    
    リクエストボディ:
    - scenarios: インポートするシナリオのリスト
    - npcs: インポートするNPCのリスト
    
    注意: 既存のシナリオIDと重複する場合はエラーになります
    
    Returns:
        dict: インポート結果
    """
    try:
        logger.info("シナリオインポート処理を開始")
        
        # リクエストボディからデータを取得
        try:
            body = app.current_event.json_body
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"JSONパースエラー: {str(e)}")
            raise BadRequestError("無効なJSONリクエストです")
        
        if not body:
            raise BadRequestError("リクエストボディが必要です")
        
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        if not user_id:
            raise BadRequestError("認証されていないユーザーです")
        
        # 必須フィールドの検証
        if 'scenarios' not in body or not isinstance(body['scenarios'], list):
            raise BadRequestError("scenariosフィールドが必要です")
        
        scenarios_to_import = body['scenarios']
        npcs_to_import = body.get('npcs', [])
        
        logger.info(f"インポート対象: シナリオ数={len(scenarios_to_import)}, NPC数={len(npcs_to_import)}")
        
        if scenarios_table:
            imported_scenarios = []
            skipped_scenarios = []
            errors = []
            
            current_time = datetime.utcnow().isoformat() + 'Z'
            
            for scenario_data in scenarios_to_import:
                try:
                    # 必須フィールドの検証
                    required_fields = ['title', 'description', 'difficulty', 'category']
                    for field in required_fields:
                        if field not in scenario_data:
                            raise ValueError(f"必須フィールド '{field}' が不足しています")
                    
                    # 新しいシナリオIDを生成（重複を避けるため）
                    original_scenario_id = scenario_data.get('scenarioId')
                    new_scenario_id = str(uuid.uuid4())
                    
                    # 既存のシナリオIDをチェック
                    if original_scenario_id:
                        existing_response = scenarios_table.get_item(
                            Key={'scenarioId': original_scenario_id}
                        )
                        if 'Item' in existing_response:
                            skipped_scenarios.append({
                                'originalId': original_scenario_id,
                                'title': scenario_data.get('title'),
                                'reason': 'シナリオが既に存在します'
                            })
                            continue
                    
                    # インポート用のシナリオデータを構築
                    import_scenario = {
                        'scenarioId': new_scenario_id,
                        'title': scenario_data['title'],
                        'description': scenario_data['description'],
                        'difficulty': scenario_data['difficulty'],
                        'category': scenario_data['category'],
                        'createdBy': user_id,  # インポートしたユーザーを作成者に設定
                        'isCustom': True,
                        'visibility': 'private',  # インポートしたシナリオはデフォルトで非公開
                        'createdAt': current_time,
                        'updatedAt': current_time
                    }
                    
                    # オプションフィールドをコピー（DynamoDBの実際のデータ構造に基づく）
                    optional_fields = [
                        'language', 'initialMessage', 'goals', 'initialMetrics', 
                        'objectives', 'industry', 'guardrail', 'maxTurns', 'tags',
                        'version', 'sharedWithUsers'
                    ]
                    for field in optional_fields:
                        if field in scenario_data:
                            import_scenario[field] = scenario_data[field]
                    
                    # 特別な処理が必要なフィールド
                    # visibilityの処理（元のデータがpublicでもインポート時はprivateに設定）
                    if 'visibility' in scenario_data:
                        # セキュリティのため、インポート時は常にprivateに設定
                        import_scenario['visibility'] = 'private'
                    
                    # sharedWithUsersは空配列に設定（セキュリティのため）
                    import_scenario['sharedWithUsers'] = []
                    
                    # NPC情報をコピー
                    if 'npc' in scenario_data:
                        import_scenario['npc'] = scenario_data['npc']
                    elif 'npcInfo' in scenario_data:
                        import_scenario['npc'] = scenario_data['npcInfo']
                    
                    # DynamoDBに保存
                    scenarios_table.put_item(Item=import_scenario)
                    
                    imported_scenarios.append({
                        'originalId': original_scenario_id,
                        'newId': new_scenario_id,
                        'title': scenario_data['title']
                    })
                    
                except Exception as e:
                    logger.error(f"シナリオインポートエラー: {str(e)}")
                    errors.append({
                        'scenario': scenario_data.get('title', 'Unknown'),
                        'error': str(e)
                    })
            
            # インポート結果
            result = {
                'message': 'シナリオインポートが完了しました',
                'imported': len(imported_scenarios),
                'skipped': len(skipped_scenarios),
                'errors': len(errors),
                'details': {
                    'importedScenarios': imported_scenarios,
                    'skippedScenarios': skipped_scenarios,
                    'errors': errors
                }
            }
            
            logger.info(f"インポート完了: 成功={len(imported_scenarios)}, スキップ={len(skipped_scenarios)}, エラー={len(errors)}")
            
            return result
        else:
            logger.error("シナリオテーブル未定義", extra={"table_name": SCENARIOS_TABLE})
            raise InternalServerError("システムエラーが発生しました")
            
    except BadRequestError:
        raise
    except Exception as e:
        logger.exception("シナリオインポートエラー", extra={"error": str(e)})
        raise InternalServerError(f"シナリオインポート中にエラーが発生しました: {str(e)}")


@app.post("/scenarios/<scenario_id>/pdf-upload-url")
def generate_pdf_upload_url(scenario_id: str):
    """
    PDF資料およびメタデータファイルアップロード用の署名付きPOST URLを発行する
    
    リクエストボディ:
    - fileName: ファイル名（PDFファイルまたはメタデータJSONファイル）
    - contentType: ファイルのMIMEタイプ（例: application/pdf, application/json）
    
    戻り値:
    - uploadUrl: アップロード用のS3エンドポイントURL
    - formData: POSTリクエストで送信するフォームデータ
    - key: S3内のオブジェクトキー（保存先パス）
    """
    if not PDF_BUCKET:
        raise InternalServerError("PDF保存用のS3バケットが設定されていません")
    
    # リクエストボディを取得
    try:
        body = app.current_event.json_body
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"JSONパースエラー: {str(e)}")
        raise BadRequestError("無効なJSONリクエストです")
    
    # パラメータ検証
    if "fileName" not in body:
        raise BadRequestError("fileName is required")
    if "contentType" not in body:
        raise BadRequestError("contentType is required")
    
    file_name = body["fileName"]
    content_type = body["contentType"]
    
    # ファイル形式チェック（PDFファイルまたはメタデータJSONファイル）
    allowed_content_types = ["application/pdf", "application/json"]
    if content_type not in allowed_content_types:
        raise BadRequestError("アップロードできるのはPDFファイルまたはJSONメタデータファイルのみです")
    
    # S3キーを生成
    s3_key = f"scenarios/{scenario_id}/{file_name}"
    
    try:
        logger.info(f"署名付きURL生成開始: bucket={PDF_BUCKET}, key={s3_key}, contentType={content_type}, region={os.environ.get('AWS_REGION')}")
        
        # POSTベースの署名付きURL（フォームアップロード）を生成
        # これによりプリフライトリクエストを完全に回避
        post_data = s3_client.generate_presigned_post(
            Bucket=PDF_BUCKET,
            Key=s3_key,
            Fields={
                'Content-Type': content_type
            },
            Conditions=[
                ['content-length-range', 1, 104857600],  # 1バイト～100MB
                {'Content-Type': content_type}
            ],
            ExpiresIn=300  # 5分
        )
        
        logger.info(f"署名付きPOST URL生成成功: bucket={PDF_BUCKET}, key={s3_key}")
        logger.info(f"生成されたURL: {post_data['url']}")
        logger.info(f"フォームデータのフィールド数: {len(post_data['fields'])}")
        logger.debug(f"フォームデータの内容: {list(post_data['fields'].keys())}")
        
        # レスポンスを返す
        return {
            "uploadUrl": post_data['url'],
            "formData": post_data['fields'],
            "key": s3_key,
            "fileName": file_name,
            "contentType": content_type
        }
    except Exception as e:
        logger.error(f"署名付きPOST URL生成エラー: {str(e)}")
        logger.error(f"S3クライアント設定 - Region: {os.environ.get('AWS_REGION')}, Bucket: {PDF_BUCKET}")
        raise InternalServerError("署名付きPOST URLの生成に失敗しました")


@app.delete("/scenarios/<scenario_id>/files/<file_name>")
def delete_scenario_file(scenario_id: str, file_name: str):
    """
    シナリオに関連するファイルをS3から削除する
    
    Args:
        scenario_id (str): シナリオID
        file_name (str): 削除するファイル名（URLエンコードされている）
    
    Returns:
        dict: 削除結果
    """
    if not PDF_BUCKET or not s3_client:
        raise InternalServerError("PDF保存用のS3バケットが設定されていません")
    
    try:
        # URLデコード
        decoded_file_name = urllib.parse.unquote(file_name)
        
        # 認証情報からユーザーIDを取得
        user_id = get_user_id_from_token()
        if not user_id:
            raise BadRequestError("認証されていないユーザーです")
        
        # シナリオの所有者チェック（オプション - セキュリティ強化のため）
        if scenarios_table:
            response = scenarios_table.get_item(
                Key={"scenarioId": scenario_id}
            )
            
            if "Item" in response:
                existing_scenario = response["Item"]
                # 所有者チェック
                if existing_scenario.get("createdBy") != user_id:
                    raise BadRequestError("このシナリオのファイルを削除する権限がありません")
        
        # S3キーを生成
        s3_key = f"scenarios/{scenario_id}/{decoded_file_name}"
        
        logger.info(f"S3ファイル削除開始: bucket={PDF_BUCKET}, key={s3_key}")
        
        # S3からファイルを削除
        s3_client.delete_object(
            Bucket=PDF_BUCKET,
            Key=s3_key
        )
        
        logger.info(f"S3ファイル削除成功: {s3_key}")
        
        return {
            "message": "ファイルが正常に削除されました",
            "fileName": decoded_file_name,
            "key": s3_key
        }
        
    except BadRequestError:
        raise
    except Exception as e:
        logger.error(f"ファイル削除エラー: {str(e)}")
        raise InternalServerError(f"ファイルの削除中にエラーが発生しました: {str(e)}")


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    """
    Lambda関数のエントリーポイント
    
    APIGatewayRestResolverを使用してイベントを処理します。
    Powertoolsのロガーコンテキストを注入し、相関IDを設定します。
    
    Args:
        event: Lambda関数に渡されるイベントデータ
        context: Lambda関数のランタイムコンテキスト
        
    Returns:
        dict: APIGatewayRestResolverによって生成されたレスポンス
    """
    # リクエスト情報をログに出力
    logger.info(f"Lambda関数が呼び出されました: {event.get('path', 'unknown')}, method={event.get('httpMethod', 'unknown')}")
    
    # テーブルの状態を確認
    if scenarios_table is None:
        logger.warning("DynamoDBテーブルが初期化されていません。再初期化を試みます")
        init_tables()
    
    try:
        return app.resolve(event, context)
    except Exception as e:
        logger.exception(f"予期しないエラーが発生しました: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"message": "内部サーバーエラーが発生しました"})
        }
