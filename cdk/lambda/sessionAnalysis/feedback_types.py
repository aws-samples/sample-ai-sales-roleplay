"""
セッション分析用のPydanticモデル定義

Strands Agentsのstructured outputを使用して
型安全なフィードバック生成を行うためのデータモデル。
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class FeedbackScores(BaseModel):
    """フィードバックスコア"""
    overall: int = Field(..., ge=0, le=100, description="総合スコア（0-100）")
    communication: int = Field(..., ge=1, le=10, description="コミュニケーション力（1-10）")
    needsAnalysis: int = Field(..., ge=1, le=10, description="ニーズ把握力（1-10）")
    proposalQuality: int = Field(..., ge=1, le=10, description="提案品質（1-10）")
    flexibility: int = Field(..., ge=1, le=10, description="対応の柔軟性（1-10）")
    trustBuilding: int = Field(..., ge=1, le=10, description="信頼構築力（1-10）")
    objectionHandling: int = Field(..., ge=1, le=10, description="異議対応力（1-10）")
    closingSkill: int = Field(..., ge=1, le=10, description="クロージングスキル（1-10）")
    listeningSkill: int = Field(..., ge=1, le=10, description="傾聴スキル（1-10）")
    productKnowledge: int = Field(..., ge=1, le=10, description="製品知識（1-10）")
    customerFocus: int = Field(..., ge=1, le=10, description="顧客中心思考（1-10）")
    goalAchievement: int = Field(..., ge=1, le=10, description="ゴール達成度（1-10）")


class GoalFeedback(BaseModel):
    """ゴール達成フィードバック"""
    achievedGoals: List[str] = Field(default=[], description="達成したゴールの説明リスト")
    partiallyAchievedGoals: List[str] = Field(default=[], description="部分的に達成したゴールの説明リスト")
    missedGoals: List[str] = Field(default=[], description="未達成のゴールの説明リスト")


class FeedbackOutput(BaseModel):
    """フィードバック生成の構造化出力"""
    scores: FeedbackScores = Field(..., description="各スキルのスコア")
    strengths: List[str] = Field(..., min_length=1, max_length=5, description="強み（1-5項目）")
    improvements: List[str] = Field(..., min_length=1, max_length=5, description="改善点（1-5項目）")
    keyInsights: List[str] = Field(default=[], max_length=3, description="重要な洞察（0-3項目）")
    goalFeedback: GoalFeedback = Field(default_factory=GoalFeedback, description="ゴール達成に関するフィードバック")
    overallComment: str = Field(..., description="総合評価コメント")
    nextSteps: Optional[str] = Field(default=None, description="次のステップの提案")
