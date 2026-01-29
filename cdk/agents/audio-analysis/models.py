"""
音声分析エージェント用Pydanticモデル定義

Strands Agentsのstructured output機能で使用する
出力スキーマを定義。
"""

from typing import List, Literal
from pydantic import BaseModel, Field


class Speaker(BaseModel):
    """話者情報モデル"""
    speaker_label: str = Field(
        description="話者ラベル（例: spk_0, spk_1）"
    )
    identified_role: Literal["salesperson", "customer", "observer"] = Field(
        description="特定された役割"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="役割特定の確信度（0.0〜1.0）"
    )
    sample_utterances: List[str] = Field(
        default_factory=list,
        description="役割判定の根拠となる発言サンプル"
    )


class SpeakerAnalysisResult(BaseModel):
    """話者分析結果モデル"""
    speakers: List[Speaker] = Field(
        default_factory=list,
        description="分析された話者のリスト"
    )
