"""
セッション管理Lambda関数

このモジュールは、ユーザーセッション履歴を管理するLambda関数のメインエントリーポイントです。
機能別に分割されたモジュールを統合し、APIルートを登録します。

## 基本機能
- セッション一覧の取得 (GET /sessions)
- セッション詳細の取得 (GET /sessions/{sessionId})
- セッションメッセージ履歴の取得 (GET /sessions/{sessionId}/messages)
- セッション完全データの取得 (GET /sessions/{sessionId}/complete-data)

## Knowledge Base評価機能
- 評価の非同期開始 (POST /sessions/{sessionId}/messages/evaluate)
- 評価状況の確認 (GET /sessions/{sessionId}/messages/evaluation-status)
- 評価結果の取得 (GET /sessions/{sessionId}/messages/evaluation-results)
- 非同期Knowledge Base評価処理

環境変数:
- SESSIONS_TABLE: セッション情報を格納するDynamoDBテーブル名
- MESSAGES_TABLE: メッセージ履歴を格納するDynamoDBテーブル名
- SCENARIOS_TABLE: シナリオ情報を格納するDynamoDBテーブル名 (フィードバック生成時に使用)
- KNOWLEDGE_BASE_ID: Amazon Bedrock Knowledge BaseのID
- BEDROCK_MODEL_FEEDBACK: フィードバック生成用のBedrockモデルID

必要なIAM権限:
- lambda:InvokeFunction (自己呼び出し用)
- bedrock:InvokeModel (フィードバック生成用)
- bedrock:Retrieve (Knowledge Base検索用)
- dynamodb:GetItem, UpdateItem, Query, Scan (テーブル操作用)
"""

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# 分割されたハンドラーモジュールをインポート
from session_handlers import register_session_routes
from message_handlers import register_message_routes
from analysis_results_handlers import register_analysis_results_routes

# Powertools ロガー設定
logger = Logger(service="sessions-api")

# CORS設定 - 開発環境では全てのオリジンを許可
cors_config = CORSConfig(
    allow_origin="*",  # 本番環境では特定のドメインに限定
    max_age=300,
    allow_headers=["Content-Type", "Authorization", "X-Api-Key", "X-Amz-Security-Token", "X-Amz-Date"],
    allow_credentials=True  # 認証情報を許可
)

# APIGatewayRestResolverの初期化
app = APIGatewayRestResolver(cors=cors_config)

# 各ハンドラーモジュールからルートを登録
register_session_routes(app)
register_message_routes(app)
register_analysis_results_routes(app)

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
    # 通常のAPI Gateway リクエストの場合
    return app.resolve(event, context)
