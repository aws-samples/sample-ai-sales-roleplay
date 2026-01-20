"""
セッション関連のAPIハンドラー

セッション一覧取得、セッション詳細取得、セッション作成などの機能を提供します。
"""

import json
import uuid
from datetime import datetime, timedelta
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.event_handler.exceptions import (
    InternalServerError, NotFoundError, BadRequestError
)

from utils import get_user_id_from_event, sessions_table, SESSIONS_TABLE

# ロガー設定
logger = Logger(service="session-handlers")


def calculate_expiration_time(days: int = 90) -> int:
    """TTL用の有効期限を計算（UNIXタイムスタンプ）"""
    expiry_date = datetime.now() + timedelta(days=days)
    return int(expiry_date.timestamp())

def register_session_routes(app: APIGatewayRestResolver):
    """
    セッション関連のルートを登録
    
    Args:
        app: APIGatewayRestResolverインスタンス
    """

    @app.get("/sessions")
    def get_sessions():
        """
        ユーザーのセッション一覧を取得

        クエリパラメータ:
        - limit: 取得する最大件数 (デフォルト: 20)
        - nextToken: 次ページのトークン
        - scenarioId: シナリオIDでフィルタリング（オプション）

        Returns:
            dict: セッション一覧と次ページトークン
        """
        try:
            # ユーザーIDを取得
            user_id = get_user_id_from_event(app)
            
            # クエリパラメータ
            query_params = app.current_event.query_string_parameters or {}
            
            # パラメータのバリデーションと型変換
            try:
                limit = int(query_params.get('limit', 20))
                if limit < 1 or limit > 100:
                    limit = 20  # デフォルト値に設定
            except ValueError:
                logger.warning("不正なlimitパラメータ。デフォルト値を使用します。", extra={"limit": query_params.get('limit')})
                limit = 20
                
            next_token = query_params.get('nextToken')
            scenario_id = query_params.get('scenarioId')
            
            # クエリ実行用のパラメータ
            dynamo_query_params = {}
            
            # 特定のシナリオによるフィルタリング
            if scenario_id:
                if sessions_table:
                    # ScenarioSessionsIndexを使用
                    dynamo_query_params = {
                        'IndexName': 'ScenarioSessionsIndex',
                        'KeyConditionExpression': 'scenarioId = :sid',
                        'ExpressionAttributeValues': {
                            ':sid': scenario_id,
                            ':uid': user_id
                        },
                        'FilterExpression': 'userId = :uid',
                        'Limit': limit,
                        'ScanIndexForward': False  # 降順（最新のセッションから）
                    }
            else:
                # 通常のユーザーIDによるクエリ
                dynamo_query_params = {
                    'KeyConditionExpression': 'userId = :uid',
                    'ExpressionAttributeValues': {
                        ':uid': user_id
                    },
                    'Limit': limit,
                    'ScanIndexForward': False  # 降順（最新のセッションから）
                }
            
            # ページネーショントークンの追加
            if next_token:
                try:
                    dynamo_query_params['ExclusiveStartKey'] = json.loads(next_token)
                except (json.JSONDecodeError, TypeError) as json_error:
                    logger.error("無効なnextTokenパラメータ", extra={"error": str(json_error), "nextToken": next_token})
                    raise BadRequestError("無効なページネーショントークンです")
            
            # DynamoDBテーブルが存在するか確認
            if not sessions_table:
                logger.error("セッションテーブル未定義", extra={"table_name": SESSIONS_TABLE})
                raise InternalServerError("システムエラーが発生しました")
                
            # DynamoDBクエリの実行
            response = sessions_table.query(**dynamo_query_params)
            
            # レスポンス用のセッションリストを作成
            sessions = []
            for item in response.get('Items', []):
                # レスポンス用に必要なフィールドだけを抽出
                session = {
                    'sessionId': item.get('sessionId'),
                    'scenarioId': item.get('scenarioId'),
                    'title': item.get('title', 'タイトルなし'),  # デフォルト値を設定
                    'createdAt': item.get('createdAt', ''),
                    'updatedAt': item.get('updatedAt', ''),
                    'status': item.get('status', 'active')
                }
                
                # NPCの基本情報があれば追加
                if 'npcInfo' in item:
                    session['npcInfo'] = {
                        'name': item['npcInfo'].get('name', '不明'),
                        'role': item['npcInfo'].get('role', ''),
                        'company': item['npcInfo'].get('company', '')
                    }
                
                sessions.append(session)
            
            # 次ページのトークン
            next_token = None
            if 'LastEvaluatedKey' in response:
                next_token = json.dumps(response['LastEvaluatedKey'])
            
            return {
                'sessions': sessions,
                'nextToken': next_token
            }
                
        except BadRequestError:
            # 既にエラーメッセージが設定されているので再スロー
            raise
        except InternalServerError:
            # 既にエラーメッセージが設定されているので再スロー
            raise
        except Exception as e:
            logger.exception("セッション一覧取得エラー", extra={"error": str(e)})
            raise InternalServerError(f"セッション一覧の取得中にエラーが発生しました")

    # semgrep: ignore useless-inner-function
    @app.get("/sessions/<session_id>")
    def get_session(session_id: str):
        """
        特定のセッションの詳細を取得

        Args:
            session_id (str): セッションID

        Returns:
            dict: セッション詳細情報
        """
        try:
            # ユーザーIDを取得
            user_id = get_user_id_from_event(app)
            
            # パラメータのバリデーション
            if not session_id:
                raise BadRequestError("セッションIDが指定されていません")
            
            # セッション情報の取得
            if sessions_table:
                response = sessions_table.get_item(
                    Key={
                        'userId': user_id,
                        'sessionId': session_id
                    }
                )
                
                # セッションが存在するかチェック
                if 'Item' not in response:
                    raise NotFoundError(f"セッションが見つかりません: {session_id}")
                
                session = response['Item']
                return session
            else:
                logger.error("セッションテーブル未定義", extra={"table_name": SESSIONS_TABLE})
                raise InternalServerError("システムエラーが発生しました")
                
        except NotFoundError:
            raise
        except BadRequestError:
            raise
        except Exception as e:
            logger.exception("セッション詳細取得エラー", extra={"error": str(e), "session_id": session_id})
            raise InternalServerError(f"セッション詳細の取得中にエラーが発生しました: {str(e)}")

    @app.post("/sessions")
    def create_session():
        """
        新しいセッションを作成

        リクエストボディ:
        - sessionId: セッションID（オプション、指定しない場合は自動生成）
        - scenarioId: シナリオID（必須）
        - title: セッションタイトル（オプション）
        - npcInfo: NPC情報（オプション）

        Returns:
            dict: 作成されたセッション情報
        """
        try:
            # ユーザーIDを取得
            user_id = get_user_id_from_event(app)
            
            # リクエストボディを取得
            body = app.current_event.json_body or {}
            
            # セッションIDの取得または生成
            session_id = body.get('sessionId') or str(uuid.uuid4())
            scenario_id = body.get('scenarioId')
            title = body.get('title')
            npc_info = body.get('npcInfo')
            
            # シナリオIDは必須
            if not scenario_id:
                raise BadRequestError("シナリオIDが指定されていません")
            
            # DynamoDBテーブルが存在するか確認
            if not sessions_table:
                logger.error("セッションテーブル未定義", extra={"table_name": SESSIONS_TABLE})
                raise InternalServerError("システムエラーが発生しました")
            
            # 現在の日時を取得
            current_time = datetime.now().isoformat()
            
            # セッションが既に存在するかチェック
            try:
                response = sessions_table.get_item(
                    Key={
                        'userId': user_id,
                        'sessionId': session_id
                    }
                )
                existing_session = response.get('Item')
            except Exception as e:
                logger.warning("セッション存在チェック中にエラーが発生しました", extra={
                    "error": str(e),
                    "session_id": session_id
                })
                existing_session = None
            
            if existing_session:
                # 既存セッションを更新
                update_expression_parts = ['updatedAt = :time', 'expireAt = :exp']
                expression_values = {
                    ':time': current_time,
                    ':exp': calculate_expiration_time()
                }
                
                if title:
                    update_expression_parts.append('title = :title')
                    expression_values[':title'] = title
                
                if npc_info:
                    update_expression_parts.append('npcInfo = :npc')
                    expression_values[':npc'] = npc_info
                
                sessions_table.update_item(
                    Key={
                        'userId': user_id,
                        'sessionId': session_id
                    },
                    UpdateExpression='SET ' + ', '.join(update_expression_parts),
                    ExpressionAttributeValues=expression_values
                )
                
                logger.info("既存セッションを更新しました", extra={
                    "session_id": session_id,
                    "user_id": user_id
                })
                
                return {
                    'success': True,
                    'sessionId': session_id,
                    'message': 'セッションを更新しました',
                    'isNew': False
                }
            else:
                # 新規セッションを作成
                # セッションタイトルのデフォルト設定
                if not title and npc_info:
                    title = f"{npc_info.get('name', 'NPC')}との会話"
                
                session_item = {
                    'userId': user_id,
                    'sessionId': session_id,
                    'scenarioId': scenario_id,
                    'title': title or '新規会話セッション',
                    'status': 'active',
                    'createdAt': current_time,
                    'updatedAt': current_time,
                    'expireAt': calculate_expiration_time()
                }
                
                # NPC情報があれば追加
                if npc_info:
                    session_item['npcInfo'] = npc_info
                
                sessions_table.put_item(Item=session_item)
                
                logger.info("新規セッションを作成しました", extra={
                    "session_id": session_id,
                    "user_id": user_id,
                    "scenario_id": scenario_id
                })
                
                return {
                    'success': True,
                    'sessionId': session_id,
                    'message': 'セッションを作成しました',
                    'isNew': True
                }
                
        except BadRequestError:
            raise
        except Exception as e:
            logger.exception("セッション作成エラー", extra={"error": str(e)})
            raise InternalServerError(f"セッションの作成中にエラーが発生しました: {str(e)}")
