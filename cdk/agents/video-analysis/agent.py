"""
動画分析エージェント - AgentCore Runtime版（Strands Agents）

Amazon Nova Premiereを使用してセッション録画を分析する。
視線、表情、ジェスチャー、感情表現を評価する。

注: 動画分析はBedrock Converse APIを直接使用（マルチモーダル対応のため）。
Pydanticモデルでレスポンスをバリデーション。
"""

import json
import os
import logging
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Request

import boto3
from botocore.config import Config
from pydantic import ValidationError

from prompts import get_video_analysis_prompt, create_default_video_analysis
from models import VideoAnalysisResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

VIDEO_BUCKET = os.environ.get('VIDEO_BUCKET')
VIDEO_ANALYSIS_MODEL_ID = os.environ.get('VIDEO_ANALYSIS_MODEL_ID', 'us.amazon.nova-premier-v1:0')
AWS_REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))

app = FastAPI(title="Video Analysis Agent", version="1.0.0")


def parse_json_response(response_text: str) -> Dict[str, Any]:
    """JSONレスポンスをパース"""
    json_start = response_text.find("{")
    json_end = response_text.rfind("}") + 1
    if json_start >= 0 and json_end > json_start:
        json_str = response_text[json_start:json_end]
        return json.loads(json_str)
    raise ValueError("JSONが見つかりません")


def analyze_video(video_key: str, language: str) -> Optional[Dict[str, Any]]:
    """動画を分析（Bedrock Converse APIを使用）"""
    try:
        video_uri = f"s3://{VIDEO_BUCKET}/{video_key}"
        logger.info(f"動画分析実行: {video_uri}")
        
        prompt = get_video_analysis_prompt(language)
        
        # 動画分析はconverse APIを直接使用（マルチモーダル対応のため）
        bedrock_runtime = boto3.client(
            'bedrock-runtime',
            region_name=AWS_REGION,
            config=Config(retries={'max_attempts': 3})
        )
        
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
        
        response_text = response["output"]["message"]["content"][0]["text"]
        
        try:
            # JSONをパース
            raw_result = parse_json_response(response_text)
            
            # Pydanticモデルでバリデーション（スコア正規化も自動実行）
            validated_result = VideoAnalysisResult(**raw_result)
            return validated_result.model_dump()
            
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"JSON解析エラー: {e}")
            return create_default_video_analysis(language)
        except ValidationError as e:
            logger.error(f"バリデーションエラー: {e}")
            return create_default_video_analysis(language)
        
    except Exception as e:
        logger.error(f"動画分析実行エラー: {e}")
        return None


def handle_invocation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """エージェント呼び出しを処理"""
    try:
        logger.info(f"動画分析エージェント呼び出し")
        
        session_id = payload.get('sessionId', '')
        has_video = payload.get('hasVideo', False)
        video_key = payload.get('videoKey')
        language = payload.get('language', 'ja')
        
        if not has_video or not video_key:
            logger.info("動画なし、スキップ")
            return {
                'success': True,
                'sessionId': session_id,
                'videoAnalysis': None,
                'videoAnalyzed': False,
                'videoSkipReason': 'no_video'
            }
        
        video_analysis = analyze_video(video_key, language)
        
        if video_analysis:
            logger.info(f"動画分析完了: overall_score={video_analysis.get('overallScore')}")
            return {
                'success': True,
                'sessionId': session_id,
                'videoAnalysis': video_analysis,
                'videoAnalyzed': True,
                'videoUrl': f"s3://{VIDEO_BUCKET}/{video_key}"
            }
        else:
            return {
                'success': False,
                'sessionId': session_id,
                'videoAnalysis': None,
                'videoAnalyzed': False,
                'videoSkipReason': 'analysis_failed'
            }
        
    except Exception as e:
        logger.error(f"動画分析エージェントエラー: {e}")
        return {
            'success': False,
            'sessionId': payload.get('sessionId') if payload else '',
            'videoAnalysis': None,
            'videoAnalyzed': False,
            'error': '動画分析処理中にエラーが発生しました'
        }


@app.post("/invocations")
async def invoke_agent(request: Request):
    """AgentCore Runtime呼び出しエンドポイント"""
    try:
        raw_body = await request.body()
        logger.info(f"Raw request body: {raw_body}")
        
        try:
            body = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
            body = {}
        
        if isinstance(body, dict):
            if 'input' in body:
                payload = body['input']
            elif 'body' in body:
                payload = body['body']
            else:
                payload = body
        else:
            payload = {}
        
        result = handle_invocation(payload)
        return {"output": result}
    except Exception as e:
        logger.error(f"Invocation error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/ping")
async def ping():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
