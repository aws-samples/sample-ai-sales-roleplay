"""
セッション分析開始Lambda関数

Step Functionsの最初のステップとして、セッション情報を検証し、
分析に必要なデータを収集します。
"""

import os
import time
import boto3
import boto3.dynamodb.conditions
from aws_lambda_powertools import Logger
from typing import Dict, Any

# ロガー設定
logger = Logger(service="session-analysis-start")

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE")
MESSAGES_TABLE = os.environ.get("MESSAGES_TABLE")
SCENARIOS_TABLE = os.environ.get("SCENARIOS_TABLE")
VIDEO_BUCKET = os.environ.get("VIDEO_BUCKET")

# AWSクライアント
dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")


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
        
        # メッセージ履歴を取得
        messages = get_messages(session_id)
        
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
        
        return {
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
        }
        
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


def get_messages(session_id: str) -> list:
    """メッセージ履歴を取得"""
    messages_table = dynamodb.Table(MESSAGES_TABLE)
    
    response = messages_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
        ScanIndexForward=True
    )
    
    return response.get("Items", [])


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
