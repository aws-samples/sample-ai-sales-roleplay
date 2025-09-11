"""
音声分析用のPydanticモデル定義

Amazon Transcribeの結果から話者の役割を特定し、
構造化された出力を提供するためのデータモデル。
"""

from typing import List, Dict, Any
from pydantic import BaseModel, Field

class SpeakerInfo(BaseModel):
    """話者情報"""
    speaker_label: str = Field(..., description="Amazon Transcribeが付与した話者ラベル（例：spk_0, spk_1）")
    identified_role: str = Field(..., description="特定された役割（salesperson, customer, observer）")
    confidence: float = Field(..., ge=0.0, le=1.0, description="役割特定の信頼度（0.0-1.0）")
    sample_utterances: List[str] = Field(default=[], description="この話者の代表的な発言例")

class ConversationSegment(BaseModel):
    """会話セグメント"""
    start_time: float = Field(..., description="開始時刻（秒）")
    end_time: float = Field(..., description="終了時刻（秒）")
    speaker_label: str = Field(..., description="話者ラベル")
    text: str = Field(..., description="発言内容")
    role: str = Field(..., description="特定された役割")

class AudioAnalysisOutput(BaseModel):
    """音声分析の構造化出力"""
    speakers: List[SpeakerInfo] = Field(..., description="検出された話者情報")
    segments: List[ConversationSegment] = Field(..., description="時系列の会話セグメント")
    summary: Dict[str, Any] = Field(default={}, description="分析サマリー")
    language_detected: str = Field(default="ja", description="検出された言語コード")
