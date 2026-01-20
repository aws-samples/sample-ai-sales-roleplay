"""
動画分析エージェント用Pydanticモデル定義

Bedrock Converse APIのレスポンスをバリデーションするための
出力スキーマを定義。
"""

from typing import List
from pydantic import BaseModel, Field, field_validator


class VideoAnalysisResult(BaseModel):
    """動画分析結果モデル"""
    overallScore: int = Field(ge=1, le=10, description="総合スコア（1-10）")
    eyeContact: int = Field(ge=1, le=10, description="アイコンタクト評価（1-10）")
    facialExpression: int = Field(ge=1, le=10, description="表情評価（1-10）")
    gesture: int = Field(ge=1, le=10, description="ジェスチャー評価（1-10）")
    emotion: int = Field(ge=1, le=10, description="感情表現評価（1-10）")
    strengths: List[str] = Field(default_factory=list, description="強み")
    improvements: List[str] = Field(default_factory=list, description="改善点")
    analysis: str = Field(description="総合評価コメント")
    
    @field_validator('overallScore', 'eyeContact', 'facialExpression', 'gesture', 'emotion', mode='before')
    @classmethod
    def normalize_score(cls, v):
        """スコアを1-10の範囲に正規化（100点満点の場合も対応）"""
        if isinstance(v, (int, float)):
            if v > 10:
                return max(1, min(10, round(v / 10)))
            return max(1, min(10, round(v)))
        return 5  # デフォルト値
