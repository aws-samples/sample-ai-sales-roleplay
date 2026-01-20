"""
リアルタイムスコアリングエージェント用プロンプト定義
"""

from typing import Dict, Any, List


def build_scoring_prompt(
    user_message: str,
    previous_messages: List[Dict],
    current_scores: Dict[str, Any],
    goals: List[Dict],
    language: str = 'ja'
) -> str:
    """スコアリング用プロンプトを構築"""
    anger = current_scores.get('angerLevel', 1)
    trust = current_scores.get('trustLevel', 1)
    progress = current_scores.get('progressLevel', 1)
    
    # 会話履歴をフォーマット
    history = format_conversation_history(previous_messages, language)
    
    # ゴールをフォーマット
    goals_txt = format_goals(goals, language)
    
    if language == 'en':
        return f"""Evaluate the sales message and update scores.

Current Scores:
- Anger Level: {anger}/10
- Trust Level: {trust}/10
- Progress Level: {progress}/10

Conversation History:
{history}

Latest Message: {user_message}

Goals:
{goals_txt}

Analyze the latest message and provide updated scores with analysis."""
    else:
        return f"""営業メッセージを評価しスコアを更新してください。

現在のスコア:
- 怒りレベル: {anger}/10
- 信頼レベル: {trust}/10
- 進捗レベル: {progress}/10

会話履歴:
{history}

最新メッセージ: {user_message}

ゴール:
{goals_txt}

最新メッセージを分析し、更新されたスコアと分析を提供してください。"""


def format_conversation_history(messages: List[Dict], language: str = 'ja') -> str:
    """会話履歴をフォーマット"""
    if not messages:
        return "（履歴なし）" if language == 'ja' else "(No history)"
    
    sales_label = '営業' if language == 'ja' else 'Sales'
    customer_label = '顧客' if language == 'ja' else 'Customer'
    
    lines = []
    for msg in messages[-5:]:  # 最新5件のみ
        sender = msg.get('sender', '')
        content = msg.get('content', '')
        label = sales_label if sender == 'user' else customer_label
        lines.append(f"{label}: {content}")
    
    return "\n".join(lines)


def format_goals(goals: List[Dict], language: str = 'ja') -> str:
    """ゴールをフォーマット"""
    if not goals:
        return "（ゴールなし）" if language == 'ja' else "(No goals)"
    
    achieved_label = '達成' if language == 'ja' else 'Achieved'
    not_achieved_label = '未達成' if language == 'ja' else 'Not achieved'
    
    lines = []
    for goal in goals:
        description = goal.get('description', '')
        achieved = goal.get('achieved', False)
        status = achieved_label if achieved else not_achieved_label
        lines.append(f"- {description}: {status}")
    
    return "\n".join(lines)


def get_default_scores() -> Dict[str, int]:
    """デフォルトスコアを取得"""
    return {
        'angerLevel': 1,
        'trustLevel': 1,
        'progressLevel': 1
    }
