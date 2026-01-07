"""
フィードバック生成Lambda関数

Strands Agentsのstructured outputを使用してセッションの詳細フィードバックを生成します。
"""

import os
import time
import random
from strands import Agent
from strands.models import BedrockModel
from aws_lambda_powertools import Logger
from typing import Dict, Any, List
from decimal import Decimal
from botocore.config import Config as BotocoreConfig

from feedback_types import FeedbackOutput, FeedbackScores, GoalFeedback

# ロガー設定
logger = Logger(service="session-analysis-feedback")

# 環境変数
BEDROCK_MODEL_FEEDBACK = os.environ.get("BEDROCK_MODEL_FEEDBACK", "amazon.nova-pro-v1:0")
REGION = os.environ.get("AWS_REGION", "us-west-2")

# Bedrockモデル設定（リトライ設定付き）
boto_config = BotocoreConfig(
    retries={
        "max_attempts": 10,
        "mode": "adaptive",
        "total_max_attempts": 10
    },
    connect_timeout=10,
    read_timeout=600,
)

bedrock_model = BedrockModel(
    model_id=BEDROCK_MODEL_FEEDBACK,
    region_name=REGION,
    boto_client_config=boto_config,
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    フィードバック生成ハンドラー
    
    Args:
        event: Step Functions入力（start_handlerからの出力）
            
    Returns:
        生成されたフィードバックデータ
    """
    try:
        session_id = event.get("sessionId")
        messages = event.get("messages", [])
        final_metrics = event.get("finalMetrics", {})
        scenario_goals = event.get("scenarioGoals", [])
        language = event.get("language", "ja")
        
        logger.info("フィードバック生成開始", extra={
            "session_id": session_id,
            "messages_count": len(messages),
            "language": language
        })
        
        # フィードバック生成
        feedback_data = generate_feedback_with_strands(
            session_id=session_id,
            metrics=final_metrics,
            messages=messages,
            scenario_goals=scenario_goals,
            language=language
        )
        
        logger.info("フィードバック生成完了", extra={
            "session_id": session_id,
            "overall_score": feedback_data.get("scores", {}).get("overall")
        })
        
        # 元のイベントデータにフィードバックを追加して返す
        return {
            **event,
            "feedbackData": feedback_data,
            "feedbackGenerated": True
        }
        
    except Exception as e:
        logger.exception("フィードバック生成エラー", extra={"error": str(e)})
        # エラー時も処理を継続（デフォルトフィードバックで進む）
        return {
            **event,
            "feedbackData": create_default_feedback(event.get("language", "ja")),
            "feedbackGenerated": False,
            "feedbackError": str(e)
        }


def generate_feedback_with_strands(
    session_id: str,
    metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]],
    language: str
) -> Dict[str, Any]:
    """Strands Agentsを使用してフィードバックを生成"""
    
    # throttlingException対応のリトライ設定
    max_retries = 5
    base_delay = 2.0
    
    for retry_count in range(max_retries):
        try:
            # プロンプト作成
            prompt = build_feedback_prompt(metrics, messages, scenario_goals, language)
            
            logger.info("Strands Agentでフィードバック生成を実行", extra={
                "model_id": BEDROCK_MODEL_FEEDBACK,
                "language": language,
                "messages_count": len(messages),
                "retry_count": retry_count
            })
            
            # エージェント初期化
            agent = Agent(
                tools=[],
                model=bedrock_model,
            )
            
            # プロンプト実行
            agent(prompt)
            
            # 構造化出力を取得
            structured_prompt = get_structured_output_prompt(language)
            result: FeedbackOutput = agent.structured_output(
                FeedbackOutput,
                structured_prompt,
            )
            
            logger.info("Strands Agent分析完了", extra={
                "overall_score": result.scores.overall,
                "retry_count": retry_count
            })
            
            # Pydanticモデルを辞書に変換
            return result.model_dump()
            
        except Exception as e:
            error_str = str(e).lower()
            
            # throttlingExceptionかどうかを判定
            if 'throttling' in error_str or 'too many requests' in error_str:
                if retry_count < max_retries - 1:
                    delay = base_delay * (2 ** retry_count) + random.uniform(0, 1)
                    logger.warning("Bedrock throttling検出 - 待機後にリトライ", extra={
                        "retry_count": retry_count,
                        "max_retries": max_retries,
                        "delay_seconds": delay,
                        "error": str(e)
                    })
                    time.sleep(delay)
                    continue
                else:
                    logger.error("最大リトライ数に達しました", extra={
                        "max_retries": max_retries,
                        "error": str(e)
                    })
                    raise Exception(f"Bedrock API throttling - 最大リトライ数({max_retries})に達しました: {str(e)}")
            else:
                logger.error("Strands Agent実行エラー", extra={
                    "error": str(e),
                    "retry_count": retry_count
                })
                raise e
    
    raise Exception("予期しないエラー：リトライループを抜けました")


def build_feedback_prompt(
    metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]],
    language: str
) -> str:
    """フィードバック生成用プロンプトを構築"""
    
    # 言語に応じたラベル設定
    if language == "en":
        user_label = "User"
        npc_label = "NPC"
    else:
        user_label = "ユーザー"
        npc_label = "NPC"
    
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
        return f"""You are an expert sales trainer analyzing a sales roleplay session.

## Session Metrics
- Anger Level: {anger_value}/10
- Trust Level: {trust_value}/10
- Progress Level: {progress_value}/10

## Conversation
{conversation_text}
{goal_section}

Analyze this sales conversation thoroughly. Evaluate the salesperson's performance across all skill dimensions.
Consider communication effectiveness, needs analysis, proposal quality, flexibility, trust building, objection handling, closing skills, listening skills, product knowledge, and customer focus.
Identify specific strengths and areas for improvement based on the actual conversation content."""
    else:
        return f"""あなたは営業トレーニングの専門家として、営業ロールプレイセッションを分析します。

## セッションメトリクス
- 怒りレベル: {anger_value}/10
- 信頼レベル: {trust_value}/10
- 進捗レベル: {progress_value}/10

## 会話内容
{conversation_text}
{goal_section}

この営業会話を詳細に分析してください。営業担当者のパフォーマンスをすべてのスキル次元で評価してください。
コミュニケーション力、ニーズ把握力、提案品質、対応の柔軟性、信頼構築力、異議対応力、クロージングスキル、傾聴スキル、製品知識、顧客中心思考を考慮してください。
実際の会話内容に基づいて、具体的な強みと改善点を特定してください。"""


def get_structured_output_prompt(language: str) -> str:
    """構造化出力用のプロンプトを取得"""
    
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
    """デフォルトのフィードバックを作成"""
    if language == "en":
        return {
            "scores": {
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
            },
            "strengths": ["Analysis in progress"],
            "improvements": ["Analysis in progress"],
            "keyInsights": ["Analysis in progress"],
            "goalFeedback": {
                "achievedGoals": [],
                "partiallyAchievedGoals": [],
                "missedGoals": []
            },
            "overallComment": "Feedback generation encountered an issue.",
            "nextSteps": None
        }
    else:
        return {
            "scores": {
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
            },
            "strengths": ["分析中"],
            "improvements": ["分析中"],
            "keyInsights": ["分析中"],
            "goalFeedback": {
                "achievedGoals": [],
                "partiallyAchievedGoals": [],
                "missedGoals": []
            },
            "overallComment": "フィードバック生成中に問題が発生しました。",
            "nextSteps": None
        }


def convert_decimal(obj):
    """Decimal型をJSON対応形式に変換"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    return obj
