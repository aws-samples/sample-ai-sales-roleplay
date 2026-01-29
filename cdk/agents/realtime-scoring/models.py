"""
リアルタイムスコアリングエージェント用Pydanticモデル定義

Strands Agentsのstructured output機能で使用する
出力スキーマを定義。
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class GoalUpdate(BaseModel):
    """ゴール更新情報モデル"""
    goalId: str = Field(description="ゴールID")
    achieved: bool = Field(description="達成状態")
    reason: Optional[str] = Field(default=None, description="達成/未達成の理由")


class ScoringResult(BaseModel):
    """スコアリング結果モデル"""
    angerLevel: int = Field(ge=1, le=10, description="怒りレベル（1-10）")
    trustLevel: int = Field(ge=1, le=10, description="信頼レベル（1-10）")
    progressLevel: int = Field(ge=1, le=10, description="進捗レベル（1-10）")
    analysis: str = Field(description="分析コメント")
    goalUpdates: List[GoalUpdate] = Field(default_factory=list, description="ゴール更新リスト")
