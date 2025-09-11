"""
音声分析用プロンプト定義

話者の役割特定のためのプロンプトテンプレート。
"""

def get_speaker_analysis_prompt(speaker_utterances: dict, language: str = "ja") -> str:
    """
    話者役割分析用のプロンプトを生成
    
    Args:
        speaker_utterances: 話者ラベルごとの発言リスト
        language: 言語コード（ja/en）
        
    Returns:
        str: 分析用プロンプト
    """
    if language == "en":
        return _create_english_analysis_prompt(speaker_utterances)
    else:
        return _create_japanese_analysis_prompt(speaker_utterances)

def _create_japanese_analysis_prompt(speaker_utterances: dict) -> str:
    """日本語用の分析プロンプトを作成"""
    
    speaker_info_text = ""
    for speaker_label, utterances in speaker_utterances.items():
        sample_utterances = utterances[:5]  # 最初の5つの発言をサンプルとして使用
        speaker_info_text += f"\n{speaker_label}: {' | '.join(sample_utterances)}"
    
    return f"""
あなたは営業会話の音声分析専門家です。以下の会話の転写テキストから、各話者の役割を特定してください。

## 話者別の発言内容:
{speaker_info_text}

## 分析タスク:
各話者について以下を特定してください：
1. 役割（salesperson: 営業担当者、customer: 顧客、observer: 観察者/その他）
2. 信頼度（0.0-1.0の範囲）
3. 代表的な発言例（最大3つ）

## 分析のポイント:
- 営業担当者: 商品説明、提案、質問、クロージング、価格提示を行う
  例: 「こちらの商品はいかがでしょうか」「ご予算はどの程度でしょうか」「資料をお持ちしました」
- 顧客: 質問、懸念表明、意思決定に関わる発言をする
  例: 「価格が気になります」「検討させてください」「どのような効果がありますか」
- 観察者: 会話に参加しない、または補助的な発言のみ
  例: 「失礼します」「お疲れさまです」「会議室はこちらです」

## 出力要件:
各話者に対してSpeakerInfoオブジェクトを生成してください。
- speaker_label: 話者ラベル（そのまま）
- identified_role: 特定した役割（salesperson/customer/observer）
- confidence: 信頼度（発言内容の特徴の明確さに基づく0.0-1.0）
- sample_utterances: 代表的な発言例（最大3つ）

信頼度の設定基準:
- 0.9-1.0: 役割が非常に明確（専門用語、典型的な営業/顧客の発言パターン）
- 0.7-0.8: 役割がある程度明確（文脈から判断可能）
- 0.5-0.6: 役割がやや不明確（一般的な会話）
- 0.0-0.4: 役割が不明確（判断材料が少ない）
"""

def _create_english_analysis_prompt(speaker_utterances: dict) -> str:
    """英語用の分析プロンプトを作成"""
    
    speaker_info_text = ""
    for speaker_label, utterances in speaker_utterances.items():
        sample_utterances = utterances[:5]  # Use first 5 utterances as samples
        speaker_info_text += f"\n{speaker_label}: {' | '.join(sample_utterances)}"
    
    return f"""
You are a sales conversation audio analysis expert. Please identify the role of each speaker from the following conversation transcript.

## Speaker Utterances:
{speaker_info_text}

## Analysis Task:
For each speaker, identify:
1. Role (salesperson: sales representative, customer: client/prospect, observer: other participant)
2. Confidence level (0.0-1.0 range)
3. Representative utterances (up to 3 examples)

## Analysis Points:
- Salesperson: Provides product explanations, proposals, asks questions, attempts closing, presents pricing
  Examples: "How about this product?" "What's your budget range?" "I brought some materials for you"
- Customer: Asks questions, expresses concerns, makes decision-related statements
  Examples: "I'm concerned about the price" "Let me think about it" "What kind of benefits does this offer?"
- Observer: Limited participation or supportive comments only
  Examples: "Excuse me" "Thank you for your time" "The meeting room is this way"

## Output Requirements:
Generate SpeakerInfo object for each speaker:
- speaker_label: Speaker label (as-is)
- identified_role: Identified role (salesperson/customer/observer)
- confidence: Confidence level (0.0-1.0 based on clarity of role-indicating speech patterns)
- sample_utterances: Representative utterances (up to 3)

Confidence Level Guidelines:
- 0.9-1.0: Role very clear (technical terms, typical sales/customer speech patterns)
- 0.7-0.8: Role somewhat clear (can be determined from context)
- 0.5-0.6: Role somewhat unclear (general conversation)
- 0.0-0.4: Role unclear (insufficient evidence)
"""
