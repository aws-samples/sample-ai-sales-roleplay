"""
動画分析エージェント用プロンプト定義
"""

from typing import Dict, Any


def get_video_analysis_prompt(language: str) -> str:
    """動画分析用プロンプトを取得"""
    if language == 'en':
        return """Analyze this sales roleplay video recording and evaluate the salesperson's performance.

Focus on:
1. Eye contact and gaze direction
2. Facial expressions and emotions
3. Body language and gestures
4. Overall presentation and confidence

Provide your analysis in the following JSON format only (scores are 1-10):

{
  "overallScore": <1-10>,
  "eyeContact": <1-10>,
  "facialExpression": <1-10>,
  "gesture": <1-10>,
  "emotion": <1-10>,
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"],
  "analysis": "Overall assessment of non-verbal communication"
}

Respond ONLY with the JSON object."""
    else:
        return """この営業ロールプレイの録画動画を分析し、営業担当者のパフォーマンスを評価してください。

以下の点に注目してください：
1. アイコンタクトと視線の方向
2. 表情と感情表現
3. ボディランゲージとジェスチャー
4. 全体的なプレゼンテーションと自信

以下のJSON形式のみで分析結果を提供してください（スコアは1-10点）：

{
  "overallScore": <1-10の総合スコア>,
  "eyeContact": <1-10>,
  "facialExpression": <1-10>,
  "gesture": <1-10>,
  "emotion": <1-10>,
  "strengths": ["強み1", "強み2"],
  "improvements": ["改善点1", "改善点2"],
  "analysis": "非言語コミュニケーションの総合評価"
}

JSONオブジェクトのみを返してください。"""


def create_default_video_analysis(language: str) -> Dict[str, Any]:
    """デフォルトの動画分析結果を作成"""
    if language == 'en':
        return {
            "overallScore": 5,
            "eyeContact": 5,
            "facialExpression": 5,
            "gesture": 5,
            "emotion": 5,
            "strengths": ["Analysis in progress"],
            "improvements": ["Analysis in progress"],
            "analysis": "Video analysis encountered an issue."
        }
    else:
        return {
            "overallScore": 5,
            "eyeContact": 5,
            "facialExpression": 5,
            "gesture": 5,
            "emotion": 5,
            "strengths": ["分析中"],
            "improvements": ["分析中"],
            "analysis": "動画分析中に問題が発生しました。"
        }
