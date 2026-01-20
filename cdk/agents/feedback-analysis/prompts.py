"""
フィードバック分析エージェント用プロンプト定義
"""

from typing import Dict, Any, List


def format_conversation_for_analysis(messages: List[Dict[str, Any]], language: str = 'ja') -> str:
    """会話履歴を分析用テキストに整形"""
    if not messages:
        return "会話履歴はありません。" if language == 'ja' else "No conversation history."
    
    user_label = 'ユーザー' if language == 'ja' else 'User'
    npc_label = 'NPC'
    
    lines = []
    for msg in messages:
        sender = msg.get('sender', '')
        content = msg.get('content', '')
        if sender in ['user', 'npc']:
            label = user_label if sender == 'user' else npc_label
            lines.append(f"{label}: {content}")
    
    return "\n\n".join(lines)


def build_feedback_prompt(
    metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]],
    language: str
) -> str:
    """フィードバック生成用プロンプトを構築"""
    conversation_text = format_conversation_for_analysis(messages, language)
    
    anger_value = metrics.get('angerLevel', 1)
    trust_value = metrics.get('trustLevel', 5)
    progress_value = metrics.get('progressLevel', 5)
    
    goal_section = ""
    if scenario_goals:
        goals_text = "\n".join([f"- {g.get('description', '')}" for g in scenario_goals])
        goal_section = f"\n## シナリオのゴール\n{goals_text}\n" if language == 'ja' else f"\n## Scenario Goals\n{goals_text}\n"
    
    # 会話履歴がない場合の警告
    no_history_warning = ""
    if not messages:
        if language == 'en':
            no_history_warning = "\n**IMPORTANT: No conversation history is available. Provide generic feedback based only on the metrics provided. Do not invent or assume any conversation content.**\n"
        else:
            no_history_warning = "\n**重要: 会話履歴がありません。提供されたメトリクスのみに基づいて一般的なフィードバックを提供してください。会話内容を想像したり仮定したりしないでください。**\n"
    
    if language == 'en':
        return f"""You are an expert sales trainer analyzing a sales roleplay session.
{no_history_warning}
## Session Metrics
- Anger Level: {anger_value}/10
- Trust Level: {trust_value}/10
- Progress Level: {progress_value}/10

## Conversation
{conversation_text}
{goal_section}

Analyze this sales conversation and provide detailed feedback.
**CRITICAL: Base your analysis ONLY on the actual conversation content provided above. Do not invent or assume any conversation that is not shown.**"""
    else:
        return f"""あなたは営業トレーニングの専門家として、営業ロールプレイセッションを分析します。
{no_history_warning}
## セッションメトリクス
- 怒りレベル: {anger_value}/10
- 信頼レベル: {trust_value}/10
- 進捗レベル: {progress_value}/10

## 会話内容
{conversation_text}
{goal_section}

この営業会話を分析し、詳細なフィードバックを提供してください。
**重要: 上記に示された実際の会話内容のみに基づいて分析してください。示されていない会話を想像したり仮定したりしないでください。**"""


def create_default_feedback(language: str) -> Dict[str, Any]:
    """デフォルトフィードバックを作成"""
    if language == 'en':
        return {
            "scores": {
                "overall": 50,
                "communication": 5, "needsAnalysis": 5, "proposalQuality": 5,
                "flexibility": 5, "trustBuilding": 5, "objectionHandling": 5,
                "closingSkill": 5, "listeningSkill": 5, "productKnowledge": 5,
                "customerFocus": 5, "goalAchievement": 5
            },
            "strengths": ["Analysis in progress"],
            "improvements": ["Analysis in progress"],
            "keyInsights": ["Analysis in progress"],
            "goalFeedback": {"achievedGoals": [], "partiallyAchievedGoals": [], "missedGoals": []},
            "overallComment": "Feedback generation encountered an issue.",
            "nextSteps": None
        }
    else:
        return {
            "scores": {
                "overall": 50,
                "communication": 5, "needsAnalysis": 5, "proposalQuality": 5,
                "flexibility": 5, "trustBuilding": 5, "objectionHandling": 5,
                "closingSkill": 5, "listeningSkill": 5, "productKnowledge": 5,
                "customerFocus": 5, "goalAchievement": 5
            },
            "strengths": ["分析中"],
            "improvements": ["分析中"],
            "keyInsights": ["分析中"],
            "goalFeedback": {"achievedGoals": [], "partiallyAchievedGoals": [], "missedGoals": []},
            "overallComment": "フィードバック生成中に問題が発生しました。",
            "nextSteps": None
        }
