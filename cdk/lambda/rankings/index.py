import json
import os
import boto3
import datetime
from typing import Dict, Any, Optional
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.event_handler.exceptions import BadRequestError, InternalServerError

# Powertools ロガー設定
logger = Logger(service="rankings-api")

# CORS設定
cors_config = CORSConfig(
    allow_origin="*",
    max_age=300,
    allow_headers=["Content-Type", "Authorization", "X-Api-Key", "X-Amz-Security-Token", "X-Amz-Date"],
    allow_credentials=True
)

# APIGatewayRestResolverの初期化
app = APIGatewayRestResolver(cors=cors_config)

# 環境変数からテーブル名とユーザープールIDを取得
SESSION_FEEDBACK_TABLE = os.environ.get('SESSION_FEEDBACK_TABLE', '')
USER_POOL_ID = os.environ.get('USER_POOL_ID', '')

# DynamoDB クライアント
dynamodb = boto3.resource('dynamodb')
feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE) if SESSION_FEEDBACK_TABLE else None

# Cognitoクライアント
cognito_client = boto3.client('cognito-idp')

# 重要な環境変数のバリデーション
def validate_environment():
    """環境変数の妥当性をチェック"""
    missing_vars = []
    
    if not SESSION_FEEDBACK_TABLE:
        missing_vars.append('SESSION_FEEDBACK_TABLE')
    
    if not USER_POOL_ID:
        missing_vars.append('USER_POOL_ID')
    
    if missing_vars:
        error_msg = f"必須の環境変数が設定されていません: {', '.join(missing_vars)}"
        logger.error(error_msg, extra={
            "missing_environment_variables": missing_vars
        })
        # 環境変数が不足している場合は機能制限モードで動作
        return False
    
    return True

# 初期化時に環境変数をチェック
ENVIRONMENT_VALID = validate_environment()

def get_preferred_username(user_id: str) -> Optional[str]:
    """
    Cognitoからユーザーのpreferred_usernameを取得
    
    Args:
        user_id (str): CognitoユーザーID
        
    Returns:
        Optional[str]: preferred_username または None（エラー時）
    """
    try:
        if not USER_POOL_ID:
            logger.error("ユーザープールIDが設定されていません。ランキング機能は動作しません", extra={
                "user_id": user_id,
                "required_env": "USER_POOL_ID"
            })
            return None
            
        # Cognitoからユーザー情報を取得
        response = cognito_client.admin_get_user(
            UserPoolId=USER_POOL_ID,
            Username=user_id
        )
        
        # preferred_username属性を検索
        for attr in response.get('UserAttributes', []):
            if attr['Name'] == 'preferred_username':
                preferred_username = attr['Value']
                if preferred_username and preferred_username.strip():
                    return preferred_username.strip()
        
        # preferred_usernameが見つからない場合はemailを試行
        for attr in response.get('UserAttributes', []):
            if attr['Name'] == 'email':
                email = attr['Value']
                if email and '@' in email:
                    # メールアドレスの@マーク前を使用
                    return email.split('@')[0]
        
        # preferred_usernameもemailも取得できない場合
        logger.warning("ユーザーのpreferred_usernameとemailが取得できませんでした", extra={
            "user_id": user_id
        })
        return None
        
    except cognito_client.exceptions.UserNotFoundException:
        logger.warning("Cognitoユーザーが見つかりません", extra={
            "user_id": user_id
        })
        return None
    except Exception as e:
        logger.error(f"preferred_username取得中にエラーが発生しました: {str(e)}", extra={
            "user_id": user_id,
            "error_type": type(e).__name__
        })
        return None

@app.get("/rankings")
def get_rankings():
    """
    ランキングAPIエンドポイント
    シナリオIDと期間を指定してスコアランキングを取得します
    
    クエリパラメータ:
    - scenarioId: シナリオID（必須）
    - period: 期間指定（"daily", "weekly", "monthly"のいずれか、デフォルトは"weekly"）
    - limit: 取得件数の上限（デフォルトは10）

    Returns:
        dict: ランキングリスト
    """
    try:
        # 環境変数チェック
        if not ENVIRONMENT_VALID:
            logger.error("システム設定に問題があります", extra={
                "endpoint": "/rankings"
            })
            raise InternalServerError("システム設定エラーが発生しました")
        
        # クエリパラメータの取得
        query_params = app.current_event.query_string_parameters or {}
        
        # シナリオIDは必須
        scenario_id = query_params.get('scenarioId')
        if not scenario_id:
            raise BadRequestError("シナリオIDは必須です")
        
        # 期間とリミットのデフォルト値設定
        period = query_params.get('period', 'weekly')
        
        # 期間のバリデーション
        if period not in ['daily', 'weekly', 'monthly']:
            logger.warning(f"不正な期間パラメータ: {period}、weeklyを使用します")
            period = 'weekly'
        
        # 取得件数の解析
        try:
            limit = int(query_params.get('limit', 10))
            if limit < 1 or limit > 100:
                limit = 10
        except ValueError:
            logger.warning(f"不正なlimitパラメータ: {query_params.get('limit')}、デフォルト値を使用します")
            limit = 10
        
        logger.info("ランキングデータを取得します", extra={
            "scenario_id": scenario_id,
            "period": period,
            "limit": limit
        })
        
        # DynamoDBテーブルが存在するか確認
        if not feedback_table:
            logger.error("フィードバックテーブル未定義", extra={"table_name": SESSION_FEEDBACK_TABLE})
            raise InternalServerError("システムエラーが発生しました")
        
        # 期間に基づいて日付フィルターを作成
        # createdAt は UTC を明示した 'Z' 付き ISO 8601 文字列として保存されているため、
        # 文字列比較が正しく機能するよう、フィルター基準も UTC・'Z' 付きで生成する。
        now = datetime.datetime.now(datetime.timezone.utc)
        filter_date = None

        def _to_filter_str(dt):
            return dt.isoformat().replace("+00:00", "Z")

        if period == 'daily':
            # 24時間以内のデータ
            filter_date = _to_filter_str(now - datetime.timedelta(days=1))
        elif period == 'weekly':
            # 7日以内のデータ
            filter_date = _to_filter_str(now - datetime.timedelta(weeks=1))
        elif period == 'monthly':
            # 30日以内のデータ
            filter_date = _to_filter_str(now - datetime.timedelta(days=30))
        
        logger.info(f"期間フィルター: {period}, フィルター日付: {filter_date}", extra={
            "period": period,
            "filter_date": filter_date
        })
        
        # GSIを使用してランキングデータを効率的に取得し、期間でフィルタリング
        response = feedback_table.query(
            IndexName='scenarioId-overallScore-index',
            KeyConditionExpression='scenarioId = :sid',
            FilterExpression='createdAt >= :filter_date' if filter_date else None,
            ExpressionAttributeValues={
                ':sid': scenario_id,
                **(
                    {':filter_date': filter_date} 
                    if filter_date else {}
                )
            },
            ScanIndexForward=False  # 降順（高スコアが上位）
        )
        
        items = response.get('Items', [])
        
        # クエリ結果のログ出力
        logger.info(f"DynamoDBクエリ結果: {len(items)}件のデータ取得", extra={
            "scenario_id": scenario_id,
            "items_count": len(items)
        })
        
        # ランキングデータを整形（Cognitoからpreferred_username取得とエラー除外）
        rankings = []
        successful_count = 0
        failed_count = 0
        
        for item in items:
            user_id = item.get('userId', 'unknown')
            
            # CognitoからPreferred usernameを取得
            display_name = get_preferred_username(user_id)
            
            # preferred_usernameが取得できない場合はこのレコードをスキップ
            if display_name is None:
                failed_count += 1
                logger.warning("ユーザー情報取得失敗のためランキングから除外", extra={
                    "user_id": user_id,
                    "session_id": item.get('sessionId', ''),
                    "score": item.get('overallScore', 0)
                })
                continue
            
            successful_count += 1
            ranking_entry = {
                'rank': successful_count,  # 実際の順位を設定
                'username': display_name,
                'score': int(item.get('overallScore', 0)),
                'sessionId': item.get('sessionId', ''),
                'timestamp': item.get('createdAt', '')
            }
            rankings.append(ranking_entry)
            
            # 指定されたlimitに達したら終了
            if successful_count >= limit:
                break
        
        # ログで結果を記録
        logger.info("ランキングデータ処理完了", extra={
            "scenario_id": scenario_id,
            "period": period,
            "filter_date": filter_date if 'filter_date' in locals() else None,
            "total_records": len(items),
            "successful_records": successful_count,
            "failed_records": failed_count,
            "returned_rankings": len(rankings)
        })
        
        # フィルタリングされた結果から総参加者数を計算
        filtered_total_count = len([item for item in items if 
            'filter_date' not in locals() or 
            item.get('createdAt', '') >= filter_date
        ]) if 'filter_date' in locals() else len(items)
            
        return {
            'success': True,
            'rankings': rankings,
            'totalCount': filtered_total_count,  # フィルタリングされた総参加者数
            'period': period,
            'scenarioId': scenario_id
        }
        
    except BadRequestError as e:
        logger.warning(f"Bad request error: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }, 400
    except Exception as e:
        logger.exception(f"ランキングデータ取得中にエラーが発生しました: {str(e)}")
        return {
            'success': False,
            'error': "Internal server error"
        }, 500

@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    Lambda関数のエントリーポイント
    """
    return app.resolve(event, context)