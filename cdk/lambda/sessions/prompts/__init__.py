"""
プロンプトモジュール - プロンプトテンプレートとStructured Outputモデルを管理
"""

# プロンプトテンプレートをエクスポート
from .analysis_prompt import (
    # フィードバック分析用
    FEEDBACK_SYSTEM_PROMPT_JA,
    FEEDBACK_SYSTEM_PROMPT_EN,
    ANALYSIS_PROMPT_JA,
    ANALYSIS_PROMPT_EN,
    # リアルタイムスコアリング用
    REALTIME_SCORING_SYSTEM_PROMPT_JA,
    REALTIME_SCORING_SYSTEM_PROMPT_EN,
    REALTIME_SCORING_PROMPT_JA,
    REALTIME_SCORING_PROMPT_EN,
    # ゴール評価用
    GOAL_EVALUATION_SYSTEM_PROMPT_JA,
    GOAL_EVALUATION_SYSTEM_PROMPT_EN,
    GOAL_EVALUATION_PROMPT_JA,
    GOAL_EVALUATION_PROMPT_EN,
    # 後方互換性
    ANALYSIS_PROMPT_TEMPLATE,
    REALTIME_SCORING_PROMPT_TEMPLATE,
    GOAL_EVALUATION_PROMPT_TEMPLATE
)

# Structured Output用Pydanticモデルをエクスポート
from .models import (
    # リアルタイムスコアリング
    RealtimeScores,
    # ゴール評価
    GoalEvaluation,
    GoalEvaluationList,
    # フィードバック分析
    CommunicationPatterns,
    CustomerInteraction,
    SalesTechniques,
    DetailedAnalysis,
    Scores,
    GoalFeedback,
    FeedbackAnalysis
)


def get_analysis_prompt(
    anger_value: int,
    trust_value: int,
    progress_value: int,
    conversation_text: str,
    goal_analysis_section: str = "",
    language: str = "ja"
) -> str:
    """
    会話分析用のプロンプトを生成する関数
    
    Args:
        anger_value: 怒りの値 (0-10)
        trust_value: 信頼の値 (0-10)
        progress_value: 進捗の値 (0-10)
        conversation_text: 会話履歴テキスト
        goal_analysis_section: 目標分析セクション (オプション)
        language: 言語コード ("ja" または "en")
        
    Returns:
        分析用のプロンプト
    """
    template = ANALYSIS_PROMPT_EN if language == "en" else ANALYSIS_PROMPT_JA
    
    return template.format(
        anger_value=anger_value,
        trust_value=trust_value, 
        progress_value=progress_value,
        conversation_text=conversation_text,
        goal_analysis_section=goal_analysis_section
    )


def get_realtime_scoring_prompt(
    user_input: str,
    conversation_history: str,
    language: str = "ja"
) -> str:
    """
    リアルタイムスコアリング用のプロンプトを生成する関数
    
    Args:
        user_input: ユーザーの最新の発言
        conversation_history: フォーマット済みの会話履歴
        language: 言語コード ("ja" または "en")
        
    Returns:
        リアルタイムスコアリング用のプロンプト
    """
    template = REALTIME_SCORING_PROMPT_EN if language == "en" else REALTIME_SCORING_PROMPT_JA
    
    return template.format(
        conversation_history=conversation_history,
        user_input=user_input
    )


def get_goal_evaluation_prompt(
    conversation_text: str,
    goals_json: str,
    language: str = "ja"
) -> str:
    """
    ゴール評価用のプロンプトを生成する関数
    
    Args:
        conversation_text: フォーマット済みの会話履歴
        goals_json: ゴール情報のJSON文字列
        language: 言語コード ("ja" または "en")
        
    Returns:
        ゴール評価用のプロンプト
    """
    template = GOAL_EVALUATION_PROMPT_EN if language == "en" else GOAL_EVALUATION_PROMPT_JA
    
    return template.format(
        conversation_text=conversation_text,
        goals_json=goals_json
    )


def get_system_prompt(prompt_type: str, language: str = "ja") -> str:
    """
    システムプロンプトを取得する関数
    
    Args:
        prompt_type: プロンプトタイプ ("feedback", "realtime_scoring", "goal_evaluation")
        language: 言語コード ("ja" または "en")
        
    Returns:
        システムプロンプト
    """
    prompts = {
        "feedback": {
            "ja": FEEDBACK_SYSTEM_PROMPT_JA,
            "en": FEEDBACK_SYSTEM_PROMPT_EN
        },
        "realtime_scoring": {
            "ja": REALTIME_SCORING_SYSTEM_PROMPT_JA,
            "en": REALTIME_SCORING_SYSTEM_PROMPT_EN
        },
        "goal_evaluation": {
            "ja": GOAL_EVALUATION_SYSTEM_PROMPT_JA,
            "en": GOAL_EVALUATION_SYSTEM_PROMPT_EN
        }
    }
    
    return prompts.get(prompt_type, {}).get(language, prompts.get(prompt_type, {}).get("ja", ""))
