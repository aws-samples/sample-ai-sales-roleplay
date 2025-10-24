"""
プロンプト生成ロジック
AI営業ロールプレイのNPC対話用プロンプトを動的に生成

このモジュールはAI営業ロールプレイシステムの中核部分として、
NPCの性格特性やシナリオタイプに基づいた適切なプロンプトを
生成するためのロジックを提供します。

PromptBuilderクラスはシングルトンインスタンスとして提供され、
複数回の呼び出しで再利用されます。

Classes:
    PromptBuilder: NPCとの対話用プロンプトを生成するクラス
"""

from typing import Dict, Any, List, Optional
from prompt_templates import (
    NPC_BASE_PROMPT_TEMPLATE,
    REALTIME_EVALUATION_PROMPT_TEMPLATE,
    DEFAULT_CONVERSATION_RULES,
    DEFAULT_NPC_INFO,
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES
)


class PromptBuilder:
    """
    プロンプト生成を担当するクラス
    
    NPCとの対話用のプロンプトを動的に生成するためのクラスです。
    テンプレートに対して、NPC情報、会話履歴、シナリオ特性、感情パラメータなどを
    適切に組み合わせて、一貫性のある対話を実現します。
    
    Attributes:
        base_template (str): プロンプトのベーステンプレート
        default_rules (str): デフォルトの会話ルール
    """
    
    def __init__(self):
        # テンプレートは言語に応じて動的に選択されるようになったため、
        # ここではinitで固定値を設定しない
        pass
    
    def build_npc_prompt(
        self,
        user_message: str,
        npc_info: Dict[str, Any],
        previous_messages: List[Dict[str, Any]] = None,
        emotion_params: Optional[Dict[str, int]] = None,
        language: str = None
    ) -> str:
        """
        NPCとの対話用プロンプトを生成
        
        ユーザーのメッセージ、NPC情報、過去の会話履歴、およびシナリオタイプに基づいて
        Bedrockモデルへ送信するためのプロンプトを生成します。
        NPC情報にはデフォルト値が適用され、会話履歴はフォーマットされ、
        シナリオや性格に応じた追加ルールが適用されます。
        感情パラメータが提供された場合、それらも考慮されます。
        
        Args:
            user_message (str): ユーザーのメッセージ
            npc_info (Dict[str, Any]): NPC情報（name, role, company, personality, description）
                - name (str): NPCの名前
                - role (str): NPCの役職
                - company (str): NPCの会社名
                - personality (List[str]): 性格特性のリスト（例：["厳しい", "効率重視"]）
                - description (str): NPCの詳細な背景説明（年齢、状況など）
            previous_messages (List[Dict[str, Any]], optional): 過去の会話履歴
                - sender (str): メッセージの送信者 ("user" または "npc")
                - content (str): メッセージの内容
                - metrics (Dict, optional): 感情メトリクス
            emotion_params (Dict[str, int], optional): 感情パラメータ
                - angerLevel (int): 怒りレベル (1-10)
                - trustLevel (int): 信頼レベル (1-10)
                - progressLevel (int): 進捗レベル (1-10)
            language (str, optional): 使用言語コード（"ja", "en"など）。
                - 指定がない場合はデフォルト言語（日本語）を使用
        
        Returns:
            str: 生成されたプロンプト（Bedrockモデルに送信する形式）
        """
        
        # 言語の決定（未指定の場合はデフォルト言語を使用）
        lang = language or DEFAULT_LANGUAGE
        if lang not in SUPPORTED_LANGUAGES:
            lang = DEFAULT_LANGUAGE

        # デフォルト値の適用
        npc_info = self._apply_default_npc_info(npc_info)
        
        # 会話履歴の構築
        conversation_history = self._build_conversation_history(
            previous_messages or [], npc_info['name'], lang
        )
        
        # 性格特性の文字列化（言語によって結合文字を変更）
        personality_traits = npc_info.get('personality', [])
        # 英語の場合はカンマ区切り、日本語の場合は読点区切り
        separator = ", " if lang == "en" else "、"
        personality_text = separator.join(personality_traits)
        
        # NPCの詳細説明を取得（ない場合は空文字）
        npc_description = npc_info.get('description', '')
        
        # ルールの構築（シナリオ別・性格別ルール含む）
        conversation_rules = self._build_conversation_rules(
            personality_traits, lang
        )
        
        # 感情状態の文字列を生成（emotion_paramsがある場合のみ）
        emotion_text = ""
        if emotion_params:
            anger_level = emotion_params.get('angerLevel', 1)
            trust_level = emotion_params.get('trustLevel', 1)
            progress_level = emotion_params.get('progressLevel', 1)
            
            # 感情状態テキストの生成
            emotion_text = self._build_emotion_state_text(
                anger_level=anger_level,
                trust_level=trust_level,
                progress_level=progress_level,
                language=lang
            )
        
        # 言語に応じたテンプレートを取得
        base_template = NPC_BASE_PROMPT_TEMPLATE.get(lang, NPC_BASE_PROMPT_TEMPLATE["ja"])
        
        # プロンプトの組み立て
        prompt = base_template.format(
            npc_name=npc_info['name'],
            npc_role=npc_info['role'],
            npc_company=npc_info['company'],
            personality_text=personality_text,
            npc_description=npc_description,
            conversation_rules=conversation_rules,
            emotion_state=emotion_text,
            conversation_history=conversation_history,
            user_message=user_message
        )
        
        return prompt.strip()
    
    def _apply_default_npc_info(self, npc_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        デフォルトNPC情報を適用
        
        提供されたNPC情報に対して、不足している項目がある場合に
        DEFAULT_NPC_INFOからデフォルト値を適用します。
        これにより、不完全なNPC情報でも常に有効なプロンプトが生成されます。
        
        Args:
            npc_info (Dict[str, Any]): 入力されたNPC情報
                - name (str): NPCの名前 (optional)
                - role (str): NPCの役職 (optional)
                - company (str): NPCの会社名 (optional)
                - personality (List[str]): 性格特性のリスト (optional)
        
        Returns:
            Dict[str, Any]: デフォルト値が適用されたNPC情報。
                提供されなかった値は DEFAULT_NPC_INFO の値で補完されます。
        """
        result = DEFAULT_NPC_INFO.copy()
        result.update(npc_info)
        return result
    
    def _build_conversation_history(
        self, 
        previous_messages: List[Dict[str, Any]], 
        npc_name: str,
        language: str = DEFAULT_LANGUAGE
    ) -> str:
        """
        会話履歴をテキストに変換
        
        過去のメッセージリストを、プロンプトに含めるためのフォーマット済み
        テキストに変換します。メッセージの送信者によって「ユーザー」または
        NPC名のプレフィックスが付与されます。
        
        Args:
            previous_messages (List[Dict[str, Any]]): 過去のメッセージリスト
                - sender (str): メッセージの送信者 ("user" または "npc") 
                - content (str): メッセージの内容
            npc_name (str): NPCの名前（NPC発言のプレフィックスとして使用）
            language (str): 使用言語コード（"ja"、"en"など）
        
        Returns:
            str: フォーマットされた会話履歴
                空のリストが渡された場合は空文字列を返します。
                それ以外は「これまでの会話:」という見出しで始まり（言語に応じた表現）、
                各メッセージが行ごとに「送信者名: メッセージ内容」の形式で表示されます。
        """
        if not previous_messages:
            return ""
        
        # 言語に応じてユーザーの表示名を変更
        user_label = 'User' if language == 'en' else 'ユーザー'
        
        history_lines = []
        for msg in previous_messages:
            sender_name = user_label if msg['sender'] == 'user' else npc_name
            history_lines.append(f"{sender_name}: {msg['content']}")
        
        # 言語に応じた会話履歴のヘッダー
        header = "Previous conversation:" if language == "en" else "これまでの会話:"
        
        return f"{header}\n" + "\n".join(history_lines) + "\n"
    
    def _build_conversation_rules(
        self, 
        personality_traits: List[str],
        language: str = DEFAULT_LANGUAGE
    ) -> str:
        """
        会話ルールを構築（シナリオ別・性格別ルール含む）
        
        デフォルトの会話ルールにシナリオタイプと性格特性に基づいた
        追加ルールを組み合わせて、最終的な会話ルールを構築します。
        言語に応じて適切なルールが選択されます。
        
        Args:
            personality_traits (List[str]): 性格特性のリスト
                - 日本語: "厳しい", "慎重", "効率重視" など
                - 英語: "Strict", "Cautious", "Efficiency-focused" など
            language (str): 使用言語コード（"ja", "en"など）
        
        Returns:
            str: シナリオと性格に応じた追加ルールを含む、構築された会話ルール
        """
        # 言語が対応されていない場合はデフォルト言語を使用
        if language not in SUPPORTED_LANGUAGES:
            language = DEFAULT_LANGUAGE
            
        # 言語に応じたデフォルトルールを取得
        rules = DEFAULT_CONVERSATION_RULES.get(language, DEFAULT_CONVERSATION_RULES[DEFAULT_LANGUAGE])
                
        # 性格別ルールの追加
        personality_rules = []
        for trait in personality_traits:
            personality_rules.append(trait)
            
        if personality_rules:
            # 言語に応じたヘッダー
            header = "Additional Rules (Personality):" if language == "en" else "追加ルール（性格）:"
            rules += f"\n\n{header}\n" + "\n".join(personality_rules)
        
        return rules
        
    def _build_emotion_state_text(
        self, 
        anger_level: int, 
        trust_level: int, 
        progress_level: int,
        language: str = DEFAULT_LANGUAGE
    ) -> str:
        """
        現在の感情状態を数値情報としてテキスト化
        
        Args:
            anger_level (int): 怒りレベル (1-10)
            trust_level (int): 信頼レベル (1-10)
            progress_level (int): 進捗レベル (1-10)
            language (str): 使用言語コード（"ja", "en"など）
            
        Returns:
            str: 感情状態を表すシンプルなテキスト（言語に応じた形式）
        """
        if language == "en":
            return f"""Current emotional state (scale of 1-10):
- Anger level: {anger_level}/10 (higher means more anger)
- Trust level: {trust_level}/10 (higher means more trust)
- Negotiation progress: {progress_level}/10 (higher means more progress)
"""
        else:
            return f"""現在の感情状態（1-10のスケール）:
- 怒りレベル: {anger_level}/10（高いほど怒りが強い）
- 信頼レベル: {trust_level}/10（高いほど信頼が強い）
- 商談進捗度: {progress_level}/10（高いほど商談が進んでいる）
"""


# グローバルインスタンス（Lambda関数で再利用）
prompt_builder = PromptBuilder()
