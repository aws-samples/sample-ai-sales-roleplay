"""
音声分析用プロンプトモジュール

このモジュールは以下の2つのソースから関数をエクスポートします：
1. prompts/speaker_analysis_prompts.py - 話者分析用プロンプト
2. prompts/feedback_prompts.py - フィードバック生成用プロンプト
"""

# 話者分析用プロンプト
from prompts.speaker_analysis_prompts import get_speaker_analysis_prompt

# フィードバック生成用プロンプト
from prompts.feedback_prompts import (
    build_feedback_prompt,
    get_structured_output_prompt,
    create_default_feedback
)

__all__ = [
    "get_speaker_analysis_prompt",
    "build_feedback_prompt",
    "get_structured_output_prompt",
    "create_default_feedback"
]
