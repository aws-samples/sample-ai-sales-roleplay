"""
Amazon Bedrock統合Lambda関数

このモジュールは、Amazon Bedrockを使用してNPCとの会話を処理するLambda関数を実装します。
主な機能は以下の通りです：
- NPCとの会話処理（/bedrock/conversation）
- プロンプト生成と管理
"""

import json
import os
import time
import uuid
import boto3
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from prompt_builder import prompt_builder
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# カスタム例外クラス
class InternalServerError(Exception):
    pass

class UnauthorizedError(Exception):
    pass

# Powertools ロガー設定
logger = Logger(service="bedrock-api")

# CORS設定 - 開発環境では全てのオリジンを許可
cors_config = CORSConfig(
    allow_origin="*",  # 本番環境では特定のドメインに限定
    max_age=300,
    allow_headers=["Content-Type", "Authorization", "X-Api-Key", "X-Amz-Security-Token", "X-Amz-Date"],
    allow_credentials=True  # 認証情報を許可
)

# APIGatewayRestResolverの初期化
app = APIGatewayRestResolver(cors=cors_config)

# グローバル変数
bedrock_runtime = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')

# 環境変数
SCENARIOS_TABLE = os.environ.get('SCENARIOS_TABLE')
SESSIONS_TABLE = os.environ.get('SESSIONS_TABLE')
MESSAGES_TABLE = os.environ.get('MESSAGES_TABLE')

# DynamoDBテーブル
scenarios_table = None
sessions_table = None
messages_table = None



# DynamoDBテーブルの初期化
def init_tables():
    """
    DynamoDBテーブルのリソースを初期化
    """
    global scenarios_table, sessions_table, messages_table
    
    if SCENARIOS_TABLE:
        scenarios_table = dynamodb.Table(SCENARIOS_TABLE)
    
    if SESSIONS_TABLE:
        sessions_table = dynamodb.Table(SESSIONS_TABLE)
    
    if MESSAGES_TABLE:
        messages_table = dynamodb.Table(MESSAGES_TABLE)

# テーブルの初期化
init_tables()

def get_user_id_from_event():
    """
    イベントからCognitoユーザーIDを抽出

    Returns:
        str: ユーザーID
    """
    event = app.current_event
    try:
        # Cognitoからのユーザー情報を抽出
        claims = event.request_context.authorizer.claims
        user_id = claims.get('cognito:username', claims.get('sub', 'anonymous'))
        return user_id
    except (AttributeError, KeyError):
        logger.warning("ユーザーID取得失敗、匿名ユーザーとして処理します")
        return "anonymous"


def get_scenario_info(scenario_id: str) -> Dict[str, Any]:
    """
    シナリオIDからシナリオ詳細情報を取得する
    
    Args:
        scenario_id (str): シナリオID
        
    Returns:
        Dict[str, Any]: シナリオ情報（title, description, goals, objectives等）
                       取得できない場合は空の辞書を返す
    """
    try:
        if not SCENARIOS_TABLE:
            logger.warning("SCENARIOS_TABLE環境変数が設定されていません")
            return {}
            
        # DynamoDBからシナリオ詳細を取得
        scenarios_table = dynamodb.Table(SCENARIOS_TABLE)
        response = scenarios_table.get_item(Key={'scenarioId': scenario_id})
        
        if 'Item' not in response:
            logger.warning(f"シナリオが見つかりません: {scenario_id}")
            return {}
            
        scenario_data = response['Item']
        
        # プロンプト生成に必要な情報のみを抽出
        scenario_info = {
            'title': scenario_data.get('title', ''),
            'description': scenario_data.get('description', ''),
            'goals': scenario_data.get('goals', ''),
            'objectives': scenario_data.get('objectives', '')
        }
        
        logger.info(f"シナリオ情報取得成功: {scenario_id}")
        return scenario_info
        
    except Exception as e:
        logger.error(f"シナリオ情報取得エラー: {str(e)}, scenario_id: {scenario_id}")
        return {}


def create_or_update_session(user_id: str, session_id: str = None, scenario_id: str = None, npc_info: Dict = None, title: str = None):
    """
    セッションを作成または更新します
    
    Args:
        user_id (str): ユーザーID
        session_id (str, optional): セッションID（フロントエンドから提供される場合）
        scenario_id (str, optional): シナリオID
        npc_info (Dict, optional): NPC情報
        title (str, optional): セッションタイトル
        
    Returns:
        str: セッションID
    """
    # セッションテーブルが未定義の場合は処理をスキップ
    if not sessions_table:
        logger.warning("セッションテーブルが未定義のためセッション保存をスキップします")
        return session_id or str(uuid.uuid4())
    
    try:
        # セッションIDが提供されていない場合は新規生成
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # 現在の日時を取得
        current_time = datetime.now().isoformat()
        
        # セッションが既に存在するかチェック
        existing_session = None
        is_new_session = False
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
        
        # 既存セッションがある場合は更新、ない場合は新規作成
        if existing_session:
            # 所有権チェック
            if existing_session.get('userId') != user_id:
                logger.warning(f"セッション所有権検証失敗: ユーザー {user_id} はセッション {session_id} の所有者ではありません")
                from aws_lambda_powertools.event_handler.exceptions import UnauthorizedError
                raise UnauthorizedError(f"セッション {session_id} の更新権限がありません")
            
            # 既存セッションを更新
            update_expression_parts = ['updatedAt = :time', 'expireAt = :exp']
            expression_values = {
                ':time': current_time,
                ':exp': calculate_expiration_time()
            }
            
            # 更新可能なフィールドを追加
            if scenario_id:
                update_expression_parts.append('scenarioId = :sid')
                expression_values[':sid'] = scenario_id
            
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
        else:
            # 新規セッションを作成
            is_new_session = True
            # セッションタイトルのデフォルト設定
            if not title and npc_info:
                title = f"{npc_info.get('name', 'NPC')}との会話"
            
            session_item = {
                'userId': user_id,
                'sessionId': session_id,
                'scenarioId': scenario_id or 'default',
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
                "user_id": user_id
            })
            
            # 新規セッション作成時：シナリオの初期メッセージを保存
            if is_new_session and scenario_id:
                try:
                    save_initial_message_for_session(user_id, session_id, scenario_id)
                except Exception as e:
                    logger.warning("初期メッセージの保存に失敗しましたが、セッションは正常に作成されました", extra={
                        "error": str(e),
                        "session_id": session_id,
                        "scenario_id": scenario_id
                    })
        
        return session_id
        
    except UnauthorizedError:
        # 権限エラーは上位に伝播
        raise
    except Exception as e:
        logger.exception("セッション作成/更新エラー", extra={
            "error": str(e),
            "user_id": user_id,
            "session_id": session_id
        })
        
        # エラー時は渡されたセッションIDをそのまま返すか、新規生成
        return session_id or str(uuid.uuid4())


def calculate_expiration_time(days: int = None) -> int:
    """
    TTLの有効期限タイムスタンプを計算する
    指定された日数または環境変数MESSAGE_TTL_DAYS日後のUNIXタイムスタンプを返す
    
    Args:
        days (int, optional): 有効期限の日数 未指定時は環境変数を使用
        
    Returns:
        int: UNIXタイムスタンプ形式の有効期限
    """
    # 日数が指定されていなければ環境変数から取得（デフォルト180日）
    if days is None:
        days = int(os.environ.get('MESSAGE_TTL_DAYS', '180'))
    
    expiry_date = datetime.now() + timedelta(days=days)
    return int(expiry_date.timestamp())

def save_initial_message_for_session(user_id: str, session_id: str, scenario_id: str):
    """
    シナリオの初期メッセージをセッションに保存します
    
    Args:
        user_id (str): ユーザーID
        session_id (str): セッションID
        scenario_id (str): シナリオID
        
    Raises:
        Exception: シナリオ取得やメッセージ保存でエラーが発生した場合
    """
    try:
        # シナリオテーブルが未定義の場合はスキップ
        if not scenarios_table:
            logger.warning("シナリオテーブルが未定義のため初期メッセージ保存をスキップします")
            return
        
        # シナリオ情報を取得
        try:
            response = scenarios_table.get_item(
                Key={'scenarioId': scenario_id}
            )
            
            if 'Item' not in response:
                logger.warning("指定されたシナリオが見つかりません", extra={
                    "scenario_id": scenario_id,
                    "session_id": session_id
                })
                return
            
            scenario = response['Item']
        except Exception as e:
            logger.error("シナリオ情報の取得に失敗しました", extra={
                "error": str(e),
                "scenario_id": scenario_id,
                "session_id": session_id
            })
            raise
        
        # 初期メッセージを取得
        initial_message = scenario.get('initialMessage')
        
        if not initial_message:
            logger.info("シナリオに初期メッセージが定義されていません", extra={
                "scenario_id": scenario_id,
                "session_id": session_id
            })
            return
        
        # セッション作成時刻を取得（メッセージのタイムスタンプ用）- 10秒前に設定して重複を回避
        session_start_time = int(datetime.now().timestamp()) - 10
        
        # 初期メッセージをメッセージテーブルに保存
        message_id = str(uuid.uuid4())
        
        message_item = {
            'sessionId': session_id,
            'messageId': message_id,
            'userId': user_id,
            'timestamp': session_start_time,  # セッション開始時刻
            'sender': 'npc',  # NPCからのメッセージ
            'content': initial_message,
            'expireAt': calculate_expiration_time(),  # TTL設定
            'isInitialMessage': True  # 初期メッセージであることを示すフラグ
        }
        
        # メッセージテーブルが未定義の場合はスキップ
        if not messages_table:
            logger.warning("メッセージテーブルが未定義のため初期メッセージ保存をスキップします")
            return
        
        logger.debug(f"message_item: {message_item}")
        
        # DynamoDBに保存
        messages_table.put_item(Item=message_item)
        
        logger.info("シナリオの初期メッセージを保存しました", extra={
            "message_id": message_id,
            "session_id": session_id,
            "scenario_id": scenario_id,
            "message_length": len(initial_message)
        })
        
    except Exception as e:
        logger.exception("初期メッセージの保存中にエラーが発生しました", extra={
            "error": str(e),
            "session_id": session_id,
            "scenario_id": scenario_id
        })
        # エラーをre-raiseして呼び出し元に通知
        raise


def save_message(user_id: str, session_id: str, sender: str, content: str, metrics: Dict = None):
    """
    メッセージを保存します
    
    Args:
        user_id (str): ユーザーID
        session_id (str): セッションID
        sender (str): 送信者 ('user' または 'npc')
        content (str): メッセージ内容
        metrics (Dict, optional): リアルタイムメトリクス
    
    Returns:
        str: メッセージID
    """
    # メッセージテーブルが未定義の場合は処理をスキップ
    if not messages_table:
        logger.warning("メッセージテーブルが未定義のためメッセージ保存をスキップします")
        return str(uuid.uuid4())
    
    try:
        # 現在の日時を取得
        current_time = datetime.now().isoformat()
        current_timestamp = int(datetime.now().timestamp())
        
        # メッセージIDを生成
        message_id = str(uuid.uuid4())
        
        # メッセージ情報を作成
        message_item = {
            'sessionId': session_id,
            'messageId': message_id,
            'userId': user_id,
            'timestamp': current_timestamp,  # NUMBER型のUNIXタイムスタンプ
            'sender': sender,
            'content': content,
            'expireAt': calculate_expiration_time()  # TTL属性に有効期限を設定
        }
        
        # メトリクス情報があれば追加
        if metrics:
            message_item['realtimeMetrics'] = metrics

        
        # DynamoDBにメッセージを保存
        messages_table.put_item(Item=message_item)
        
        # セッションの更新日時も併せて更新（メッセージが追加されるたびにセッションを最新化）
        if sessions_table:
            try:
                # セッション情報を取得
                response = sessions_table.get_item(
                    Key={
                        'userId': user_id,
                        'sessionId': session_id
                    }
                )
                
                # セッションが存在する場合のみ更新
                if 'Item' in response:
                    sessions_table.update_item(
                        Key={
                            'userId': user_id,
                            'sessionId': session_id
                        },
                        UpdateExpression='SET updatedAt = :time, expireAt = :exp',
                        ExpressionAttributeValues={
                            ':time': current_time,
                            ':exp': calculate_expiration_time()
                        }
                    )
            except Exception as session_error:
                logger.warning("セッション更新エラー（メッセージは保存されました）", extra={
                    "error": str(session_error),
                    "session_id": session_id,
                    "user_id": user_id
                })
        
        logger.info("メッセージを保存しました", extra={
            "message_id": message_id,
            "session_id": session_id,
            "sender": sender,
            "content_length": len(content) if content else 0
        })
        
        return message_id
        
    except Exception as e:
        logger.exception("メッセージ保存エラー", extra={
            "error": str(e),
            "session_id": session_id,
            "sender": sender
        })
        
        return str(uuid.uuid4())

@app.post("/bedrock/conversation")
def handle_bedrock_conversation():
    """
    Amazon Bedrock統合Lambda関数のメインハンドラー
    
    NPCとの会話リクエストを処理し、Bedrockモデルを使用してAIレスポンスを生成します。
    リクエスト内容に基づきNPCのプロンプトを作成します。
    
    Request Body:
        message (str): ユーザーメッセージ
        npcInfo (dict): NPCの情報
        previousMessages (list): 過去のメッセージ履歴
        sessionId (str, optional): セッションID
        scenarioId (str, optional): シナリオID
        messageId (str, optional): メッセージID
        emotionParams (dict, optional): 感情パラメータ
        language (str, optional): 言語設定（"ja", "en"など）
    
    Returns:
        dict: AIの応答メッセージを含む辞書
              {
                "message": str,  # AIの応答テキスト
                "sessionId": str, # セッションID
                "messageId": str  # メッセージID
              }
    
    Raises:
        Exception: Bedrockモデル呼び出しやメッセージ処理に失敗した場合
    """
    try:
        # APIGatewayRestResolverではリクエストボディは自動でパースされる
        request_body = app.current_event.json_body or {}
        logger.info("Bedrockの会話リクエストを処理中", extra={
            "request_body_keys": list(request_body.keys()) if request_body else None
        })
        
        # NPCとの対話内容を抽出
        user_message = request_body.get('message', "こんにちは")
        npc_info = request_body.get('npcInfo', {
            "name": "田中太郎",
            "role": "購買担当者", 
            "company": "株式会社ABC",
            "personality": ["厳しい", "効率重視", "合理的"]
        })
        previous_messages = request_body.get('previousMessages', [])
        session_id = request_body.get('sessionId')
        scenario_id = request_body.get('scenarioId')  # シナリオID
        message_id = request_body.get('messageId')  # メッセージID
        
        # 言語設定を抽出（未指定の場合はデフォルト言語ja）
        language = request_body.get('language', 'ja')
        
        # 感情パラメータを抽出
        emotion_params = request_body.get('emotionParams', {
            "angerLevel": 1,
            "trustLevel": 1,
            "progressLevel": 1
        })
        
        # ユーザーIDを取得
        user_id = get_user_id_from_event()
        

        
        # セッションを作成または更新
        session_id = create_or_update_session(
            user_id=user_id, 
            session_id=session_id,
            scenario_id=scenario_id,
            npc_info=npc_info
        )
        
        # ユーザーメッセージを保存（常に保存）
        user_message_id = save_message(
            user_id=user_id,
            session_id=session_id,
            sender='user',
            content=user_message,
            metrics=emotion_params  # メトリクスとして感情パラメータを保存
        )
        
        # シナリオ情報を取得（scenario_idが指定されている場合）
        scenario_info = None
        if scenario_id:
            scenario_info = get_scenario_info(scenario_id)
        
        # プロンプトの作成
        prompt = prompt_builder.build_npc_prompt(
            user_message=user_message,
            npc_info=npc_info,
            previous_messages=previous_messages,
            emotion_params=emotion_params,  # 感情パラメータを追加
            scenario_info=scenario_info,  # シナリオ情報を追加
            language=language  # 言語設定を追加
        )
        logger.info("NPC会話用のプロンプトを生成しました", extra={
            "npc_name": npc_info.get('name'),
            "user_message_length": len(user_message),
            "session_id": session_id,
            "language": language,
            "anger_level": emotion_params.get("angerLevel"),
            "trust_level": emotion_params.get("trustLevel"),
            "progress_level": emotion_params.get("progressLevel")
        })
        
        # Bedrockモデル呼び出し
        model_response = invoke_bedrock_model(prompt)
        
        logger.info("Bedrockモデルからの応答を受信しました", extra={
            "response_length": len(model_response),
            "session_id": session_id
        })
        
        # NPCメッセージを保存
        npc_message_id = save_message(
            user_id=user_id,
            session_id=session_id,
            sender='npc',
            content=model_response
        )
        
        # レスポンス形式（APIGatewayRestResolverでは直接辞書を返す）
        result = {
            "message": model_response,
            "sessionId": session_id,
            "messageId": npc_message_id
        }
        
        return result
        
    except Exception as error:
        logger.exception("Bedrock会話ハンドラーで予期しないエラーが発生しました", extra={
            "error": str(error),
            "session_id": request_body.get('sessionId')
        })
        # APIGatewayRestResolverでは例外をそのまま投げる
        from aws_lambda_powertools.event_handler.exceptions import InternalServerError
        raise InternalServerError(f"会話処理中にエラーが発生しました: {str(error)}")



def invoke_bedrock_model(prompt: str) -> str:
    """
    Bedrockモデルを呼び出してレスポンスを取得
    
    Converse APIを使用して応答を生成します。
    
    Args:
        prompt (str): Bedrockモデルに送信するプロンプト
        
    Returns:
        str: Bedrockモデルが生成した応答テキスト
        
    Raises:
        Exception: モデル呼び出し中にエラーが発生した場合
    """
    # 会話生成用のモデルIDを取得
    model_id = os.environ.get('BEDROCK_MODEL_CONVERSATION', 'amazon.nova-lite-v1:0')
    
    # Converse APIのリクエストパラメータ
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "text": prompt
                }
            ]
        }
    ]
    
    inference_config = {
        "maxTokens": 1000,
        "temperature": 0.7
    }
    
    try:
        logger.info("Bedrockモデルを呼び出し中", extra={
            "model_id": model_id
        })
        
        # Converse APIで呼び出し
        response = bedrock_runtime.converse(
            modelId=model_id,
            messages=messages,
            inferenceConfig=inference_config
        )
        
        # レスポンス解析
        output_message = response['output']['message']
        model_response = output_message['content'][0]['text']
        
        logger.info("Bedrockモデルの呼び出しに成功しました", extra={
            "model_id": model_id,
            "response_tokens": len(model_response.split()),
            "stop_reason": response.get('stopReason')
        })
        
        return model_response
        
    except Exception as e:
        logger.exception("Bedrockモデルの呼び出しに失敗しました", extra={
            "model_id": model_id,
            "error": str(e)
        })
        raise



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
    return app.resolve(event, context)
