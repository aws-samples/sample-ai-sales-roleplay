"""
結果保存Lambda関数

並列処理の結果を統合してDynamoDBに保存します。
"""

import os
import time
import json
import datetime
import boto3
import boto3.dynamodb.conditions
from aws_lambda_powertools import Logger
from typing import Dict, Any, List
from decimal import Decimal

# ロガー設定
logger = Logger(service="session-analysis-save")

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get("SESSION_FEEDBACK_TABLE")

# DynamoDBクライアント
dynamodb = boto3.resource("dynamodb")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    結果保存ハンドラー
    
    Args:
        event: 並列処理の結果を含むイベント
            - feedbackResult: フィードバック生成結果
            - videoResult: 動画分析結果
            - referenceResult: 参照資料評価結果
            
    Returns:
        保存結果
    """
    try:
        # 並列処理の結果を取得
        feedback_result = event.get("feedbackResult", {})
        video_result = event.get("videoResult", {})
        reference_result = event.get("referenceResult", {})
        
        # 共通データを取得（feedbackResultから）
        session_id = feedback_result.get("sessionId")
        user_id = feedback_result.get("userId")
        scenario_id = feedback_result.get("scenarioId")
        final_metrics = feedback_result.get("finalMetrics", {})
        messages = feedback_result.get("messages", [])
        scenario_goals = feedback_result.get("scenarioGoals", [])
        language = feedback_result.get("language", "ja")
        
        logger.info("結果保存開始", extra={
            "session_id": session_id,
            "feedback_generated": feedback_result.get("feedbackGenerated", False),
            "video_analyzed": video_result.get("videoAnalyzed", False),
            "reference_checked": reference_result.get("referenceChecked", False)
        })
        
        # フィードバックデータを取得
        feedback_data = feedback_result.get("feedbackData")
        
        # ゴール結果を生成
        goal_results = None
        if feedback_data and scenario_goals:
            goal_results = create_goal_results(feedback_data, scenario_goals, session_id)
        
        # 動画分析結果を取得
        video_analysis = video_result.get("videoAnalysis")
        video_url = video_result.get("videoUrl")
        
        # 参照資料評価結果を取得
        reference_check = reference_result.get("referenceCheck")
        
        # DynamoDBに保存
        save_to_dynamodb(
            session_id=session_id,
            scenario_id=scenario_id,
            feedback_data=feedback_data,
            final_metrics=final_metrics,
            goal_results=goal_results,
            video_analysis=video_analysis,
            video_url=video_url,
            reference_check=reference_check,
            language=language
        )
        
        # 分析ステータスを「完了」に更新
        update_analysis_status(session_id, "completed")
        
        logger.info("結果保存完了", extra={
            "session_id": session_id,
            "overall_score": feedback_data.get("scores", {}).get("overall") if feedback_data else None
        })
        
        return {
            "success": True,
            "sessionId": session_id,
            "analysisCompleted": True,
            "feedbackGenerated": feedback_result.get("feedbackGenerated", False),
            "videoAnalyzed": video_result.get("videoAnalyzed", False),
            "referenceChecked": reference_result.get("referenceChecked", False),
            "overallScore": feedback_data.get("scores", {}).get("overall") if feedback_data else None
        }
        
    except Exception as e:
        logger.exception("結果保存エラー", extra={"error": str(e)})
        
        # エラー時もステータスを更新
        session_id = event.get("feedbackResult", {}).get("sessionId")
        if session_id:
            update_analysis_status(session_id, "failed", str(e))
        
        raise


def save_to_dynamodb(
    session_id: str,
    scenario_id: str,
    feedback_data: Dict[str, Any],
    final_metrics: Dict[str, Any],
    goal_results: Dict[str, Any],
    video_analysis: Dict[str, Any],
    video_url: str,
    reference_check: Dict[str, Any],
    language: str
):
    """結果をDynamoDBに保存"""
    
    feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
    # ミリ秒を含むタイムスタンプを使用して、同一秒内の衝突を防ぐ
    # final-feedback用のサフィックスを追加してupdate_analysis_statusとの衝突を回避
    current_time = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z-feedback"
    
    # TTL設定（180日後に削除）
    expire_at = int(time.time()) + (180 * 24 * 60 * 60)
    
    # メインのフィードバックアイテム
    item = {
        "sessionId": session_id,
        "createdAt": current_time,
        "dataType": "final-feedback",
        "scenarioId": scenario_id,
        "language": language,
        "expireAt": expire_at
    }
    
    # フィードバックデータ
    if feedback_data:
        item["feedbackData"] = convert_to_dynamodb(feedback_data)
        item["overallScore"] = int(feedback_data.get("scores", {}).get("overall", 0))
    
    # 最終メトリクス
    if final_metrics:
        item["finalMetrics"] = convert_to_dynamodb(final_metrics)
    
    # ゴール結果
    if goal_results:
        item["goalResults"] = convert_to_dynamodb(goal_results)
    
    # 動画分析結果
    if video_analysis:
        item["videoAnalysis"] = convert_to_dynamodb(video_analysis)
        item["videoAnalysisCreatedAt"] = current_time
    
    if video_url:
        item["videoUrl"] = video_url
    
    # 参照資料評価結果
    if reference_check:
        item["referenceCheck"] = convert_to_dynamodb(reference_check)
        item["referenceCheckCreatedAt"] = current_time
    
    # 保存
    feedback_table.put_item(Item=item)
    
    logger.info("DynamoDB保存完了", extra={
        "session_id": session_id,
        "has_feedback": feedback_data is not None,
        "has_video_analysis": video_analysis is not None,
        "has_reference_check": reference_check is not None
    })


def update_analysis_status(session_id: str, status: str, error_message: str = None):
    """分析ステータスを更新"""
    try:
        feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
        current_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        
        # 既存のステータスアイテムを検索
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
            FilterExpression=boto3.dynamodb.conditions.Attr("dataType").eq("analysis-status"),
            ScanIndexForward=False,
            Limit=1
        )
        
        items = response.get("Items", [])
        
        if items:
            # 既存アイテムを更新
            item = items[0]
            update_expr = "SET #status = :status, updatedAt = :updated"
            expr_values = {
                ":status": status,
                ":updated": current_time
            }
            expr_names = {"#status": "status"}
            
            if error_message:
                update_expr += ", errorMessage = :error"
                expr_values[":error"] = error_message
            
            feedback_table.update_item(
                Key={
                    "sessionId": session_id,
                    "createdAt": item["createdAt"]
                },
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names
            )
        else:
            # 新規作成
            item = {
                "sessionId": session_id,
                "createdAt": current_time,
                "dataType": "analysis-status",
                "status": status,
                "updatedAt": current_time,
                "expireAt": int(time.time()) + (24 * 60 * 60)
            }
            if error_message:
                item["errorMessage"] = error_message
            
            feedback_table.put_item(Item=item)
        
        logger.debug(f"分析ステータス更新: {status}")
        
    except Exception as e:
        logger.error(f"ステータス更新エラー: {str(e)}")


def create_goal_results(
    feedback_data: Dict[str, Any],
    scenario_goals: List[Dict[str, Any]],
    session_id: str
) -> Dict[str, Any]:
    """フィードバックからゴール結果を生成"""
    
    if not scenario_goals:
        return {
            "scenarioGoals": [],
            "goalStatuses": [],
            "goalScore": 0
        }
    
    goal_achievement_score = feedback_data.get("scores", {}).get("goalAchievement", 5)
    goal_feedback = feedback_data.get("goalFeedback", {})
    
    achieved_goals = goal_feedback.get("achievedGoals", [])
    partially_achieved = goal_feedback.get("partiallyAchievedGoals", [])
    missed_goals = goal_feedback.get("missedGoals", [])
    
    goal_statuses = []
    total_progress = 0
    current_time = int(time.time() * 1000)
    
    for goal in scenario_goals:
        goal_id = goal.get("id")
        goal_description = goal.get("description", "")
        
        progress = 0
        achieved = False
        
        # 達成判定
        if any(goal_description in g for g in achieved_goals):
            progress = 100
            achieved = True
        elif any(goal_description in g for g in partially_achieved):
            progress = 65
        elif any(goal_description in g for g in missed_goals):
            progress = 0
        else:
            progress = max(0, min(100, goal_achievement_score * 10))
            achieved = progress >= 80
        
        goal_statuses.append({
            "goalId": goal_id,
            "progress": int(progress),
            "achieved": achieved,
            "achievedAt": current_time if achieved else None
        })
        
        total_progress += progress
    
    goal_score = int(total_progress / len(scenario_goals)) if scenario_goals else 0
    
    return {
        "scenarioGoals": scenario_goals,
        "goalStatuses": goal_statuses,
        "goalScore": goal_score
    }


def convert_to_dynamodb(obj):
    """PythonオブジェクトをDynamoDB対応形式に変換"""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_to_dynamodb(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_dynamodb(i) for i in obj]
    return obj
