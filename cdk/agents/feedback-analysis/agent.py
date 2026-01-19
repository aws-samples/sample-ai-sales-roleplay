"""
フィードバック分析エージェント - AgentCore Runtime版（Strands Agents + AgentCore Memory）

セッション終了後の詳細フィードバックを生成する。
Strands Agentsのstructured output機能で構造化された出力を提供。
AgentCore Memoryから会話履歴とメトリクスを読み取り。
"""

import json
import os
import logging
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException, Request

from strands import Agent
from strands.models import BedrockModel

from prompts import build_feedback_prompt, create_default_feedback
from models import FeedbackAnalysisResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BEDROCK_MODEL = os.environ.get('BEDROCK_MODEL_FEEDBACK', 'us.anthropic.claude-haiku-4-5-20251001-v1:0')
AWS_REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))
AGENTCORE_MEMORY_ID = os.environ.get('AGENTCORE_MEMORY_ID', '')

app = FastAPI(title="Feedback Analysis Agent", version="1.0.0")

_strands_agent = None
_memory_client = None


def get_strands_agent() -> Agent:
    """Strands Agentを取得（遅延初期化）"""
    global _strands_agent
    if _strands_agent is None:
        model = BedrockModel(
            model_id=BEDROCK_MODEL,
            region_name=AWS_REGION,
            temperature=0.3,
            max_tokens=4096,
        )
        _strands_agent = Agent(model=model)
    return _strands_agent


def get_memory_client():
    """AgentCore Memory Clientを取得"""
    global _memory_client
    if _memory_client is not None:
        return _memory_client
    
    if not AGENTCORE_MEMORY_ID:
        return None
    
    try:
        from bedrock_agentcore.memory import MemoryClient
        _memory_client = MemoryClient(region_name=AWS_REGION)
        return _memory_client
    except ImportError:
        logger.warning("bedrock_agentcore not available")
        return None
    except Exception as e:
        logger.error(f"Failed to create memory client: {e}")
        return None


def get_session_history_from_memory(session_id: str, actor_id: str) -> List[Dict[str, Any]]:
    """AgentCore Memoryからセッション履歴を取得
    
    AgentCore Memory Session Managerが保存するconversational形式のペイロードを解析。
    
    重要: Session Managerはcontent.textにJSON文字列を保存するため、
    二重にパースする必要がある。
    """
    client = get_memory_client()
    if not client or not AGENTCORE_MEMORY_ID:
        logger.warning("Memory client not available or AGENTCORE_MEMORY_ID not set")
        return []
    
    try:
        events = client.list_events(
            memory_id=AGENTCORE_MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
            max_results=100,
        )
        
        if isinstance(events, list):
            events_list = events
        elif isinstance(events, dict):
            events_list = events.get('events', [])
        else:
            events_list = []
        
        logger.info(f"Retrieved {len(events_list)} events from memory for session={session_id}")
        
        messages = []
        
        for event in events_list:
            payload_list = event.get('payload', [])
            event_timestamp = event.get('eventTimestamp', '')
            
            for payload_item in payload_list:
                conversational = payload_item.get('conversational', {})
                if conversational:
                    role = conversational.get('role', '').upper()
                    content_obj = conversational.get('content', {})
                    content_text = content_obj.get('text', '') if isinstance(content_obj, dict) else ''
                    
                    if not content_text:
                        continue
                    
                    actual_content = None
                    try:
                        inner_json = json.loads(content_text)
                        if isinstance(inner_json, dict) and 'message' in inner_json:
                            message_obj = inner_json['message']
                            content_list = message_obj.get('content', [])
                            if content_list and isinstance(content_list, list):
                                for content_item in content_list:
                                    if isinstance(content_item, dict) and 'text' in content_item:
                                        actual_content = content_item['text']
                                        break
                        elif isinstance(inner_json, dict) and 'content' in inner_json:
                            actual_content = inner_json.get('content', '')
                        elif isinstance(inner_json, dict) and 'text' in inner_json:
                            actual_content = inner_json.get('text', '')
                    except (json.JSONDecodeError, TypeError):
                        actual_content = content_text
                    
                    if actual_content:
                        sender = 'user' if role in ['USER', 'HUMAN'] else 'npc'
                        messages.append({
                            'sender': sender,
                            'content': actual_content,
                            'timestamp': event_timestamp,
                        })
                
                blob = payload_item.get('blob', {})
                if blob:
                    try:
                        blob_data = blob.get('data', b'')
                        if isinstance(blob_data, bytes):
                            blob_json = json.loads(blob_data.decode('utf-8'))
                        elif isinstance(blob_data, str):
                            blob_json = json.loads(blob_data)
                        else:
                            continue
                        
                        if blob_json.get('type') == 'METRICS_UPDATE':
                            continue
                        
                        if 'content' in blob_json and 'sender' in blob_json:
                            messages.append({
                                'sender': blob_json.get('sender', 'user'),
                                'content': blob_json.get('content', ''),
                                'timestamp': event_timestamp,
                            })
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        continue
        
        messages.sort(key=lambda x: x.get('timestamp', ''))
        logger.info(f"Parsed {len(messages)} messages from memory events")
        return messages
        
    except Exception as e:
        logger.error(f"Failed to get session history from memory: {e}", exc_info=True)
        return []


def handle_invocation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """エージェント呼び出しを処理"""
    try:
        logger.info(f"フィードバック分析エージェント呼び出し: payload_keys={list(payload.keys())}")
        
        session_id = payload.get('sessionId', '')
        actor_id = payload.get('actorId', payload.get('userId', 'default_user'))
        messages = payload.get('messages', [])
        final_metrics = payload.get('finalMetrics', {})
        scenario_goals = payload.get('scenarioGoals', [])
        language = payload.get('language', 'ja')
        
        logger.info(f"Session: {session_id}, Actor: {actor_id}, Messages from payload: {len(messages)}")
        
        # AgentCore Memoryから会話履歴を取得（messagesが空の場合）
        if not messages and session_id and AGENTCORE_MEMORY_ID:
            logger.info(f"Fetching messages from AgentCore Memory: session={session_id}")
            messages = get_session_history_from_memory(session_id, actor_id)
            logger.info(f"Retrieved {len(messages)} messages from AgentCore Memory")
        
        if not messages:
            logger.warning(f"No conversation history available for feedback analysis: session={session_id}")
        
        prompt = build_feedback_prompt(final_metrics, messages, scenario_goals, language)
        
        logger.info(f"フィードバック生成: messages={len(messages)}, metrics={final_metrics}")
        
        # Strands Agentでフィードバック生成（structured output使用）
        agent = get_strands_agent()
        response = agent(prompt, output_model=FeedbackAnalysisResult)
        
        # structured_outputから直接結果を取得
        feedback_result: FeedbackAnalysisResult = response.output
        feedback_data = feedback_result.model_dump()
        
        logger.info(f"フィードバック生成完了: overall_score={feedback_data.get('scores', {}).get('overall')}")
        
        return {
            'success': True,
            'sessionId': session_id,
            'feedbackData': feedback_data,
            'feedbackGenerated': True,
            'memoryEnabled': bool(AGENTCORE_MEMORY_ID),
        }
        
    except Exception as e:
        logger.error(f"フィードバック分析エージェントエラー: {e}")
        language = payload.get('language', 'ja') if payload else 'ja'
        return {
            'success': False,
            'sessionId': payload.get('sessionId') if payload else '',
            'feedbackData': create_default_feedback(language),
            'feedbackGenerated': False,
            'error': str(e)
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
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ping")
async def ping():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy", "memoryId": AGENTCORE_MEMORY_ID or "not_configured"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
