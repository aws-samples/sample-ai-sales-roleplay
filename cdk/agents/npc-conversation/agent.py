"""
NPC会話エージェント - AgentCore Runtime版（Strands Agents + AgentCore Memory）

NPCとの会話応答を生成するエージェント。
Strands AgentsとBedrock Claude 4.5 Haikuを使用して応答を生成する。
AgentCore Memoryで会話履歴を永続化。

重要: AgentCore Memory Session Managerを使用する場合、
- システムプロンプトは Agent の system_prompt パラメータで設定
- ユーザーメッセージのみを agent() に渡す
- 会話履歴は自動的に管理される

注: このエージェントは自然言語の応答を生成するため、
Structured Outputは使用せず、通常のテキスト出力を使用。
"""

import json
import os
import logging
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, Request

from strands import Agent
from strands.models import BedrockModel

from prompts import build_npc_system_prompt, get_default_npc_info, get_default_emotion_params

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AWS_REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))
BEDROCK_MODEL = os.environ.get('BEDROCK_MODEL_CONVERSATION', 'us.anthropic.claude-haiku-4-5-20251001-v1:0')
AGENTCORE_MEMORY_ID = os.environ.get('AGENTCORE_MEMORY_ID', '')

app = FastAPI(title="NPC Conversation Agent", version="1.0.0")


def get_session_manager(session_id: str, actor_id: str):
    """AgentCore Memory Session Managerを取得"""
    if not AGENTCORE_MEMORY_ID:
        logger.warning("AGENTCORE_MEMORY_ID not set, using in-memory session")
        return None
    
    try:
        from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
        from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
        
        config = AgentCoreMemoryConfig(
            memory_id=AGENTCORE_MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
        )
        
        session_manager = AgentCoreMemorySessionManager(
            agentcore_memory_config=config,
            region_name=AWS_REGION,
        )
        
        logger.info(f"AgentCore Memory Session Manager created: session={session_id}, actor={actor_id}")
        return session_manager
        
    except ImportError as e:
        logger.warning(f"AgentCore Memory not available: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to create session manager: {e}")
        return None


def create_agent_with_memory(
    session_id: str,
    actor_id: str,
    system_prompt: str
) -> Agent:
    """
    セッション用のエージェントを作成（会話履歴はSession Managerが復元）
    
    AgentCore Runtimeはステートレスなので、毎回新規作成する。
    Session Managerが会話履歴を自動的に復元・永続化する。
    """
    model = BedrockModel(
        model_id=BEDROCK_MODEL,
        region_name=AWS_REGION,
        temperature=0.7,
        max_tokens=500,
    )
    
    session_manager = get_session_manager(session_id, actor_id)
    
    if session_manager:
        agent = Agent(
            model=model,
            system_prompt=system_prompt,
            session_manager=session_manager,
        )
        logger.info(f"Created agent with AgentCore Memory for session: {session_id}")
    else:
        agent = Agent(
            model=model,
            system_prompt=system_prompt,
        )
        logger.info(f"Created agent without memory for session: {session_id}")
    
    return agent


def extract_response_text(result) -> str:
    """Strands Agentsのレスポンスからテキストを抽出"""
    if hasattr(result, 'message'):
        msg = result.message
        if isinstance(msg, str):
            return msg
        elif isinstance(msg, dict) and 'content' in msg:
            content = msg['content']
            if isinstance(content, list):
                return ''.join(
                    item.get('text', '') if isinstance(item, dict) else str(item)
                    for item in content
                )
            return str(content)
        elif hasattr(msg, 'content'):
            content = msg.content
            if isinstance(content, list):
                return ''.join(
                    item.get('text', '') if isinstance(item, dict) else str(item)
                    for item in content
                )
            return str(content)
        return str(msg)
    return str(result)


def handle_invocation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """エージェント呼び出しを処理"""
    try:
        logger.info(f"NPC会話エージェント呼び出し")
        
        user_message = payload.get('message', 'こんにちは')
        npc_info = payload.get('npcInfo', get_default_npc_info())
        emotion_params = payload.get('emotionParams', get_default_emotion_params())
        language = payload.get('language', 'ja')
        session_id = payload.get('sessionId', '')
        actor_id = payload.get('actorId', payload.get('userId', 'default_user'))
        
        logger.info(f"Session: {session_id}, Actor: {actor_id}, Message: {user_message[:50]}...")
        
        # システムプロンプト生成
        system_prompt = build_npc_system_prompt(
            npc_info=npc_info,
            emotion_params=emotion_params,
            language=language
        )
        
        # エージェントを作成（Session Managerが会話履歴を復元）
        agent = create_agent_with_memory(session_id, actor_id, system_prompt)
        
        # ユーザーメッセージのみを送信（会話履歴はAgentCore Memoryが管理）
        logger.info(f"Sending user message to agent: {user_message}")
        result = agent(user_message)
        
        # レスポンスを抽出
        npc_response = extract_response_text(result)
        
        logger.info(f"NPC応答生成完了: {len(npc_response)}文字")
        
        return {
            'success': True,
            'message': npc_response,
            'sessionId': session_id,
            'memoryEnabled': bool(AGENTCORE_MEMORY_ID),
        }
        
    except Exception as e:
        logger.error(f"NPC会話エージェントエラー: {e}", exc_info=True)
        return {
            'success': False,
            'error': 'AGENT_ERROR',
            'message': '会話処理中にエラーが発生しました'
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
        
        logger.info(f"処理ペイロード: {json.dumps(payload, ensure_ascii=False, default=str)[:500]}")
        result = handle_invocation(payload)
        
        return {"output": result}
    except Exception as e:
        logger.error(f"Invocation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/ping")
async def ping():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy", "memoryId": AGENTCORE_MEMORY_ID or "not_configured"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
