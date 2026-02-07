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
        return f"""You are a sales conversation scoring engine. Evaluate the latest message and update scores.

Current Scores: Anger={anger}/10, Trust={trust}/10, Progress={progress}/10

Conversation:
{history}

Latest Message: {user_message}

Goals:
{goals_txt}

Rules for "analysis" field:
- Write 1-2 SHORT sentences only (max 80 characters)
- Format: "[Score change reason]. [One actionable tip]."
- Example: "Good rapport building, trust +1. Try mentioning specific product benefits next."
- Do NOT write long explanations, bullet points, or section headers
- Do NOT repeat the scores or goal list in the analysis

NPC Emotion Estimation:
- Estimate the NPC's current emotional state based on the conversation context
- npcEmotion: one of "happy", "angry", "sad", "relaxed", "neutral"
- npcEmotionIntensity: 0.0 (very weak) to 1.0 (very strong)
- Consider: NPC personality, conversation flow, user's attitude, and score changes"""
    else:
        return f"""あなたは営業会話のスコアリングエンジンです。最新メッセージを評価しスコアを更新してください。

現在のスコア: 怒り={anger}/10, 信頼={trust}/10, 進捗={progress}/10

会話履歴:
{history}

最新メッセージ: {user_message}

ゴール:
{goals_txt}

「analysis」フィールドのルール:
- 1〜2文の短文のみ（最大80文字）
- 形式: 「[スコア変動理由]。[次の一手のアドバイス]。」
- 例: 「丁寧な挨拶で好印象。次は訪問目的を簡潔に伝えましょう。」
- 長文の説明、箇条書き、見出しは禁止
- スコアやゴール一覧をanalysisに繰り返さないこと

NPC感情推定:
- 会話の文脈からNPCの現在の感情状態を推定してください
- npcEmotion: "happy", "angry", "sad", "relaxed", "neutral" のいずれか
- npcEmotionIntensity: 0.0（非常に弱い）〜 1.0（非常に強い）
- 考慮要素: NPCの性格、会話の流れ、ユーザーの態度、スコアの変化"""


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
