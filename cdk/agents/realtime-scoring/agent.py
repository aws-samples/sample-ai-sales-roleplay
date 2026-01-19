"""
リアルタイムスコアリングエージェント - AgentCore Runtime版（Strands Agents + AgentCore Memory）

営業会話のリアルタイム評価を行うエージェント。
Strands Agentsのstructured output機能で構造化された出力を提供。
AgentCore Memoryで会話履歴を取得し、メトリクス履歴を永続化。

重要: AgentCore Memory Session Managerを使用する場合、
- 会話履歴はMemoryから自動的に取得される
- フロントエンドからpreviousMessagesを送る必要はない
"""

import json
import os
import logging
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException, Request

from strands import Agent
from strands.models import BedrockModel

from prompts import build_scoring_prompt, get_default_scores
from models import ScoringResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AWS_REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))
BEDROCK_MODEL = os.environ.get('BEDROCK_MODEL_SCORING', 'us.anthropic.claude-haiku-4-5-20251001-v1:0')
AGENTCORE_MEMORY_ID = os.environ.get('AGENTCORE_MEMORY_ID', '')

app = FastAPI(title="Realtime Scoring Agent", version="1.0.0")

_memory_client = None


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


def get_conversation_history(session_id: str, actor_id: str, limit: int = 10) -> List[Dict]:
    """AgentCore Memoryから会話履歴を取得
    
    重要: Session Managerはcontent.textにJSON文字列を保存するため、
    二重にパースする必要がある。
    """
    client = get_memory_client()
    if not client or not AGENTCORE_MEMORY_ID or not session_id:
        logger.info("Memory client not available or session_id not provided")
        return []
    
    try:
        events = client.list_events(
            memory_id=AGENTCORE_MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
            max_results=limit * 2,
        )
        
        if isinstance(events, list):
            events_list = events
        elif isinstance(events, dict):
            events_list = events.get('events', [])
        else:
            events_list = []
        
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
        
        messages.sort(key=lambda x: x.get('timestamp', ''))
        return messages[-limit:] if len(messages) > limit else messages
        
    except Exception as e:
        logger.error(f"Failed to get conversation history from memory: {e}")
        return []


def save_metrics_to_dynamodb(session_id: str, actor_id: str, scores: Dict, analysis: str, message_count: int = 1):
    """メトリクスをDynamoDBに保存"""
    table_name = os.environ.get('SESSION_FEEDBACK_TABLE')
    if not table_name:
        logger.warning("SESSION_FEEDBACK_TABLE not set, skipping metrics save")
        return
    
    try:
        import boto3
        from datetime import datetime
        from decimal import Decimal
        import time
        
        dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
        table = dynamodb.Table(table_name)
        
        current_timestamp = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        ttl = int(time.time()) + (180 * 24 * 60 * 60)
        
        item = {
            "sessionId": session_id,
            "createdAt": current_timestamp,
            "dataType": "realtime-metrics",
            "messageNumber": message_count,
            "angerLevel": Decimal(str(scores.get('angerLevel', 5))),
            "trustLevel": Decimal(str(scores.get('trustLevel', 5))),
            "progressLevel": Decimal(str(scores.get('progressLevel', 5))),
            "analysis": analysis,
            "actorId": actor_id,
            "expireAt": ttl
        }
        
        table.put_item(Item=item)
        logger.info(f"Metrics saved to DynamoDB: session={session_id}, scores={scores}")
    except Exception as e:
        logger.error(f"Failed to save metrics to DynamoDB: {e}")


def handle_invocation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """エージェント呼び出しを処理"""
    try:
        session_id = payload.get('sessionId', '')
        actor_id = payload.get('actorId', payload.get('userId', 'default_user'))
        
        # AgentCore Memoryから会話履歴を取得
        previous_messages = payload.get('previousMessages', [])
        if not previous_messages and session_id and AGENTCORE_MEMORY_ID:
            previous_messages = get_conversation_history(session_id, actor_id, limit=5)
            logger.info(f"Retrieved {len(previous_messages)} messages from AgentCore Memory")
        
        prompt = build_scoring_prompt(
            payload.get('message', ''),
            previous_messages,
            payload.get('currentScores', get_default_scores()),
            payload.get('goals', []),
            payload.get('language', 'ja')
        )
        
        # Strands Agentでスコアリング（structured output使用）
        model = BedrockModel(
            model_id=BEDROCK_MODEL,
            region_name=AWS_REGION,
            temperature=0.3,
            max_tokens=500,
        )
        agent = Agent(model=model)
        response = agent(prompt, output_model=ScoringResult)
        
        # structured_outputから直接結果を取得
        scoring_result: ScoringResult = response.output
        result_dict = scoring_result.model_dump()
        
        scores = {
            'angerLevel': result_dict['angerLevel'],
            'trustLevel': result_dict['trustLevel'],
            'progressLevel': result_dict['progressLevel']
        }
        analysis = result_dict.get('analysis', '')
        
        # メトリクスをDynamoDBに保存
        message_count = len(previous_messages) + 1
        save_metrics_to_dynamodb(session_id, actor_id, scores, analysis, message_count)
        
        return {
            'success': True,
            'scores': scores,
            'analysis': analysis,
            'goalUpdates': result_dict.get('goalUpdates', []),
            'sessionId': session_id,
            'memoryEnabled': bool(AGENTCORE_MEMORY_ID),
        }
    except Exception as e:
        logger.error(f"Error: {e}")
        return {'success': False, 'error': 'AGENT_ERROR', 'message': 'スコアリング処理中にエラーが発生しました'}



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
    return {"status": "healthy", "memoryId": AGENTCORE_MEMORY_ID or "not_configured"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
