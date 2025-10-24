"""
リファレンスチェック用Lambda関数

このモジュールは、ユーザーの発言内容のリファレンスチェックを行うLambda関数を実装します。
主な機能は以下の通りです：
- リファレンスチェック (/referenceCheck/{sessionId})
"""

import json
import os
import time
import boto3
import boto3.dynamodb.conditions
import traceback
from datetime import datetime

from typing import Dict, Any, List, Optional

from agent.types import QueryKnowledgeBaseOutput
from agent.agent import call_agent

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import (
    APIGatewayRestResolver,
    CORSConfig,
    Response,
)
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")
MESSAGES_TABLE = os.environ.get("MESSAGES_TABLE")
SCENARIO_TABLE = os.environ.get("SCENARIO_TABLE")

# CORS設定
cors_config = CORSConfig(allow_origin="*", allow_headers=["*"], max_age=300)

# APIGatewayルーター
app = APIGatewayRestResolver(cors=cors_config)

# ロガー
logger = Logger(service="referenceCheck-api")

# AWSクライアント
s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
bedrock_runtime = boto3.client("bedrock-runtime")
bedrock_agent_runtime = boto3.client("bedrock-agent-runtime")


# 例外クラス
class BadRequestError(Exception):
    pass


class ResourceNotFoundError(Exception):
    pass


class InternalServerError(Exception):
    pass


def format_messages_to_conversation(message_items: List[Dict[str, Any]]) -> str:
    """
    DynamoDBから取得したメッセージアイテムを会話形式の文字列に変換する

    Args:
      message_items: DynamoDBから取得したメッセージアイテムのリスト

    Returns:
      会話形式の文字列（例: 'user: "こんにちは"\nnpc: "こんにちは！"'）
    """
    conversation_lines = []

    for item in message_items:
        sender = item.get("sender", "")
        content = item.get("content", "")

        # senderとcontentが存在する場合のみ追加.
        if sender and content:
            conversation_lines.append(f'{sender}: "{content}"')

    return "\n".join(conversation_lines)


def get_messages(sessionId: str, scenarioId: str) -> List[Dict[str, Any]]:
    """
    セッションIDに対応するメッセージリストを取得する
    通常セッションと音声分析セッション両方に対応

    Args:
      sessionId: セッションID
      scenarioId: シナリオID

    Returns:
      メッセージアイテムのリスト
    """
    logger.debug("会話履歴をDynamoDBから取得")
    
    # まず音声分析セッションかどうかを確認
    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
    logger.debug(f"音声分析セッション判定開始: sessionId={sessionId}")
    logger.debug(f"使用するテーブル名: {SESSION_FEEDBACK_TABLE}")
    
    # 音声分析セッションかどうかの判定を簡単にするため、全データタイプを取得
    try:
        all_response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(sessionId),
            ScanIndexForward=False,
            Limit=10  # 複数のデータタイプを確認
        )
        
        all_items = all_response.get("Items", [])
        logger.info(f"セッション全データ取得結果: Items数={len(all_items)}")
        
        # データタイプごとに分類
        audio_analysis_items = []
        for item in all_items:
            data_type = item.get("dataType", "")
            logger.debug(f"見つかったデータタイプ: {data_type}")
            if data_type == "audio-analysis-result":
                audio_analysis_items.append(item)
                break
        
        logger.info(f"音声分析セッション判定結果: Items数={len(audio_analysis_items)}")
            
    except Exception as query_error:
        logger.error(f"音声分析セッション判定クエリエラー: {str(query_error)}")
        audio_analysis_items = []
    
    if audio_analysis_items:
        # 音声分析セッションの場合：セグメントからメッセージを構築
        logger.info(f"音声分析セッションのメッセージを構築: sessionId={sessionId}")
        audio_analysis_data = audio_analysis_items[0].get("audioAnalysisData", {})
        segments = audio_analysis_data.get("segments", [])
        
        message_items = []
        for segment in segments:
            sender = "user" if segment.get("role") == "customer" else "npc"
            message_items.append({
                "sender": sender,
                "content": segment.get("text", "")
            })
        
        logger.info(f"音声分析セッション：構築したメッセージ数={len(message_items)}")
        
        if not message_items:
            logger.warn(f"音声分析セッション {sessionId} にメッセージセグメントが見つかりません")
            raise ResourceNotFoundError(f"Audio analysis segments not found for session: {sessionId}")
        
        return message_items
    
    else:
        # 通常セッションの場合：Messagesテーブルから取得
        messages_table = dynamodb.Table(MESSAGES_TABLE)
        response = messages_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(sessionId),
            ScanIndexForward=True,  # 昇順ソート（最新が末尾）
        )

        logger.info(f"通常セッション DynamoDBクエリレスポンス: Items数={len(response.get('Items', []))}")
        message_items = response.get("Items", [])
        if not message_items:
            logger.warn(f"通常セッション {sessionId} のメッセージが見つかりません")
            raise ResourceNotFoundError(f"Messages not found for session: {sessionId}")

        # NPCの初期メッセージを登録
        initialMessage = get_initial_message(scenarioId)
        message_items.insert(0, {"sender": "npc", "content": initialMessage})

        logger.debug(f"通常セッション message_items: {len(message_items)}件")
        return message_items


def get_user_messages(message_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    メッセージリストからユーザーのメッセージのみを抽出する

    Args:
      message_items: 全メッセージアイテムのリスト

    Returns:
      ユーザーメッセージのリスト
    """
    user_messages = []
    for item in message_items:
        if item.get("sender") == "user" and item.get("content"):
            user_messages.append(item)

    logger.debug(f"ユーザーメッセージ数: {len(user_messages)}")
    return user_messages


def create_full_context(message_items: List[Dict[str, Any]]) -> str:
    """
    全メッセージを含むコンテキストを作成する

    Args:
      message_items: 全メッセージアイテムのリスト

    Returns:
      全会話を含む文字列
    """
    # 全メッセージを会話形式に整形
    return format_messages_to_conversation(message_items)


def get_scenario_id(sessionId: str) -> str:
    logger.debug("シナリオIDをDynamoDBのフィードバックテーブルから取得")
    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
    
    # まず通常セッション（final-feedback）を検索
    response = feedback_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(sessionId),
        FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("final-feedback"),
        ScanIndexForward=False,  # 降順ソート（最新が先頭）
    )
    feedback_items = response.get("Items", [])
    
    if feedback_items:
        # 通常セッションの場合
        item = feedback_items[0]
        scenario_id = item.get("scenarioId")
        logger.info(f"通常セッションのシナリオID: {scenario_id}")
        return scenario_id
    
    # 音声分析セッション（audio-analysis-result）を検索
    response = feedback_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(sessionId),
        FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("audio-analysis-result"),
        ScanIndexForward=False,  # 降順ソート（最新が先頭）
    )
    audio_analysis_items = response.get("Items", [])
    
    if audio_analysis_items:
        # 音声分析セッションの場合
        item = audio_analysis_items[0]
        scenario_id = item.get("scenarioId")
        logger.info(f"音声分析セッションのシナリオID: {scenario_id}")
        return scenario_id
    
    # どちらも見つからない場合はエラー
    logger.warn(f"セッション {sessionId} のデータが見つかりません（final-feedback, audio-analysis-result両方とも）")
    raise ResourceNotFoundError(f"Session data not found for session: {sessionId}")


def get_initial_message(scenarioId: str) -> str:
    logger.debug("NPCの初期メッセージをDynamoDBのフィードバックテーブルから取得")
    # DynamoDBのセッションフィードバックテーブルからシナリオIDを取得する
    scenario_table = dynamodb.Table(SCENARIO_TABLE)
    response = scenario_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("scenarioId").eq(
            scenarioId
        ),
        ScanIndexForward=False,  # 降順ソート（最新が先頭）
    )
    scenario_items = response.get("Items", [])
    if not scenario_items:
        logger.warn(f"シナリオID {scenarioId} のデータが見つかりません")
        raise ResourceNotFoundError(f"Scenario data not found")

    item = scenario_items[0]
    logger.info(f"取得したアイテムのキー: {list(item.keys())}")
    logger.info(f"initialMessage: {item.get('initialMessage')}")
    initialMessage = item.get("initialMessage")

    return initialMessage


def get_existing_reference_check(sessionId: str) -> Optional[Dict[str, Any]]:
    """
    既存のリファレンスチェック結果をDynamoDBから取得する

    Args:
      sessionId: セッションID

    Returns:
      既存のリファレンスチェック結果、存在しない場合はNone
    """
    logger.debug(f"既存のリファレンスチェック結果を検索: sessionId={sessionId}")

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    try:
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(
                sessionId
            ),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq(
                "reference-check"
            ),
            ScanIndexForward=False,  # 降順ソート（最新が先頭）
        )

        items = response.get("Items", [])
        if items:
            logger.info(
                f"既存のリファレンスチェック結果が見つかりました: sessionId={sessionId}"
            )
            return items[0].get("referenceCheckData")
        else:
            logger.info(
                f"既存のリファレンスチェック結果が見つかりません: sessionId={sessionId}"
            )
            return None

    except Exception as e:
        logger.error(f"既存のリファレンスチェック結果の取得中にエラー: {str(e)}")
        return None


def is_reference_check_in_progress(sessionId: str) -> bool:
    """
    リファレンスチェックが実行中かどうかを確認する

    Args:
      sessionId: セッションID

    Returns:
      実行中の場合True、そうでなければFalse
    """
    logger.debug(f"リファレンスチェック実行中フラグを確認: sessionId={sessionId}")

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    try:
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(
                sessionId
            ),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq(
                "reference-check-in-progress"
            ),
            ScanIndexForward=False,  # 降順ソート（最新が先頭）
        )

        items = response.get("Items", [])
        if items:
            # 実行中フラグが存在する場合、作成時刻をチェック（古すぎる場合は無効とする）
            created_at = items[0].get("createdAt")
            if created_at:
                from datetime import datetime, timezone

                try:
                    created_time = datetime.fromisoformat(
                        created_at.replace("Z", "+00:00")
                    )
                    current_time = datetime.now(timezone.utc)
                    # 10分以上古い場合は無効とする（処理が異常終了した可能性）
                    if (current_time - created_time).total_seconds() > 600:
                        logger.warn(
                            f"古い実行中フラグを検出（10分以上前）: sessionId={sessionId}, createdAt={created_at}"
                        )
                        # 古いフラグを削除
                        delete_reference_check_progress_flag(sessionId)
                        return False
                    else:
                        logger.info(
                            f"リファレンスチェック実行中: sessionId={sessionId}"
                        )
                        return True
                except Exception as e:
                    logger.error(f"実行中フラグの時刻解析エラー: {str(e)}")
                    return True  # エラーの場合は安全側に倒して実行中とする
            else:
                logger.info(f"リファレンスチェック実行中: sessionId={sessionId}")
                return True
        else:
            logger.debug(f"リファレンスチェック実行中フラグなし: sessionId={sessionId}")
            return False

    except Exception as e:
        logger.error(f"実行中フラグの確認中にエラー: {str(e)}")
        return False  # エラーの場合は実行を許可


def set_reference_check_progress_flag(sessionId: str) -> None:
    """
    リファレンスチェック実行中フラグを設定する

    Args:
      sessionId: セッションID
    """
    logger.debug(f"リファレンスチェック実行中フラグを設定: sessionId={sessionId}")

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    # TTL設定（1時間後に削除）
    expire_at = int(time.time()) + (60 * 60)
    current_time = datetime.utcnow().isoformat() + "Z"

    try:
        item = {
            "sessionId": sessionId,
            "createdAt": current_time,
            "dataType": "reference-check-in-progress",
            "expireAt": expire_at,
            "status": "processing",
            "timestamp": int(time.time()),  # 追加のタイムスタンプ
        }

        feedback_table.put_item(Item=item)
        logger.info(
            f"リファレンスチェック実行中フラグを設定しました: sessionId={sessionId}, createdAt={current_time}"
        )

    except Exception as e:
        logger.error(f"実行中フラグの設定中にエラー: {str(e)}")
        # フラグ設定エラーは処理を停止させない
        pass


def delete_reference_check_progress_flag(sessionId: str) -> None:
    """
    リファレンスチェック実行中フラグを削除する

    Args:
      sessionId: セッションID
    """
    logger.debug(f"リファレンスチェック実行中フラグを削除: sessionId={sessionId}")

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    try:
        # 実行中フラグを検索して削除
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(
                sessionId
            ),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq(
                "reference-check-in-progress"
            ),
        )

        items = response.get("Items", [])
        for item in items:
            # sessionIdとcreatedAtをキーとして削除
            feedback_table.delete_item(
                Key={"sessionId": sessionId, "createdAt": item["createdAt"]}
            )
            logger.info(
                f"リファレンスチェック実行中フラグを削除しました: sessionId={sessionId}, createdAt={item['createdAt']}"
            )

    except Exception as e:
        logger.error(f"実行中フラグの削除中にエラー: {str(e)}")
        # フラグ削除エラーは処理を停止させない
        pass


def save_reference_check_result(sessionId: str, result: Dict[str, Any]) -> None:
    """
    リファレンスチェック結果をDynamoDBに保存する

    Args:
      sessionId: セッションID
      result: リファレンスチェック結果
    """
    logger.debug(f"リファレンスチェック結果を保存: sessionId={sessionId}")

    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)

    # TTL設定（30日後に削除）
    expire_at = int(time.time()) + (30 * 24 * 60 * 60)
    current_time = datetime.utcnow().isoformat() + "Z"

    try:
        item = {
            "sessionId": sessionId,
            "createdAt": current_time,
            "dataType": "reference-check",
            "expireAt": expire_at,
            "referenceCheckData": result,
            "timestamp": int(time.time()),  # 追加のタイムスタンプ
        }

        feedback_table.put_item(Item=item)
        logger.info(
            f"リファレンスチェック結果を保存しました: sessionId={sessionId}, createdAt={current_time}"
        )

    except Exception as e:
        logger.error(f"リファレンスチェック結果の保存中にエラー: {str(e)}")
        # 保存エラーは処理を停止させない（結果は返す）
        pass


# リファレンスチェックの実行と結果取得
@app.get("/referenceCheck/<sessionId>")
def get_reference_check(sessionId: str):
    """
    セッションIDに対応するユーザーのメッセージ分析を実行し、適切なリファレンスに基づく説明ができているか結果を検証するエンドポイント

    パスパラメータ:
    - sessionId: セッションID

    クエリパラメータ:
    - language: 言語設定 ("ja" または "en")

    レスポンス:
    - リファレンスチェック結果（メッセージごとに実行し、結果を集約）
    """

    try:
        # クエリパラメータから言語設定を取得
        language = app.current_event.query_string_parameters.get("language", "ja") if app.current_event.query_string_parameters else "ja"
        logger.info(f"リファレンスチェックを開始: sessionId={sessionId}, language={language}")

        # 既存のリファレンスチェック結果をチェック
        existing_result = get_existing_reference_check(sessionId)
        if existing_result:
            logger.info(
                f"既存のリファレンスチェック結果を返します: sessionId={sessionId}"
            )
            return existing_result

        # 実行中フラグをチェック
        if is_reference_check_in_progress(sessionId):
            logger.info(f"リファレンスチェックが既に実行中です: sessionId={sessionId}")
            # 実行中の場合は409 Conflictを返す
            return Response(
                status_code=409,
                content_type="application/json",
                body=json.dumps(
                    {
                        "error": "Reference check is already in progress",
                        "message": "リファレンスチェックが既に実行中です。完了までお待ちください。",
                        "sessionId": sessionId,
                    }
                ),
            )

        logger.info(f"新しいリファレンスチェックを実行します: sessionId={sessionId}")

        # 実行中フラグを設定
        set_reference_check_progress_flag(sessionId)

        # シナリオIDの取得
        scenario_id = get_scenario_id(sessionId=sessionId)

        # 本セッションのメッセージをDynamoDBから取得
        all_messages = get_messages(sessionId=sessionId, scenarioId=scenario_id)

        # ユーザーのメッセージのみを抽出
        user_messages = get_user_messages(all_messages)

        if not user_messages:
            logger.info(f"セッション {sessionId} にユーザーメッセージが見つかりません")
            empty_result = {
                "messages": [],
                "summary": {
                    "totalMessages": 0,
                    "checkedMessages": 0,
                },
            }
            # 空の結果も保存
            save_reference_check_result(sessionId, empty_result)
            return empty_result

        logger.info(
            f"リファレンスチェック対象のユーザーメッセージ数: {len(user_messages)}"
        )

        # 全メッセージのコンテキストを作成（一度だけ作成して再利用）
        full_context = create_full_context(all_messages)
        logger.debug(f"全コンテキスト作成完了: 文字数={len(full_context)}")

        # 各ユーザーメッセージに対してリファレンスチェックを実行
        check_results = []

        for i, user_message_item in enumerate(user_messages):
            user_message = user_message_item.get("content", "")
            if not user_message.strip():
                continue

            logger.debug(
                f"メッセージ {i+1}/{len(user_messages)} をチェック中: {user_message[:100]}..."
            )

            # 単一メッセージのリファレンスチェックを実行（全コンテキストを使用）
            try:

                result: QueryKnowledgeBaseOutput = call_agent(
                    user_message, full_context, scenario_id, language
                )

                # PydanticモデルをDynamoDB互換の辞書に変換
                result_dict = result.model_dump()
                check_results.append(result_dict)
                logger.debug(f"メッセージ {i+1} のチェック完了")

            except Exception as e:
                logger.error(f"メッセージ {i+1} のチェック中にエラー: {str(e)}")
                # エラーが発生した場合もデフォルト結果を追加
                check_results.append(
                    {
                        "message": user_message,
                        "relatedDocument": "",
                        "reviewComment": f"チェック中にエラーが発生しました: {str(e)}",
                        "related": False,
                    }
                )

        # 結果を集約
        aggregated_result = {
            "messages": check_results,
            "summary": {
                "totalMessages": len(user_messages),
                "checkedMessages": len(check_results),
            },
        }

        logger.info(
            f"リファレンスチェック完了: 総メッセージ数={aggregated_result['summary']['totalMessages']}, チェック済み={aggregated_result['summary']['checkedMessages']}"
        )

        # 結果をDynamoDBに保存
        save_reference_check_result(sessionId, aggregated_result)

        # 実行中フラグを削除
        delete_reference_check_progress_flag(sessionId)

        return aggregated_result

    except ResourceNotFoundError:
        # 実行中フラグを削除
        delete_reference_check_progress_flag(sessionId)
        # 既にログ出力済みなので再スロー
        raise
    except InternalServerError:
        # 実行中フラグを削除
        delete_reference_check_progress_flag(sessionId)
        # 既にログ出力済みなので再スロー
        raise
    except Exception as e:
        # 実行中フラグを削除
        delete_reference_check_progress_flag(sessionId)
        logger.error(
            f"メッセージの分析実行中に予期しないエラーが発生: sessionId={sessionId}, error={str(e)}"
        )
        logger.error(f"スタックトレース: {traceback.format_exc()}")
        raise InternalServerError(f"Unexpected error during reference check: {str(e)}")


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
                "Access-Control-Allow-Methods": "*",
            },
        }
