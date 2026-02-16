"""
音声分析エージェント - AgentCore Runtime版（Strands Agents）

Amazon Transcribeの結果を分析して話者の役割を特定し、
Strands Agentsのstructured output機能で構造化された出力を提供する。
"""

import json
import os
import logging
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException, Request

import boto3
from strands import Agent
from strands.models import BedrockModel

from prompts import get_speaker_analysis_prompt, format_speaker_utterances
from models import SpeakerAnalysisResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BEDROCK_MODEL = os.environ.get('BEDROCK_MODEL_ANALYSIS', 'global.anthropic.claude-haiku-4-5-20251001-v1:0')
AUDIO_STORAGE_BUCKET = os.environ.get('AUDIO_STORAGE_BUCKET')
AWS_REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))

app = FastAPI(title="Audio Analysis Agent", version="1.0.0")

s3_client = boto3.client('s3', region_name=AWS_REGION)
_strands_agent = None


def get_strands_agent() -> Agent:
    """Strands Agentを取得（遅延初期化）"""
    global _strands_agent
    if _strands_agent is None:
        model = BedrockModel(
            model_id=BEDROCK_MODEL,
            region_name=AWS_REGION,
            temperature=0.3,
            max_tokens=2048,
        )
        # シンプルな1回の呼び出し（ツールなしでstructured outputのみ使用）
        _strands_agent = Agent(model=model)
    return _strands_agent


def analyze_speakers_and_roles(
    transcription_result: Dict[str, Any],
    language: str = "ja"
) -> Dict[str, Any]:
    """Amazon Transcribeの結果から話者の役割を特定"""
    try:
        logger.info(f"話者役割分析を開始: language={language}")
        
        results = transcription_result.get("results", {})
        speaker_labels = results.get("speaker_labels", {})
        segments = speaker_labels.get("segments", [])
        items = results.get("items", [])
        
        speaker_utterances = {}
        conversation_segments = []
        
        for segment in segments:
            speaker_label = segment.get("speaker_label", "unknown")
            start_time = float(segment.get("start_time", 0))
            end_time = float(segment.get("end_time", 0))
            
            segment_words = []
            for item in items:
                if item.get("type") == "pronunciation":
                    item_start = float(item.get("start_time", 0))
                    if start_time <= item_start <= end_time:
                        word_alternatives = item.get("alternatives", [])
                        if word_alternatives:
                            segment_words.append(word_alternatives[0].get("content", ""))
            
            segment_text = " ".join(segment_words)
            
            if segment_text.strip():
                if speaker_label not in speaker_utterances:
                    speaker_utterances[speaker_label] = []
                speaker_utterances[speaker_label].append(segment_text)
                
                conversation_segments.append({
                    "start_time": start_time,
                    "end_time": end_time,
                    "speaker_label": speaker_label,
                    "text": segment_text,
                    "role": "unknown"
                })
        
        # Strands Agentで話者役割を特定（structured_output_model使用）
        utterances_text = format_speaker_utterances(speaker_utterances)
        prompt = get_speaker_analysis_prompt(utterances_text, language)
        agent = get_strands_agent()
        response = agent(prompt, structured_output_model=SpeakerAnalysisResult)
        
        # structured_outputから結果を取得
        analysis_result: SpeakerAnalysisResult = response.structured_output
        speakers = [speaker.model_dump() for speaker in analysis_result.speakers]
        
        # 役割情報を会話セグメントに反映
        role_mapping = {s.get('speaker_label'): s.get('identified_role', 'observer') for s in speakers}
        
        for seg in conversation_segments:
            seg['role'] = role_mapping.get(seg['speaker_label'], 'observer')
        
        summary = {
            "total_speakers": len(speaker_utterances),
            "total_segments": len(conversation_segments),
            "speaker_distribution": {label: len(utterances) for label, utterances in speaker_utterances.items()},
            "dominant_speaker": max(speaker_utterances.keys(), key=lambda k: len(speaker_utterances[k])) if speaker_utterances else None
        }
        
        result = {
            "speakers": speakers,
            "segments": conversation_segments,
            "summary": summary,
            "language_detected": language
        }
        
        logger.info(f"話者役割分析完了: speakers={len(speakers)}, segments={len(conversation_segments)}")
        return result
        
    except Exception as e:
        logger.error(f"話者役割分析エラー: {e}")
        raise


def handle_invocation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """エージェント呼び出しを処理"""
    try:
        logger.info(f"音声分析エージェント呼び出し")
        
        session_id = payload.get('sessionId', '')
        transcript_file_uri = payload.get('transcriptFileUri')
        language = payload.get('language', 'ja')
        
        if not transcript_file_uri:
            return {
                'success': False,
                'sessionId': session_id,
                'error': 'transcriptFileUriが必要です'
            }
        
        # S3から転写結果を取得
        try:
            if transcript_file_uri.startswith('https://s3.'):
                url_parts = transcript_file_uri.split('/')
                bucket_name = url_parts[3]
                transcript_key = '/'.join(url_parts[4:])
            else:
                bucket_name = AUDIO_STORAGE_BUCKET
                transcript_key = f"transcripts/{session_id}.json"
            
            logger.info(f"S3から転写結果取得: bucket={bucket_name}, key={transcript_key}")
            
            transcript_obj = s3_client.get_object(Bucket=bucket_name, Key=transcript_key)
            transcription_data = json.loads(transcript_obj['Body'].read().decode('utf-8'))
            
        except Exception as e:
            logger.error(f"転写結果取得エラー: {e}")
            return {
                'success': False,
                'sessionId': session_id,
                'error': '転写結果の取得に失敗しました'
            }
        
        analysis_result = analyze_speakers_and_roles(transcription_data, language)
        
        logger.info(f"音声分析完了: speakers={len(analysis_result.get('speakers', []))}")
        
        return {
            'success': True,
            'sessionId': session_id,
            'audioAnalysisResult': analysis_result,
            'analysisCompleted': True
        }
        
    except Exception as e:
        logger.error(f"音声分析エージェントエラー: {e}")
        return {
            'success': False,
            'sessionId': payload.get('sessionId') if payload else '',
            'error': '音声分析処理中にエラーが発生しました'
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
