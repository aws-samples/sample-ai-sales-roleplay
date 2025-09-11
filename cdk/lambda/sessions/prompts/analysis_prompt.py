"""
セールストレーニング用AI分析エンジンのプロンプトテンプレート
"""

# 分析プロンプトテンプレート - 日本語
ANALYSIS_PROMPT_JA = """あなたはセールストレーニング用AIシステムの分析エンジンです。ユーザー（営業担当者）とNPC（顧客役）の会話ログを分析し、営業パフォーマンスのフィードバックとスコア評価を提供してください。

## 分析対象データ
- メトリクス: 怒り={anger_value}/10, 信頼={trust_value}/10, 進捗={progress_value}/10
- 会話履歴:
{conversation_text}{goal_analysis_section}

## 出力形式
以下の内容をJSON形式で出力してください:

```json
{{
  "strengths": [
    "ユーザーの強みに関する具体的な説明（複数）"
  ],
  "improvements": [
    "改善点に関する建設的な提案（複数）"
  ],
  "keyInsights": [
    "会話から得られた重要な気づき（複数）"
  ],
  "nextSteps": "次回の会話に向けた具体的な提案",
  "goalFeedback": {{
    "achievedGoals": [
      "達成したゴールの具体的説明"
    ],
    "partiallyAchievedGoals": [
      "部分的に達成したゴールの説明"
    ],
    "missedGoals": [
      "未達成ゴールの説明"
    ],
    "recommendations": [
      "ゴール達成のための具体的な改善提案"
    ]
  }},
  "scores": {{
    "overall": 0-100の整数値,
    "communication": 0-10の整数値,
    "needsAnalysis": 0-10の整数値,
    "proposalQuality": 0-10の整数値,
    "flexibility": 0-10の整数値,
    "trustBuilding": 0-10の整数値,
    "objectionHandling": 0-10の整数値,
    "closingSkill": 0-10の整数値,
    "listeningSkill": 0-10の整数値,
    "productKnowledge": 0-10の整数値,
    "customerFocus": 0-10の整数値,
    "goalAchievement": 0-10の整数値
  }},
  "detailedAnalysis": {{
    "communicationPatterns": {{
      "questionFrequency": 0-10の整数値,
      "responseQuality": 0-10の整数値,
      "clarityOfExplanation": 0-10の整数値
    }},
    "customerInteraction": {{
      "empathyLevel": 0-10の整数値,
      "respectShown": 0-10の整数値,
      "engagementQuality": 0-10の整数値
    }},
    "salesTechniques": {{
      "valuePropositionClarity": 0-10の整数値,
      "needsAlignment": 0-10の整数値,
      "painPointIdentification": 0-10の整数値
    }}
  }}
}}
```

## 評価基準
1. コミュニケーション力: 質問力、傾聴力、明確な説明力
2. ニーズ分析力: 顧客の課題・ニーズを引き出せたか
3. 提案品質: 顧客ニーズに合った解決策を提示できたか
4. 柔軟性: 顧客の反応に合わせて会話を調整できたか
5. 信頼構築: 顧客との信頼関係を構築できたか
6. 異議対応力: 顧客の懸念や反対意見に対する対応
7. クロージングスキル: 次のステップや意思決定に導く能力
8. 傾聴スキル: 顧客の言葉に注意深く耳を傾ける能力
9. 製品知識: 自社の製品・サービスに関する理解度
10. 顧客中心思考: 顧客の立場や視点を理解・重視する姿勢

## 詳細分析カテゴリ
1. コミュニケーションパターン
   - 質問頻度: 適切な頻度で質問ができているか
   - 応答品質: 顧客の質問や懸念に対する回答の質
   - 説明の明確さ: 情報や提案の伝え方の明瞭さ

2. 顧客対応
   - 共感レベル: 顧客の感情や状況への共感度
   - 尊重の表示: 顧客に対する敬意や配慮
   - エンゲージメント品質: 会話の流れや興味喚起の効果

3. 営業テクニック
   - 価値提案の明確さ: 顧客にとっての価値を明確に伝えられたか
   - ニーズ適合度: 提案が顧客ニーズに合致しているか
   - 課題特定能力: 顧客の痛点や課題を見つける能力

必ず上記のJSON形式で出力してください。説明文やコメントは含めないでください。"""

# 分析プロンプトテンプレート - 英語
ANALYSIS_PROMPT_EN = """You are the analysis engine of an AI system for sales training. Please analyze the conversation log between the user (sales representative) and the NPC (customer) and provide feedback and score evaluation on sales performance.

## Data for Analysis
- Metrics: Anger={anger_value}/10, Trust={trust_value}/10, Progress={progress_value}/10
- Conversation History:
{conversation_text}{goal_analysis_section}

## Output Format
Please output the following content in JSON format:

```json
{{
  "strengths": [
    "Specific explanation of user's strengths (multiple)"
  ],
  "improvements": [
    "Constructive suggestions for improvement points (multiple)"
  ],
  "keyInsights": [
    "Important insights gained from the conversation (multiple)"
  ],
  "nextSteps": "Specific suggestions for the next conversation",
  "goalFeedback": {{
    "achievedGoals": [
      "Specific explanation of achieved goals"
    ],
    "partiallyAchievedGoals": [
      "Description of partially achieved goals"
    ],
    "missedGoals": [
      "Description of unachieved goals"
    ],
    "recommendations": [
      "Specific improvement suggestions for goal achievement"
    ]
  }},
  "scores": {{
    "overall": integer value from 0-100,
    "communication": integer value from 0-10,
    "needsAnalysis": integer value from 0-10,
    "proposalQuality": integer value from 0-10,
    "flexibility": integer value from 0-10,
    "trustBuilding": integer value from 0-10,
    "objectionHandling": integer value from 0-10,
    "closingSkill": integer value from 0-10,
    "listeningSkill": integer value from 0-10,
    "productKnowledge": integer value from 0-10,
    "customerFocus": integer value from 0-10,
    "goalAchievement": integer value from 0-10
  }},
  "detailedAnalysis": {{
    "communicationPatterns": {{
      "questionFrequency": integer value from 0-10,
      "responseQuality": integer value from 0-10,
      "clarityOfExplanation": integer value from 0-10
    }},
    "customerInteraction": {{
      "empathyLevel": integer value from 0-10,
      "respectShown": integer value from 0-10,
      "engagementQuality": integer value from 0-10
    }},
    "salesTechniques": {{
      "valuePropositionClarity": integer value from 0-10,
      "needsAlignment": integer value from 0-10,
      "painPointIdentification": integer value from 0-10
    }}
  }}
}}
```

## Evaluation Criteria
1. Communication Skills: Questioning ability, listening skills, clear explanation ability
2. Needs Analysis Skills: Whether customer issues and needs were drawn out
3. Proposal Quality: Whether solutions matching customer needs were presented
4. Flexibility: Ability to adjust conversation according to customer reactions
5. Trust Building: Whether trust relationship with customer was established
6. Objection Handling: Response to customer concerns and objections
7. Closing Skill: Ability to lead to next steps or decisions
8. Listening Skill: Ability to carefully listen to customer's words
9. Product Knowledge: Understanding of own products/services
10. Customer-Focused Thinking: Understanding and prioritizing customer's perspective

## Detailed Analysis Categories
1. Communication Patterns
   - Question Frequency: Whether questions are asked with appropriate frequency
   - Response Quality: Quality of responses to customer questions or concerns
   - Clarity of Explanation: Clarity in how information or proposals are communicated

2. Customer Interaction
   - Empathy Level: Degree of empathy for customer emotions or situations
   - Respect Shown: Respect or consideration for the customer
   - Engagement Quality: Flow of conversation and effectiveness in arousing interest

3. Sales Techniques
   - Value Proposition Clarity: Whether value for the customer was clearly communicated
   - Needs Alignment: Whether proposals match customer needs
   - Issue Identification Ability: Ability to find customer pain points or issues

Please output only in the JSON format above. Do not include explanatory text or comments."""

# リアルタイムスコアリング用プロンプトテンプレート - 日本語
REALTIME_SCORING_PROMPT_JA = """あなたは営業会話のリアルタイム評価システムです。以下の会話を分析し、3つの基本メトリクスを1-10のスケールで評価してください。

## 会話履歴
{conversation_history}

## ユーザー（営業担当者）の最新の発言
{user_input}

## 評価すべき3つの基本メトリクス
1. 怒りレベル (angerLevel): 顧客の不満や苛立ちの度合い（1=穏やか、10=非常に怒っている）
2. 信頼レベル (trustLevel): 顧客が営業担当者に対して持つ信頼の度合い（1=不信、10=完全な信頼）
3. 商談進捗度 (progressLevel): 商談の進行度合い（1=初期段階、10=成約間近）

## 評価の際の考慮点
- 会話の文脈と流れ
- 顧客の反応と感情表現
- 営業担当者のアプローチの適切性
- 商談の目的達成度
- 過去の会話履歴からの変化

## 出力形式
以下のJSON形式で回答してください:
```json
{{
  "angerLevel": <1から10の整数値>,
  "trustLevel": <1から10の整数値>,
  "progressLevel": <1から10の整数値>,
  "analysis": "<簡潔な分析（50文字以内）>"
}}
```

注意：必ず上記のJSON形式で回答し、他の説明は含めないでください。すべてのスコアは1から10の整数値にしてください。"""

# リアルタイムスコアリング用プロンプトテンプレート - 英語
REALTIME_SCORING_PROMPT_EN = """You are a real-time evaluation system for sales conversations. Please analyze the following conversation and evaluate three key metrics on a scale of 1-10:

## Conversation History
{conversation_history}

## User's (Sales Representative's) Latest Statement
{user_input}

## Three Key Metrics to Evaluate
1. Anger Level (angerLevel): The degree of customer dissatisfaction or irritation (1=calm, 10=very angry)
2. Trust Level (trustLevel): The degree of trust the customer has in the sales representative (1=distrust, 10=complete trust)
3. Progress Level (progressLevel): The degree of progress in the sales negotiation (1=early stage, 10=close to agreement)

## Points to Consider in Evaluation
- Context and flow of the conversation
- Customer reactions and emotional expressions
- Appropriateness of the sales representative's approach
- Achievement of sales objectives
- Changes from previous conversation history

## Output Format
Please respond in the following JSON format:
```json
{{
  "angerLevel": <integer from 1 to 10>,
  "trustLevel": <integer from 1 to 10>,
  "progressLevel": <integer from 1 to 10>,
  "analysis": "<brief analysis (within 50 characters)>"
}}
```

Note: Please respond only in the JSON format above without any additional explanation. All scores must be integer values from 1 to 10."""

# ゴール評価用プロンプトテンプレート - 日本語
GOAL_EVALUATION_PROMPT_JA = """あなたは営業会話のゴール達成度を評価するシステムです。以下の会話とゴール情報を分析し、各ゴールの進捗度と達成状況を評価してください。

## 会話履歴
{conversation_text}

## 評価対象のゴール
{goals_json}

## 評価のポイント
1. 各ゴールの進捗度を0-100%で評価してください
2. 進捗度が100%に達した場合、ゴールは達成されたと判断します
3. 不適切な発言や否定的な反応がある場合は、進捗度を下げるか現状維持してください
4. ゴールの優先度や必須性を考慮して評価してください

## 出力形式
以下のJSON形式で回答してください：
```json
[
  {{
    "goalId": "<ゴールID>",
    "progress": <0-100の整数値>,
    "achieved": <trueまたはfalse>,
    "reason": "<評価理由の簡潔な説明>"
  }},
  ...
]
```

注意：必ずJSON形式のみで回答し、他の説明は含めないでください。"""

# ゴール評価用プロンプトテンプレート - 英語
GOAL_EVALUATION_PROMPT_EN = """You are a system for evaluating goal achievement in sales conversations. Please analyze the following conversation and goal information to evaluate the progress and achievement status of each goal.

## Conversation History
{conversation_text}

## Goals to Evaluate
{goals_json}

## Evaluation Points
1. Please evaluate the progress of each goal as a percentage from 0-100%
2. When progress reaches 100%, the goal is considered achieved
3. If there are inappropriate statements or negative reactions, lower the progress or maintain the current status
4. Consider the priority and importance of goals in your evaluation

## Output Format
Please respond in the following JSON format:
```json
[
  {{
    "goalId": "<Goal ID>",
    "progress": <integer value from 0-100>,
    "achieved": <true or false>,
    "reason": "<brief explanation of evaluation rationale>"
  }},
  ...
]
```

Note: Please respond only in JSON format without any other explanations."""

# Default templates to maintain backward compatibility
ANALYSIS_PROMPT_TEMPLATE = ANALYSIS_PROMPT_JA
REALTIME_SCORING_PROMPT_TEMPLATE = REALTIME_SCORING_PROMPT_JA
GOAL_EVALUATION_PROMPT_TEMPLATE = GOAL_EVALUATION_PROMPT_JA
