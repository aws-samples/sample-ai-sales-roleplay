"""
NPC会話エージェント用プロンプト定義
"""

from typing import Dict, Any, List


def build_npc_system_prompt(
    npc_info: Dict[str, Any],
    emotion_params: Dict[str, Any],
    language: str = 'ja'
) -> str:
    """NPC会話用のシステムプロンプトを生成"""
    npc_name = npc_info.get('name', '田中太郎')
    npc_role = npc_info.get('role', '購買担当者')
    npc_company = npc_info.get('company', '株式会社ABC')
    npc_personality = npc_info.get('personality', ['厳しい', '効率重視'])
    npc_description = npc_info.get('description', '')
    
    anger_level = emotion_params.get('angerLevel', 1)
    trust_level = emotion_params.get('trustLevel', 1)
    progress_level = emotion_params.get('progressLevel', 1)
    
    # 性格リストを文字列に変換
    personality_text = ', '.join(npc_personality) if isinstance(npc_personality, list) else npc_personality
    
    if language == 'en':
        description_section = f"\n## Background\n{npc_description}" if npc_description else ""
        return f"""You are {npc_name}, a {npc_role} at {npc_company}.

## Your Personality
{personality_text}
{description_section}

## Current Emotional State
- Anger Level: {anger_level}/10
- Trust Level: {trust_level}/10
- Negotiation Progress: {progress_level}/10

## Important Instructions
- Respond naturally to the salesperson's message based on the conversation history
- Stay in character as {npc_name}
- Respond in 1-3 sentences
- Do not include your name at the beginning of your response
- Remember the conversation context from previous messages"""
    else:
        description_section = f"\n## 背景情報\n{npc_description}" if npc_description else ""
        return f"""あなたは{npc_company}の{npc_role}である{npc_name}です。

## あなたの性格
{personality_text}
{description_section}

## 現在の感情状態
- 怒りレベル: {anger_level}/10
- 信頼レベル: {trust_level}/10
- 商談進捗度: {progress_level}/10

## 重要な指示
- これまでの会話履歴に基づいて、営業担当者のメッセージに自然に応答してください
- {npc_name}としてのキャラクターを維持してください
- 1〜3文程度で応答してください
- 応答の冒頭に名前を含めないでください
- 前のメッセージからの会話の文脈を覚えておいてください"""


def get_default_npc_info() -> Dict[str, Any]:
    """デフォルトのNPC情報を取得"""
    return {
        'name': '田中太郎',
        'role': '購買担当者',
        'company': '株式会社ABC',
        'personality': ['厳しい', '効率重視']
    }


def get_default_emotion_params() -> Dict[str, Any]:
    """デフォルトの感情パラメータを取得"""
    return {
        'angerLevel': 1,
        'trustLevel': 1,
        'progressLevel': 1
    }
