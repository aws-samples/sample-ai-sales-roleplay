"""
セッション分析開始Lambda関数

Step Functionsの最初のステップとして、セッション情報を検証し、
分析に必要なデータを収集します。

会話履歴はAgentCore Memoryから取得します。
"""

import os
import time
import json
import boto3
import boto3.dynamodb.conditions
from aws_lambda_powertools import Logger
from typing import Dict, Any, List
from decimal import Decimal
from datetime import datetime

# ロガー設定
logger = Logger(service="session-analysis-start")

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE")
MESSAGES_TABLE = os.environ.get("MESSAGES_TABLE")
SCENARIOS_TABLE = os.environ.get("SCENARIOS_TABLE")
VIDEO_BUCKET = os.environ.get("VIDEO_BUCKET")
AGENTCORE_MEMORY_ID = os.environ.get("AGENTCORE_MEMORY_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-west-2")

# AWSクライアント
dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
agentcore_client = None

def json_serializable(obj):
    """
    オブジェクトをJSONシリアライズ可能な形式に変換する
    """
    if obj is None:
        return None
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    elif isinstance(obj, dict):
        return {k: json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [json_serializable(item) for item in obj]
    elif isinstance(obj, (str, int, float, bool)):
        return obj
    else:
        return str(obj)

def get_agentcore_client():
    """AgentCore クライアントを取得（遅延初期化）"""
    global agentcore_client
    if agentcore_client is None:
        agentcore_client = boto3.client("bedrock-agentcore", region_name=AWS_REGION)
    return agentcore_client


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    セッション分析開始ハンドラー
    
    Args:
        event: Step Functions入力
            - sessionId: セッションID
            - userId: ユーザーID
            - language: 言語設定 (ja/en)
            
    Returns:
        分析に必要なセッションデータ
    """
    try:
        session_id = event.get("sessionId")
        user_id = event.get("userId")
        language = event.get("language", "ja")
        
        logger.info("セッション分析開始", extra={
            "session_id": session_id,
            "user_id": user_id,
            "language": language
        })
        
        if not session_id or not user_id:
            raise ValueError("sessionIdとuserIdは必須です")
        
        # 分析ステータスを「処理中」に更新
        update_analysis_status(session_id, "processing")
        
        # セッション情報を取得
        session_info = get_session_info(session_id, user_id)
        if not session_info:
            raise ValueError(f"セッションが見つかりません: {session_id}")
        
        scenario_id = session_info.get("scenarioId")
        
        # シナリオ情報を取得
        scenario_info = get_scenario_info(scenario_id) if scenario_id else None
        scenario_goals = scenario_info.get("goals", []) if scenario_info else []
        
        # メッセージ履歴を取得（user_idをactor_idとして渡す）
        messages = get_messages(session_id, user_id)
        
        # リアルタイムメトリクスを取得
        realtime_metrics = get_realtime_metrics(session_id)
        
        # 最終メトリクスを計算
        final_metrics = calculate_final_metrics(realtime_metrics)
        
        # 動画ファイルの存在確認
        video_key = find_session_video(session_id)
        has_video = video_key is not None
        
        # Knowledge Baseの有無を確認（pdfFilesがあればKnowledge Baseが使用可能）
        has_knowledge_base = False
        if scenario_info:
            pdf_files = scenario_info.get("pdfFiles", [])
            has_knowledge_base = len(pdf_files) > 0
            logger.info("Knowledge Base判定", extra={
                "scenario_id": scenario_id,
                "pdf_files_count": len(pdf_files),
                "has_knowledge_base": has_knowledge_base
            })
        
        logger.info("セッションデータ収集完了", extra={
            "session_id": session_id,
            "messages_count": len(messages),
            "realtime_metrics_count": len(realtime_metrics),
            "has_video": has_video,
            "has_knowledge_base": has_knowledge_base,
            "scenario_goals_count": len(scenario_goals)
        })
        
        # JSON化可能な形式に変換して返す
        return json_serializable({
            "sessionId": session_id,
            "userId": user_id,
            "language": language,
            "scenarioId": scenario_id,
            "sessionInfo": session_info,
            "scenarioInfo": scenario_info,
            "scenarioGoals": scenario_goals,
            "messages": messages,
            "realtimeMetrics": realtime_metrics,
            "finalMetrics": final_metrics,
            "hasVideo": has_video,
            "videoKey": video_key,
            "hasKnowledgeBase": has_knowledge_base,
            "startTime": int(time.time() * 1000)
        })
        
    except Exception as e:
        logger.exception("セッション分析開始エラー", extra={"error": str(e)})
        # エラー時もステータスを更新
        if "session_id" in dir():
            update_analysis_status(session_id, "failed", str(e))
        raise


def update_analysis_status(session_id: str, status: str, error_message: str = None):
    """分析ステータスをDynamoDBに保存"""
    try:
        feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
        current_time = f"{int(time.time() * 1000)}"
        
        item = {
            "sessionId": session_id,
            "createdAt": current_time,
            "dataType": "analysis-status",
            "status": status,
            "updatedAt": current_time,
            "expireAt": int(time.time()) + (24 * 60 * 60)  # 24時間後に削除
        }
        
        if error_message:
            item["errorMessage"] = error_message
            
        feedback_table.put_item(Item=item)
        logger.debug(f"分析ステータス更新: {status}")
        
    except Exception as e:
        logger.error(f"ステータス更新エラー: {str(e)}")


def get_session_info(session_id: str, user_id: str) -> Dict[str, Any]:
    """セッション情報を取得"""
    sessions_table = dynamodb.Table(SESSIONS_TABLE)
    
    response = sessions_table.get_item(
        Key={
            "userId": user_id,
            "sessionId": session_id
        }
    )
    
    return response.get("Item")


def get_scenario_info(scenario_id: str) -> Dict[str, Any]:
    """シナリオ情報を取得"""
    scenarios_table = dynamodb.Table(SCENARIOS_TABLE)
    
    response = scenarios_table.get_item(
        Key={"scenarioId": scenario_id}
    )
    
    return response.get("Item")


def get_messages(session_id: str, user_id: str = None) -> list:
    """メッセージ履歴を取得
    
    AgentCore Memoryから会話履歴を取得します。
    フォールバックとしてDynamoDBからも取得を試みます。
    
    Args:
        session_id: セッションID
        user_id: ユーザーID（AgentCore MemoryのactorIdとして使用）
    """
    logger.info(f"メッセージ取得開始: session_id={session_id}, user_id={user_id}, AGENTCORE_MEMORY_ID={AGENTCORE_MEMORY_ID}")
    
    # まずAgentCore Memoryから取得を試みる
    if AGENTCORE_MEMORY_ID:
        # user_idをactor_idとして使用（フォールバック: default_user）
        actor_id = user_id if user_id else "default_user"
        messages = get_messages_from_agentcore_memory(session_id, actor_id)
        if messages:
            logger.info(f"AgentCore Memoryから{len(messages)}件のメッセージを取得")
            return messages
        else:
            # フォールバック: 既存セッション互換性のためdefault_userで再試行
            if user_id and actor_id != "default_user":
                logger.warning(f"user_id={user_id}で取得できなかったため、default_userで再試行")
                messages = get_messages_from_agentcore_memory(session_id, "default_user")
                if messages:
                    logger.info(f"AgentCore Memory（default_user）から{len(messages)}件のメッセージを取得")
                    return messages
            
            logger.warning(f"AgentCore Memoryからメッセージを取得できませんでした（actor_id={actor_id}）。DynamoDBにフォールバック")
    else:
        logger.warning("AGENTCORE_MEMORY_IDが設定されていません。DynamoDBから取得します")
    
    # フォールバック: DynamoDBから取得
    messages_table = dynamodb.Table(MESSAGES_TABLE)
    
    response = messages_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
        ScanIndexForward=True
    )
    
    dynamodb_messages = response.get("Items", [])
    logger.info(f"DynamoDBから{len(dynamodb_messages)}件のメッセージを取得")
    
    return dynamodb_messages


def get_messages_from_agentcore_memory(session_id: str, actor_id: str = "default_user") -> List[Dict[str, Any]]:
    """AgentCore Memoryから会話履歴を取得
    
    AgentCore Memory Session Managerが保存するconversational形式のペイロードを解析。
    
    データ構造:
    {
      "conversational": {
        "content": {
          "text": "{\"message\": {\"role\": \"user\", \"content\": [{\"text\": \"実際のメッセージ\"}]}}"
        },
        "role": "USER"
      }
    }
    """
    try:
        client = get_agentcore_client()
        
        logger.info(f"AgentCore Memory API呼び出し: memoryId={AGENTCORE_MEMORY_ID}, sessionId={session_id}, actorId={actor_id}")
        
        response = client.list_events(
            memoryId=AGENTCORE_MEMORY_ID,
            sessionId=session_id,
            actorId=actor_id,
            maxResults=100,
        )
        
        events_list = response.get("events", [])
        logger.info(f"AgentCore Memoryから{len(events_list)}件のイベントを取得: session={session_id}, actor={actor_id}")
        
        # 最初のイベントの構造をログ出力（デバッグ用）
        if events_list:
            logger.info(f"最初のイベント構造: {json.dumps(events_list[0], default=str)[:500]}")
        
        messages = []
        
        for event_idx, event in enumerate(events_list):
            payload_list = event.get("payload", [])
            event_timestamp = event.get("eventTimestamp", "")
            
            logger.debug(f"イベント {event_idx}: payload数={len(payload_list)}, timestamp={event_timestamp}")
            
            for payload_idx, payload_item in enumerate(payload_list):
                conversational = payload_item.get("conversational", {})
                if conversational:
                    role = conversational.get("role", "").upper()
                    content_obj = conversational.get("content", {})
                    content_text = content_obj.get("text", "") if isinstance(content_obj, dict) else ""
                    
                    logger.debug(f"  Payload {payload_idx}: role={role}, content_text長さ={len(content_text)}")
                    
                    if not content_text:
                        continue
                    
                    # content_textがJSON文字列の場合（Session Managerの形式）
                    actual_content = None
                    try:
                        inner_json = json.loads(content_text)
                        logger.debug(f"  内部JSON解析成功: keys={list(inner_json.keys()) if isinstance(inner_json, dict) else 'not dict'}")
                        
                        # Session Managerの形式: {"message": {"role": "...", "content": [{"text": "..."}]}}
                        if isinstance(inner_json, dict) and "message" in inner_json:
                            message_obj = inner_json["message"]
                            content_list = message_obj.get("content", [])
                            if content_list and isinstance(content_list, list):
                                for content_item in content_list:
                                    if isinstance(content_item, dict) and "text" in content_item:
                                        actual_content = content_item["text"]
                                        break
                        elif isinstance(inner_json, dict) and "content" in inner_json:
                            actual_content = inner_json.get("content", "")
                        elif isinstance(inner_json, dict) and "text" in inner_json:
                            actual_content = inner_json.get("text", "")
                    except (json.JSONDecodeError, TypeError) as e:
                        logger.debug(f"  JSON解析失敗（プレーンテキストとして処理）: {e}")
                        actual_content = content_text
                    
                    if actual_content:
                        sender = "user" if role in ["USER", "HUMAN"] else "npc"
                        # event_timestampがdatetimeオブジェクトの場合は文字列に変換
                        timestamp_str = event_timestamp.isoformat() if hasattr(event_timestamp, 'isoformat') else str(event_timestamp)
                        messages.append({
                            "sender": sender,
                            "content": actual_content,
                            "timestamp": timestamp_str,
                        })
                        logger.debug(f"  メッセージ追加: sender={sender}, content={actual_content[:50]}...")
        
        # タイムスタンプでソート（古い順）
        messages.sort(key=lambda x: x.get("timestamp", ""))
        
        logger.info(f"AgentCore Memoryから{len(messages)}件のメッセージをパース完了")
        
        # 全メッセージをログ出力（デバッグ用）
        for i, msg in enumerate(messages):
            logger.info(f"  Message {i+1}: sender={msg.get('sender')}, content={msg.get('content', '')[:100]}...")
        
        return messages
        
    except Exception as e:
        logger.error(f"AgentCore Memoryからのメッセージ取得エラー: {e}", exc_info=True)
        return []


def get_realtime_metrics(session_id: str) -> list:
    """リアルタイムメトリクスを取得"""
    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
    
    response = feedback_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
        FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("realtime-metrics"),
        ScanIndexForward=False
    )
    
    return response.get("Items", [])


def calculate_final_metrics(realtime_metrics: list) -> Dict[str, Any]:
    """最終メトリクスを計算"""
    if not realtime_metrics:
        return {
            "angerLevel": 1,
            "trustLevel": 5,
            "progressLevel": 5,
            "analysis": ""
        }
    
    # 最新のメトリクスを使用
    latest = realtime_metrics[0]
    
    return {
        "angerLevel": int(latest.get("angerLevel", 1)),
        "trustLevel": int(latest.get("trustLevel", 5)),
        "progressLevel": int(latest.get("progressLevel", 5)),
        "analysis": latest.get("analysis", "")
    }


def find_session_video(session_id: str) -> str:
    """セッションの動画ファイルを検索"""
    logger.info(f"VIDEO_BUCKET環境変数: {VIDEO_BUCKET}")
    
    if not VIDEO_BUCKET:
        logger.warning("VIDEO_BUCKET環境変数が設定されていません")
        return None
        
    try:
        prefix = f"videos/{session_id}/"
        logger.info(f"動画ファイル検索開始: bucket={VIDEO_BUCKET}, prefix={prefix}")
        
        response = s3.list_objects_v2(
            Bucket=VIDEO_BUCKET,
            Prefix=prefix,
            MaxKeys=10
        )
        
        contents = response.get("Contents", [])
        logger.info(f"S3検索結果: {len(contents)}件のオブジェクトが見つかりました")
        
        if contents:
            for obj in contents:
                logger.info(f"  - {obj['Key']} (LastModified: {obj['LastModified']})")
        
        if not contents:
            logger.info(f"動画ファイルが見つかりません: prefix={prefix}")
            return None
        
        # 最新の動画ファイルを返す
        video_files = [
            obj for obj in contents 
            if obj["Key"].endswith(".mp4") or obj["Key"].endswith(".webm")
        ]
        
        logger.info(f"動画ファイル数: {len(video_files)}件")
        
        if video_files:
            # 最新のファイルを選択
            latest = max(video_files, key=lambda x: x["LastModified"])
            logger.info(f"最新の動画ファイル: {latest['Key']}")
            return latest["Key"]
            
        logger.info("mp4/webmファイルが見つかりません")
        return None
        
    except Exception as e:
        logger.exception(f"動画ファイル検索エラー: {str(e)}")
        return None
