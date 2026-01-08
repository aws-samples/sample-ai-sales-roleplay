"""
Structured Output用Pydanticモデル定義

Strands AgentsのStructured Output機能で使用する
型安全なレスポンスモデルを定義します。
"""

from pydantic import BaseModel, Field
from typing import List, Optional


# ============================================================
# リアルタイムスコアリング用モデル
# ============================================================

class RealtimeScores(BaseModel):
    """リアルタイムスコアリング結果"""
    angerLevel: int = Field(description="怒りレベル (1-10)", ge=1, le=10)
    trustLevel: int = Field(description="信頼レベル (1-10)", ge=1, le=10)
    progressLevel: int = Field(description="進捗レベル (1-10)", ge=1, le=10)
    analysis: str = Field(description="簡潔な分析（50文字以内）", max_length=50)


# ============================================================
# ゴール評価用モデル
# ============================================================

class GoalEvaluation(BaseModel):
    """ゴール評価結果"""
    goalId: str = Field(description="ゴールID")
    progress: int = Field(description="進捗度 (0-100)", ge=0, le=100)
    achieved: bool = Field(description="達成済みかどうか")


class GoalEvaluationList(BaseModel):
    """ゴール評価結果リスト"""
    goals: List[GoalEvaluation] = Field(description="ゴール評価結果のリスト")


# ============================================================
# フィードバック分析用モデル
# ============================================================

class CommunicationPatterns(BaseModel):
    """コミュニケーションパターン分析"""
    questionFrequency: int = Field(description="質問頻度 (0-10)", ge=0, le=10)
    responseQuality: int = Field(description="応答品質 (0-10)", ge=0, le=10)
    clarityOfExplanation: int = Field(description="説明の明確さ (0-10)", ge=0, le=10)


class CustomerInteraction(BaseModel):
    """顧客対応分析"""
    empathyLevel: int = Field(description="共感レベル (0-10)", ge=0, le=10)
    respectShown: int = Field(description="尊重の表示 (0-10)", ge=0, le=10)
    engagementQuality: int = Field(description="エンゲージメント品質 (0-10)", ge=0, le=10)


class SalesTechniques(BaseModel):
    """営業テクニック分析"""
    valuePropositionClarity: int = Field(description="価値提案の明確さ (0-10)", ge=0, le=10)
    needsAlignment: int = Field(description="ニーズ適合度 (0-10)", ge=0, le=10)
    painPointIdentification: int = Field(description="課題特定能力 (0-10)", ge=0, le=10)


class DetailedAnalysis(BaseModel):
    """詳細分析"""
    communicationPatterns: CommunicationPatterns
    customerInteraction: CustomerInteraction
    salesTechniques: SalesTechniques


class Scores(BaseModel):
    """スコア評価"""
    overall: int = Field(description="総合スコア (0-100)", ge=0, le=100)
    communication: int = Field(description="コミュニケーション力 (0-10)", ge=0, le=10)
    needsAnalysis: int = Field(description="ニーズ分析力 (0-10)", ge=0, le=10)
    proposalQuality: int = Field(description="提案品質 (0-10)", ge=0, le=10)
    flexibility: int = Field(description="柔軟性 (0-10)", ge=0, le=10)
    trustBuilding: int = Field(description="信頼構築 (0-10)", ge=0, le=10)
    objectionHandling: int = Field(description="異議対応力 (0-10)", ge=0, le=10)
    closingSkill: int = Field(description="クロージングスキル (0-10)", ge=0, le=10)
    listeningSkill: int = Field(description="傾聴スキル (0-10)", ge=0, le=10)
    productKnowledge: int = Field(description="製品知識 (0-10)", ge=0, le=10)
    customerFocus: int = Field(description="顧客中心思考 (0-10)", ge=0, le=10)
    goalAchievement: int = Field(description="ゴール達成度 (0-10)", ge=0, le=10)


class GoalFeedback(BaseModel):
    """ゴールフィードバック"""
    achievedGoals: List[str] = Field(description="達成したゴールの説明リスト")
    partiallyAchievedGoals: List[str] = Field(description="部分的に達成したゴールの説明リスト")
    missedGoals: List[str] = Field(description="未達成ゴールの説明リスト")
    recommendations: List[str] = Field(description="ゴール達成のための改善提案リスト")


class FeedbackAnalysis(BaseModel):
    """フィードバック分析結果"""
    strengths: List[str] = Field(description="ユーザーの強みリスト")
    improvements: List[str] = Field(description="改善点リスト")
    keyInsights: List[str] = Field(description="重要な気づきリスト")
    nextSteps: str = Field(description="次回の会話に向けた具体的な提案")
    goalFeedback: GoalFeedback
    scores: Scores
    detailedAnalysis: DetailedAnalysis
