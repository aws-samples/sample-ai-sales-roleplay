"""
フィードバック分析エージェント用Pydanticモデル定義

Strands Agentsのstructured output機能で使用する
出力スキーマを定義。
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class FeedbackScores(BaseModel):
    """フィードバックスコアモデル"""
    overall: int = Field(ge=0, le=100, description="総合スコア（0-100）")
    communication: int = Field(ge=1, le=10, description="コミュニケーション力")
    needsAnalysis: int = Field(ge=1, le=10, description="ニーズ分析力")
    proposalQuality: int = Field(ge=1, le=10, description="提案品質")
    flexibility: int = Field(ge=1, le=10, description="柔軟性")
    trustBuilding: int = Field(ge=1, le=10, description="信頼構築力")
    objectionHandling: int = Field(ge=1, le=10, description="反論対応力")
    closingSkill: int = Field(ge=1, le=10, description="クロージング力")
    listeningSkill: int = Field(ge=1, le=10, description="傾聴力")
    productKnowledge: int = Field(ge=1, le=10, description="製品知識")
    customerFocus: int = Field(ge=1, le=10, description="顧客志向")
    goalAchievement: int = Field(ge=1, le=10, description="目標達成度")


class GoalFeedback(BaseModel):
    """ゴール達成フィードバックモデル"""
    achievedGoals: List[str] = Field(default_factory=list, description="達成したゴール")
    partiallyAchievedGoals: List[str] = Field(default_factory=list, description="部分的に達成したゴール")
    missedGoals: List[str] = Field(default_factory=list, description="未達成のゴール")


class FeedbackAnalysisResult(BaseModel):
    """フィードバック分析結果モデル"""
    scores: FeedbackScores = Field(description="各項目のスコア")
    strengths: List[str] = Field(default_factory=list, description="強み")
    improvements: List[str] = Field(default_factory=list, description="改善点")
    keyInsights: List[str] = Field(default_factory=list, description="重要な洞察")
    goalFeedback: GoalFeedback = Field(default_factory=GoalFeedback, description="ゴール達成状況")
    overallComment: str = Field(description="総評コメント")
    nextSteps: Optional[str] = Field(default=None, description="次のステップ・推奨事項")
