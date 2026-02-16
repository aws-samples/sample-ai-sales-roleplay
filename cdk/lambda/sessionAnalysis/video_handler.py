"""
動画分析Lambda関数

Amazon Nova Premiereを使用してセッション録画を分析します。
Cross-region inference profileを使用して、S3バケットと同じリージョンで動画分析を実行します。
"""

import os
import json
import boto3
from botocore.config import Config
from aws_lambda_powertools import Logger
from typing import Dict, Any, Optional

# ロガー設定
logger = Logger(service="session-analysis-video")

# 環境変数
VIDEO_BUCKET = os.environ.get("VIDEO_BUCKET")
# Global Cross-region inference profile IDを使用
# これにより、Lambdaと同じリージョンでBedrockを呼び出しつつ、
# 実際の推論は利用可能なリージョンで実行される
VIDEO_ANALYSIS_MODEL_ID = os.environ.get("VIDEO_ANALYSIS_MODEL_ID", "global.amazon.nova-2-lite-v1:0")

# Bedrockクライアント（Lambdaと同じリージョンで作成）
# Cross-region inference profileを使用するため、S3と同じリージョンで呼び出す
bedrock_runtime = boto3.client(
    "bedrock-runtime",
    config=Config(retries={"max_attempts": 3})
)

# S3クライアント
s3 = boto3.client("s3")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    動画分析ハンドラー
    
    Args:
        event: Step Functions入力
            
    Returns:
        動画分析結果を追加したイベントデータ
    """
    try:
        session_id = event.get("sessionId")
        has_video = event.get("hasVideo", False)
        video_key = event.get("videoKey")
        language = event.get("language", "ja")
        
        logger.info("動画分析開始", extra={
            "session_id": session_id,
            "has_video": has_video,
            "video_key": video_key
        })
        
        # 動画がない場合はスキップ
        if not has_video or not video_key:
            logger.info("動画なし、スキップ")
            return {
                **event,
                "videoAnalysis": None,
                "videoAnalyzed": False,
                "videoSkipReason": "no_video"
            }
        
        # 動画分析を実行
        video_analysis = analyze_video(session_id, video_key, language)
        
        if video_analysis:
            logger.info("動画分析完了", extra={
                "session_id": session_id,
                "overall_score": video_analysis.get("overallScore")
            })
            return {
                **event,
                "videoAnalysis": video_analysis,
                "videoAnalyzed": True,
                "videoUrl": f"s3://{VIDEO_BUCKET}/{video_key}"
            }
        else:
            return {
                **event,
                "videoAnalysis": None,
                "videoAnalyzed": False,
                "videoSkipReason": "analysis_failed"
            }
        
    except Exception as e:
        logger.exception("動画分析エラー", extra={"error": str(e)})
        # エラー時も処理を継続
        return {
            **event,
            "videoAnalysis": None,
            "videoAnalyzed": False,
            "videoError": str(e)
        }


def analyze_video(session_id: str, video_key: str, language: str) -> Optional[Dict[str, Any]]:
    """動画を分析"""
    try:
        # S3 URIを構築
        video_uri = f"s3://{VIDEO_BUCKET}/{video_key}"
        
        logger.info(f"動画分析実行: {video_uri}")
        
        # プロンプト構築
        prompt = get_video_analysis_prompt(language)
        
        # Bedrock呼び出し（Nova Premiere）
        response = bedrock_runtime.converse(
            modelId=VIDEO_ANALYSIS_MODEL_ID,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "video": {
                            "format": "mp4",
                            "source": {
                                "s3Location": {
                                    "uri": video_uri
                                }
                            }
                        }
                    },
                    {
                        "text": prompt
                    }
                ]
            }],
            inferenceConfig={
                "maxTokens": 4096,
                "temperature": 0.3
            }
        )
        
        # レスポンス解析
        response_text = response["output"]["message"]["content"][0]["text"]
        
        # JSON部分を抽出
        try:
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                analysis_result = json.loads(json_str)
                # 結果を正規化（旧形式からの変換も含む）
                analysis_result = normalize_video_analysis(analysis_result)
            else:
                raise ValueError("JSONが見つかりません")
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析エラー: {str(e)}")
            analysis_result = create_default_video_analysis(language)
        
        return analysis_result
        
    except Exception as e:
        logger.error(f"動画分析実行エラー: {str(e)}")
        return None


def get_video_analysis_prompt(language: str) -> str:
    """動画分析用プロンプトを取得"""
    
    if language == "en":
        return """Analyze this sales roleplay video recording and evaluate the salesperson's performance.

Focus on:
1. Eye contact and gaze direction
2. Facial expressions and emotions
3. Body language and gestures
4. Overall presentation and confidence

Provide your analysis in the following JSON format (scores are 1-10):

```json
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
```

Respond ONLY with the JSON object."""
    else:
        return """この営業ロールプレイの録画動画を分析し、営業担当者のパフォーマンスを評価してください。

以下の点に注目してください：
1. アイコンタクトと視線の方向
2. 表情と感情表現
3. ボディランゲージとジェスチャー
4. 全体的なプレゼンテーションと自信

以下のJSON形式で分析結果を提供してください（スコアは1-10点）：

```json
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
```

JSONオブジェクトのみを返してください。"""


def create_default_video_analysis(language: str) -> Dict[str, Any]:
    """デフォルトの動画分析結果を作成"""
    if language == "en":
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


def normalize_video_analysis(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    動画分析結果を正規化する
    
    旧形式（categories構造、0-100スコア）から新形式（フラット構造、1-10スコア）に変換
    """
    # 既に新形式の場合はそのまま返す
    if "eyeContact" in result and not isinstance(result.get("eyeContact"), dict):
        # スコアが0-100の場合は1-10に変換
        if result.get("overallScore", 0) > 10:
            result["overallScore"] = max(1, min(10, round(result["overallScore"] / 10)))
            result["eyeContact"] = max(1, min(10, round(result.get("eyeContact", 5) / 10)))
            result["facialExpression"] = max(1, min(10, round(result.get("facialExpression", 5) / 10)))
            result["gesture"] = max(1, min(10, round(result.get("gesture", 5) / 10)))
            result["emotion"] = max(1, min(10, round(result.get("emotion", 5) / 10)))
        
        # analysisフィールドがない場合はoverallCommentから取得
        if "analysis" not in result and "overallComment" in result:
            result["analysis"] = result.pop("overallComment")
        
        return result
    
    # 旧形式（categories構造）からの変換
    categories = result.get("categories", {})
    
    # スコアを0-100から1-10に変換
    def convert_score(score: int) -> int:
        return max(1, min(10, round(score / 10)))
    
    overall_score = result.get("overallScore", 50)
    if overall_score > 10:
        overall_score = convert_score(overall_score)
    
    eye_contact = categories.get("eyeContact", {}).get("score", 50)
    if eye_contact > 10:
        eye_contact = convert_score(eye_contact)
    
    facial_expression = categories.get("facialExpression", {}).get("score", 50)
    if facial_expression > 10:
        facial_expression = convert_score(facial_expression)
    
    # bodyLanguageをgestureにマッピング
    gesture = categories.get("bodyLanguage", {}).get("score", 50)
    if gesture > 10:
        gesture = convert_score(gesture)
    
    # emotionalPresenceをemotionにマッピング
    emotion = categories.get("emotionalPresence", {}).get("score", 50)
    if emotion > 10:
        emotion = convert_score(emotion)
    
    # analysisフィールドを構築
    analysis = result.get("overallComment", "")
    if not analysis:
        # カテゴリのフィードバックを結合
        feedbacks = []
        for cat_name, cat_data in categories.items():
            if isinstance(cat_data, dict) and "feedback" in cat_data:
                feedbacks.append(cat_data["feedback"])
        analysis = " ".join(feedbacks) if feedbacks else ""
    
    return {
        "overallScore": overall_score,
        "eyeContact": eye_contact,
        "facialExpression": facial_expression,
        "gesture": gesture,
        "emotion": emotion,
        "strengths": result.get("strengths", []),
        "improvements": result.get("improvements", []),
        "analysis": analysis
    }
