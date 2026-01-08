"""
リアルタイムスコアリングエンジン
会話分析に基づくリアルタイムスコア計算を実装

Strands AgentsのStructured Output機能を使用して、
型安全なJSON形式で結果を返します。
"""

import json
import os
from typing import Dict, Any, List
from datetime import datetime

from aws_lambda_powertools import Logger
from strands import Agent
from strands.models import BedrockModel

from prompts import (
    get_realtime_scoring_prompt,
    get_goal_evaluation_prompt,
    get_system_prompt,
    RealtimeScores,
    GoalEvaluationList
)

logger = Logger(service="realtime-scoring-service")


def calculate_realtime_scores(
    user_input: str,
    previous_messages: List[Dict[str, Any]],
    session_id: str,
    scenario_goals: List[Dict[str, Any]] = None,
    current_goal_statuses: List[Dict[str, Any]] = None,
    language: str = "ja"
) -> Dict[str, Any]:
    """
    会話データに基づいてリアルタイムスコアを計算
    
    Args:
        user_input: ユーザーの最新の発言
        previous_messages: 過去の会話履歴
        session_id: セッションID
        scenario_goals: シナリオのゴール定義
        current_goal_statuses: 現在のゴール達成状況
        language: 言語コード ("ja" または "en")
        
    Returns:
        計算されたスコア情報
    """
    try:
        conversation_text = format_conversation_history(previous_messages, language)
        prompt = get_realtime_scoring_prompt(user_input, conversation_text, language)
        
        structured_scores = invoke_scoring_model(prompt, language)
        scores = {
            "angerLevel": structured_scores.angerLevel,
            "trustLevel": structured_scores.trustLevel,
            "progressLevel": structured_scores.progressLevel,
            "analysis": structured_scores.analysis,
            "timestamp": int(datetime.now().timestamp() * 1000),
            "sessionId": session_id
        }
        
        logger.info(f"リアルタイムスコア計算完了: {json.dumps(scores, ensure_ascii=False)}")
        
        if scenario_goals and current_goal_statuses:
            scores["goalStatuses"] = evaluate_goals(
                user_input, 
                previous_messages, 
                scenario_goals, 
                current_goal_statuses,
                language
            )
        
        return scores
        
    except Exception as e:
        logger.error(f"リアルタイムスコア計算エラー: {str(e)}")
        return {
            "angerLevel": 0,
            "trustLevel": 0,
            "progressLevel": 0,
            "analysis": f"分析中にエラーが発生しました: {str(e)}",
            "sessionId": session_id,
            "timestamp": int(datetime.now().timestamp() * 1000)
        }


def format_conversation_history(messages: List[Dict[str, Any]], language: str = "ja") -> str:
    """会話履歴をテキスト形式に整形"""
    if not messages:
        return "No conversation history." if language == "en" else "会話履歴はありません。"
    
    history_lines = []
    for msg in messages:
        if language == "en":
            sender_name = 'User (Sales Rep)' if msg.get('sender') == 'user' else 'NPC (Customer)'
        else:
            sender_name = 'ユーザー（営業担当者）' if msg.get('sender') == 'user' else 'NPC（顧客）'
        history_lines.append(f"{sender_name}: {msg.get('content', '')}")
    
    return "\n".join(history_lines)


def invoke_scoring_model(prompt: str, language: str = "ja") -> RealtimeScores:
    """
    Bedrockモデルを呼び出してスコアリング結果を取得（Structured Output使用）
    """
    model_id = os.environ.get('BEDROCK_MODEL_SCORING')
    system_prompt = get_system_prompt("realtime_scoring", language)
    
    logger.info(f"Bedrockモデル呼び出し（Structured Output）: {model_id}")
    
    bedrock_model = BedrockModel(
        model_id=model_id,
        temperature=0.1,
        max_tokens=1000
    )
    
    agent = Agent(
        model=bedrock_model,
        system_prompt=system_prompt
    )
    
    result = agent(prompt, structured_output_model=RealtimeScores)
    
    logger.info(f"Structured Output取得成功: {result.structured_output}")
    return result.structured_output


def evaluate_goals(
    user_input: str,
    previous_messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]],
    current_goal_statuses: List[Dict[str, Any]],
    language: str = "ja"
) -> List[Dict[str, Any]]:
    """ゴールの達成状況を評価する"""
    try:
        current_message = {"sender": "user", "content": user_input}
        conversation_text = format_conversation_history(previous_messages + [current_message], language)
        
        unachieved_goals = []
        unachieved_goal_statuses = []
        
        for goal_status in current_goal_statuses:
            if goal_status.get("achieved", False):
                continue
            goal_id = goal_status.get("goalId")
            goal = next((g for g in scenario_goals if g.get("id") == goal_id), None)
            if goal:
                unachieved_goals.append(goal)
                unachieved_goal_statuses.append(goal_status)
        
        updated_goal_statuses = current_goal_statuses.copy()
        
        if not unachieved_goals:
            return updated_goal_statuses
        
        goal_evaluation = evaluate_goals_with_bedrock(
            conversation_text,
            unachieved_goals,
            unachieved_goal_statuses,
            language
        )
        
        for evaluated_goal in goal_evaluation:
            goal_id = evaluated_goal.get("goalId")
            progress = evaluated_goal.get("progress", 0)
            achieved = evaluated_goal.get("achieved", False)
            
            for i, status in enumerate(updated_goal_statuses):
                if status.get("goalId") == goal_id:
                    updated_goal_statuses[i] = {
                        "goalId": goal_id,
                        "progress": progress,
                        "achieved": achieved,
                        "achievedAt": int(datetime.now().timestamp() * 1000) if achieved else None
                    }
                    break
        
        logger.info(f"ゴール評価完了: {json.dumps(updated_goal_statuses, ensure_ascii=False)}")
        return updated_goal_statuses
        
    except Exception as e:
        logger.error(f"ゴール評価エラー: {str(e)}")
        return current_goal_statuses


def evaluate_goals_with_bedrock(
    conversation_text: str,
    goals: List[Dict[str, Any]],
    current_goal_statuses: List[Dict[str, Any]],
    language: str = "ja"
) -> List[Dict[str, Any]]:
    """Bedrockを使用してゴールの達成状況を評価する（Structured Output使用）"""
    goals_json = json.dumps([{
        "id": goal.get("id"),
        "description": goal.get("description"),
        "criteria": goal.get("criteria", []),
        "isRequired": goal.get("isRequired", False),
        "priority": goal.get("priority", 3),
        "currentProgress": next(
            (status.get("progress", 0) for status in current_goal_statuses 
             if status.get("goalId") == goal.get("id")), 
            0
        )
    } for goal in goals], ensure_ascii=False)
    
    prompt = get_goal_evaluation_prompt(conversation_text, goals_json, language)
    model_id = os.environ.get('BEDROCK_MODEL_SCORING')
    system_prompt = get_system_prompt("goal_evaluation", language)
    
    bedrock_model = BedrockModel(
        model_id=model_id,
        temperature=0.1,
        max_tokens=2000
    )
    
    agent = Agent(
        model=bedrock_model,
        system_prompt=system_prompt
    )
    
    result = agent(prompt, structured_output_model=GoalEvaluationList)
    structured_output = result.structured_output
    
    goal_evaluations = [
        {
            "goalId": eval_item.goalId,
            "progress": eval_item.progress,
            "achieved": eval_item.achieved
        }
        for eval_item in structured_output.goals
    ]
    
    logger.info(f"ゴール評価結果: {json.dumps(goal_evaluations, ensure_ascii=False)}")
    return goal_evaluations
