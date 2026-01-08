"""
フィードバック生成サービス

Strands AgentsのStructured Output機能を使用した
フィードバック生成とDynamoDBへの保存機能を提供します。
"""

import json
import time
import os
from typing import Dict, Any, List, Optional
from aws_lambda_powertools import Logger
import boto3.dynamodb.conditions

from strands import Agent
from strands.models import BedrockModel

from utils import convert_decimal_to_json_serializable, dynamodb, sessions_table
from prompts import (
    get_analysis_prompt,
    get_system_prompt,
    FeedbackAnalysis
)

logger = Logger(service="feedback-service")


def generate_feedback_with_bedrock(
    session_id: str,
    metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    goal_statuses: List[Dict[str, Any]] = None,
    scenario_goals: List[Dict[str, Any]] = None,
    language: str = "ja"
) -> Dict[str, Any]:
    """
    Bedrockを使用して会話のフィードバック分析を実行（Structured Output使用）
    
    Args:
        session_id: セッションID
        metrics: 最終メトリクス
        messages: 会話履歴
        goal_statuses: ゴール達成状況
        scenario_goals: シナリオのゴール定義
        language: 言語設定
        
    Returns:
        詳細なフィードバック分析とスコアを含む辞書
    """
    model_id = os.environ.get('BEDROCK_MODEL_FEEDBACK', 'amazon.nova-pro-v1:0')
    
    # 会話履歴をテキスト形式に整形
    if language == "en":
        user_label, npc_label = "User", "NPC"
    else:
        user_label, npc_label = "ユーザー", "NPC"
        
    conversation_text = "\n\n".join([
        f"{user_label if msg['sender'] == 'user' else npc_label}: {msg['content']}"
        for msg in messages
    ])
    
    # メトリクス値を取得
    anger_value = metrics.get('angerLevel', metrics.get('anger', 0))
    trust_value = metrics.get('trustLevel', metrics.get('trust', 0))
    progress_value = metrics.get('progressLevel', metrics.get('progress', 0))
    
    # ゴール分析セクションの作成
    goal_analysis_section = _build_goal_analysis_section(scenario_goals, goal_statuses, language)
    
    # プロンプトを作成
    prompt = get_analysis_prompt(
        anger_value, trust_value, progress_value,
        conversation_text, goal_analysis_section, language
    )
    system_prompt = get_system_prompt("feedback", language)
    
    try:
        logger.info("Invoking Bedrock model for feedback analysis (Structured Output)", extra={
            "model_id": model_id,
            "session_id": session_id
        })
        
        bedrock_model = BedrockModel(
            model_id=model_id,
            temperature=0.2,
            max_tokens=2000
        )
        
        agent = Agent(
            model=bedrock_model,
            system_prompt=system_prompt
        )
        
        result = agent(prompt, structured_output_model=FeedbackAnalysis)
        structured_output = result.structured_output
        
        # Pydanticモデルを辞書に変換
        feedback_data = structured_output.model_dump()
        
        logger.info("Successfully generated feedback with Structured Output", extra={
            "session_id": session_id,
            "overall_score": feedback_data.get("scores", {}).get("overall")
        })
        
        return feedback_data
        
    except Exception as e:
        logger.exception("Feedback generation failed", extra={
            "model_id": model_id,
            "session_id": session_id,
            "error": str(e)
        })
        raise


def _build_goal_analysis_section(
    scenario_goals: List[Dict[str, Any]] = None,
    goal_statuses: List[Dict[str, Any]] = None,
    language: str = "ja"
) -> str:
    """ゴール分析セクションを構築"""
    if not scenario_goals:
        return ""
    
    scenario_goals_json = convert_decimal_to_json_serializable(scenario_goals)
    
    if goal_statuses:
        achieved_goals = [s for s in goal_statuses if s.get('achieved', False)]
        goal_statuses_json = convert_decimal_to_json_serializable(goal_statuses)
        
        if language == "en":
            return f"""

## Goal Achievement Analysis
- Total Goals: {len(scenario_goals)}
- Achieved Goals: {len(achieved_goals)}
- Scenario Goal Definitions: {json.dumps(scenario_goals_json, ensure_ascii=False)}
- Current Achievement Status: {json.dumps(goal_statuses_json, ensure_ascii=False)}

**Important**: In the goalFeedback section, analyze based on the scenario goal definitions above.
- achievedGoals: List descriptions of actually achieved scenario goals
- partiallyAchievedGoals: List descriptions of partially achieved scenario goals
- missedGoals: List descriptions of unachieved scenario goals
- Focus on scenario-specific goals, not general sales perspectives
"""
        else:
            return f"""

## ゴール達成状況分析
- 設定ゴール数: {len(scenario_goals)}個
- 達成済みゴール: {len(achieved_goals)}個
- シナリオのゴール定義: {json.dumps(scenario_goals_json, ensure_ascii=False)}
- 現在の達成状況: {json.dumps(goal_statuses_json, ensure_ascii=False)}

**重要**: goalFeedbackセクションでは、必ず上記のシナリオのゴール定義に基づいて分析してください。
- achievedGoals: 実際に達成されたシナリオのゴールのdescriptionを記載
- partiallyAchievedGoals: 部分的に達成されたシナリオのゴールのdescriptionを記載  
- missedGoals: 未達成のシナリオのゴールのdescriptionを記載
- 一般的な営業観点ではなく、このシナリオ固有のゴールに焦点を当てる
"""
    else:
        if language == "en":
            return f"""

## Goal Settings
- Scenario Goals: {json.dumps(scenario_goals_json, ensure_ascii=False)}

**Important**: In the goalFeedback section, analyze based on the scenario goal definitions above.
Infer goal achievement from conversation content and use specific goal descriptions defined in the scenario.
Focus on scenario-specific goals, not general sales perspectives.
"""
        else:
            return f"""

## ゴール設定
- シナリオのゴール: {json.dumps(scenario_goals_json, ensure_ascii=False)}

**重要**: goalFeedbackセクションでは、必ず上記のシナリオのゴール定義に基づいて分析してください。
会話内容からゴール達成度を推測し、シナリオで定義された具体的なゴールのdescriptionを使用してください。
一般的な営業観点ではなく、このシナリオ固有のゴールに焦点を当てて評価してください。
"""


def save_feedback_to_dynamodb(
    session_id: str,
    feedback_data: Dict[str, Any],
    final_metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    goal_data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    フィードバックデータをDynamoDBに保存
    
    Args:
        session_id: セッションID
        feedback_data: フィードバック分析結果
        final_metrics: 最終メトリクス
        messages: 会話履歴
        goal_data: ゴール関連データ
        
    Returns:
        保存が成功した場合はTrue
    """
    try:
        scenario_id = None
        user_id = None
        
        # セッション情報を取得
        if sessions_table:
            try:
                session_response = sessions_table.scan(
                    FilterExpression=boto3.dynamodb.conditions.Attr('sessionId').eq(session_id)
                )
                session_items = session_response.get('Items', [])
                if session_items:
                    session_info = session_items[0]
                    scenario_id = session_info.get('scenarioId')
                    user_id = session_info.get('userId')
                    
                    logger.info("セッション情報を取得しました", extra={
                        "session_id": session_id,
                        "scenario_id": scenario_id,
                        "user_id": user_id
                    })
            except Exception as session_error:
                logger.warning("セッション情報の取得に失敗しました", extra={
                    "error": str(session_error),
                    "session_id": session_id
                })
        
        table_name = os.environ.get('SESSION_FEEDBACK_TABLE', 'dev-AISalesRolePlay-SessionFeedback')
        table = dynamodb.Table(table_name)
        
        ttl = int(time.time()) + (180 * 24 * 60 * 60)
        current_timestamp = time.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        overall_score = feedback_data.get("scores", {}).get("overall", 0)
        
        item = {
            "sessionId": session_id,
            "createdAt": current_timestamp,
            "dataType": "final-feedback",
            "feedbackData": feedback_data,
            "finalMetrics": final_metrics,
            "messageCount": len(messages),
            "updatedAt": current_timestamp,
            "expireAt": ttl,
            "overallScore": overall_score
        }
        
        if scenario_id:
            item["scenarioId"] = scenario_id
        if user_id:
            item["userId"] = user_id
        if goal_data:
            item["goalResults"] = goal_data
            logger.info("ゴールデータも含めて保存します", extra={
                "session_id": session_id,
                "goal_score": goal_data.get("goalScore", 0),
                "goal_statuses_count": len(goal_data.get("goalStatuses", []))
            })
        
        table.put_item(Item=item)
        
        logger.info("フィードバックデータを保存しました", extra={
            "session_id": session_id,
            "scenario_id": scenario_id,
            "overall_score": overall_score,
            "message_count": len(messages),
            "has_goal_data": bool(goal_data),
            "updated_at": current_timestamp
        })
        
        return True
        
    except Exception as e:
        logger.error("フィードバックデータの保存に失敗しました", extra={
            "error": str(e),
            "session_id": session_id
        })
        return False
