"""
音声分析フィードバック生成用プロンプト定義

save_handler.pyで使用するプロンプト構築関数を定義。
Strands Agentsのstructured outputと組み合わせて使用。
"""

from typing import Dict, Any, List


def build_feedback_prompt(
    metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]],
    language: str
) -> str:
    """
    フィードバック生成用プロンプトを構築
    
    Args:
        metrics: セッションメトリクス（angerLevel, trustLevel, progressLevel）
        messages: 会話メッセージリスト
        scenario_goals: シナリオゴールリスト
        language: 言語（'ja' または 'en'）
        
    Returns:
        フィードバック生成用プロンプト文字列
    """
    # 言語に応じたラベル設定
    if language == "en":
        user_label = "Salesperson"
        npc_label = "Customer"
    else:
        user_label = "営業担当者"
        npc_label = "顧客"
    
    # 会話テキストを構築
    conversation_text = "\n\n".join([
        f"{user_label if msg.get('sender') == 'user' else npc_label}: {msg.get('content', '')}"
        for msg in messages
        if msg.get("sender") in ["user", "npc"]
    ])
    
    # メトリクス値を取得
    anger_value = metrics.get("angerLevel", 1)
    trust_value = metrics.get("trustLevel", 5)
    progress_value = metrics.get("progressLevel", 5)
    
    # ゴール分析セクション
    goal_section = ""
    if scenario_goals:
        goals_text = "\n".join([f"- {g.get('description', '')}" for g in scenario_goals])
        if language == "en":
            goal_section = f"\n## Scenario Goals\n{goals_text}\n"
        else:
            goal_section = f"\n## シナリオのゴール\n{goals_text}\n"
    
    if language == "en":
        return f"""You are an expert sales trainer analyzing a sales conversation from audio transcription.

## Session Metrics
- Anger Level: {anger_value}/10
- Trust Level: {trust_value}/10
- Progress Level: {progress_value}/10

## Conversation (Audio Transcription)
{conversation_text}
{goal_section}

Analyze this sales conversation based on the transcribed audio."""
    else:
        return f"""あなたは営業トレーニングの専門家として、音声転写から営業会話を分析します。

## セッションメトリクス
- 怒りレベル: {anger_value}/10
- 信頼レベル: {trust_value}/10
- 進捗レベル: {progress_value}/10

## 会話内容（音声転写）
{conversation_text}
{goal_section}

音声転写に基づいて、この営業会話を分析してください。"""


def get_structured_output_prompt(language: str) -> str:
    """
    構造化出力用のプロンプトを取得
    
    Strands Agentsのstructured_output()メソッドで使用するプロンプト。
    FeedbackOutputモデルに従った出力を生成するよう指示。
    
    Args:
        language: 言語（'ja' または 'en'）
        
    Returns:
        構造化出力用プロンプト文字列
    """
    if language == "en":
        return """Generate a FeedbackOutput object with the following:

1. scores: FeedbackScores with:
   - overall: 0-100 total score
   - communication, needsAnalysis, proposalQuality, flexibility, trustBuilding: 1-10 each
   - objectionHandling, closingSkill, listeningSkill, productKnowledge, customerFocus: 1-10 each
   - goalAchievement: 1-10

2. strengths: List of 2-4 specific strengths observed in the conversation

3. improvements: List of 2-4 specific areas for improvement

4. keyInsights: List of 1-2 key insights about the conversation

5. goalFeedback: GoalFeedback with achievedGoals, partiallyAchievedGoals, missedGoals lists

6. overallComment: A comprehensive summary of the performance

7. nextSteps: Recommended next steps for improvement"""
    else:
        return """以下の内容でFeedbackOutputオブジェクトを生成してください：

1. scores: FeedbackScoresに以下を設定:
   - overall: 0-100の総合スコア
   - communication, needsAnalysis, proposalQuality, flexibility, trustBuilding: 各1-10
   - objectionHandling, closingSkill, listeningSkill, productKnowledge, customerFocus: 各1-10
   - goalAchievement: 1-10

2. strengths: 会話で観察された2-4個の具体的な強み

3. improvements: 2-4個の具体的な改善点

4. keyInsights: 会話に関する1-2個の重要な洞察

5. goalFeedback: achievedGoals, partiallyAchievedGoals, missedGoalsリストを含むGoalFeedback

6. overallComment: パフォーマンスの包括的なサマリー

7. nextSteps: 改善のための推奨される次のステップ"""


def create_default_feedback(language: str) -> Dict[str, Any]:
    """
    デフォルトのフィードバックを作成
    
    フィードバック生成でエラーが発生した場合に返すデフォルト値。
    
    Args:
        language: 言語（'ja' または 'en'）
        
    Returns:
        デフォルトフィードバック辞書
    """
    # 共通のスコア構造
    default_scores = {
        "overall": 50,
        "communication": 5,
        "needsAnalysis": 5,
        "proposalQuality": 5,
        "flexibility": 5,
        "trustBuilding": 5,
        "objectionHandling": 5,
        "closingSkill": 5,
        "listeningSkill": 5,
        "productKnowledge": 5,
        "customerFocus": 5,
        "goalAchievement": 5
    }
    
    # 共通のゴールフィードバック構造
    default_goal_feedback = {
        "achievedGoals": [],
        "partiallyAchievedGoals": [],
        "missedGoals": []
    }
    
    if language == "en":
        return {
            "scores": default_scores,
            "strengths": ["Analysis in progress"],
            "improvements": ["Analysis in progress"],
            "keyInsights": ["Analysis in progress"],
            "goalFeedback": default_goal_feedback,
            "overallComment": "Feedback generation encountered an issue.",
            "nextSteps": None
        }
    else:
        return {
            "scores": default_scores,
            "strengths": ["分析中"],
            "improvements": ["分析中"],
            "keyInsights": ["分析中"],
            "goalFeedback": default_goal_feedback,
            "overallComment": "フィードバック生成中に問題が発生しました。",
            "nextSteps": None
        }
