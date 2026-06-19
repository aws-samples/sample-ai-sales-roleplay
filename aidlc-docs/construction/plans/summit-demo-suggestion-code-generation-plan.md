# コード生成計画 - サジェスト返答ボタン（AI動的生成）

## ユニットコンテキスト

### 概要
NPCの直前発言と会話の流れを踏まえ、ユーザー（営業担当者）の返答候補をリアルタイムスコアリングエージェントがAI生成し、会話画面にボタンとして表示する。ユーザーはタップ/クリックで候補を選んで送信できる。シナリオ設定 `suggestionEnabled` でON/OFFできる本番でも使える汎用機能として実装する。

### 実装方針
- 候補生成はリアルタイムスコアリングエージェント（`realtime-scoring`）の構造化出力 `ScoringResult` に相乗り（追加API呼び出しなし）
- 会話画面では既存の `sendMessage(inputText?)` を活用し、`MessageInput` 直上に新規 `SuggestionBar` を配置
- 後方互換: `suggestions` / `suggestionEnabled` 未設定でも既存フローが動作する

### 依存関係・インターフェース
- **バックエンド出力**: `ScoringResult.suggestions: List[str]`（最大3件、短文）
- **API伝搬**: `getRealtimeEvaluation` レスポンスに `suggestions?: string[]` を追加
- **シナリオフラグ**: `suggestionEnabled?: boolean`（未設定時 false）
- **UI**: `SuggestionBar` props = `{ suggestions: string[]; onSelect: (text: string) => void; disabled: boolean }`

### トレーサビリティ（要件）
- FR-001: AIによるサジェスト返答候補の生成 → Step 1, 2
- FR-002: サジェスト返答ボタンのUI表示 → Step 6, 7
- FR-003: サジェスト返答ボタンによる送信 → Step 7
- FR-004: シナリオ単位のON/OFF設定 → Step 3, 4, 5, 7
- FR-005: 国際化対応 → Step 8
- NFR全般（後方互換・型安全・レイテンシ・アクセシビリティ） → 全Step

---

## 生成ステップ

### Step 1: バックエンド - スコアリング出力モデルに suggestions 追加
- [x] `cdk/agents/realtime-scoring/models.py` の `ScoringResult` に `suggestions: List[str]` フィールドを追加
- [x] デフォルトは空リスト、件数の目安と用途を `description` に記載
- **対象**: `cdk/agents/realtime-scoring/models.py`
- **トレーサビリティ**: FR-001

### Step 2: バックエンド - スコアリングプロンプトに候補生成ルール追加
- [x] `cdk/agents/realtime-scoring/prompts.py` の `build_scoring_prompt` に、返答候補生成ルールを日本語・英語の両方に追記
- [x] ルール内容: NPCの直前発言と流れを踏まえた営業担当者の返答候補を3件程度、各候補は短文、多様な方向性（強気/共感/質問など）を持たせる
- [x] `handle_invocation` の戻り値 `result_dict.get('suggestions', [])` を返却レスポンスに含める
- **対象**: `cdk/agents/realtime-scoring/prompts.py`, `cdk/agents/realtime-scoring/agent.py`
- **トレーサビリティ**: FR-001

### Step 3: フロントエンド型定義 - シナリオに suggestionEnabled 追加
- [x] `frontend/src/types/api.ts` の `ScenarioInfo` に `suggestionEnabled?: boolean` を追加
- [x] `frontend/src/types/index.ts` の `Scenario` に `suggestionEnabled?: boolean` を追加
- **対象**: `frontend/src/types/api.ts`, `frontend/src/types/index.ts`
- **トレーサビリティ**: FR-004

### Step 4: バックエンド - シナリオLambdaに suggestionEnabled の保存処理追加
- [x] `cdk/lambda/scenarios/index.py` の `create_scenario` の `boolean_fields` に `suggestionEnabled` を追加（False値も保存）
- [x] `update_scenario` の `field_mappings` に `suggestionEnabled` を追加
- [x] `get_scenario`（詳細）はDynamoDBアイテムをフル返却するため `suggestionEnabled` も自動で返る（一覧は既存のenableAvatar同様に含めない＝既存パターン踏襲）
- **対象**: `cdk/lambda/scenarios/index.py`
- **トレーサビリティ**: FR-004

### Step 5: 初期データ - デモ対象シナリオに suggestionEnabled を付与
- [x] `cdk/data/scenarios.json` の「【デモ】AWSクラウド移行提案 - 初回商談」（id: aws-summit-demo）に `suggestionEnabled: true` を付与
- [x] maxTurns は既に 12 でデモ向けに短め。追加のデータ調整は不要と判断
- **対象**: `cdk/data/scenarios.json`
- **トレーサビリティ**: FR-004、ブース運用

### Step 6: フロントエンド - SuggestionBar コンポーネント新規作成
- [x] `frontend/src/components/conversation/SuggestionBar.tsx` を新規作成
- [x] props: `{ suggestions: string[]; onSelect: (text: string) => void; disabled: boolean }`
- [x] 候補が空または disabled 時は何も表示しない
- [x] 各候補をChipボタンで表示、`data-testid="suggestion-button-{index}"`、`aria-label` 付与、`role="group"`
- **対象**: `frontend/src/components/conversation/SuggestionBar.tsx`（新規）
- **トレーサビリティ**: FR-002, NFR-005

### Step 7: フロントエンド - サービス層とConversationPageへの統合
- [x] `frontend/src/services/AgentCoreService.ts` の `getRealtimeEvaluation` レスポンス型・内部型・戻り値に `suggestions?: string[]` を追加
- [x] `frontend/src/services/ApiService.ts` の `getRealtimeEvaluation` レスポンス型に `suggestions?: string[]` を追加し伝搬
- [x] `ConversationPage.tsx` に `suggestionEnabled` state + `suggestionEnabledRef` とシナリオ変換処理を追加
- [x] リアルタイム評価結果から `suggestions` を state に保持（suggestionEnabled有効時のみ）
- [x] `MessageInput` 直上に `SuggestionBar` を配置し、`onSelect={(text) => sendMessage(text)}`、`disabled={isProcessing || isSpeaking}`、`suggestionEnabled` が false の場合は非表示
- [x] 送信時に候補をクリア（`setSuggestions([])`）
- **対象**: `frontend/src/services/AgentCoreService.ts`, `frontend/src/services/ApiService.ts`, `frontend/src/pages/ConversationPage.tsx`
- **トレーサビリティ**: FR-002, FR-003, FR-004

### Step 8: i18n - 翻訳キー追加
- [x] `frontend/src/i18n/locales/ja.json` に `conversation.suggestion.label` / `conversation.suggestion.select` を追加
- [x] `frontend/src/i18n/locales/en.json` に同じキーを追加
- **対象**: `frontend/src/i18n/locales/ja.json`, `frontend/src/i18n/locales/en.json`
- **トレーサビリティ**: FR-005

### Step 9: 型チェック・リント
- [x] getDiagnostics で変更したフロントエンドファイルの型エラーを確認（新規エラーなし。既存エラー2件はindustry/ComplianceViolationで変更対象外）
- [x] `cd frontend && npm run lint` でリントエラー0件を確認
- [x] Pythonバックエンドの構文チェック実施（OK）
- **トレーサビリティ**: NFR-004

---

## 注意事項
- **後方互換**: `suggestions`/`suggestionEnabled` 未設定時も既存フローが正常動作すること
- **コスト**: `suggestionEnabled` が false のシナリオでは候補をUIに出さない
- **デモ専用実装をしない**: フラグはシナリオ設定として汎用化。デモ専用の分岐や別ルートは作らない
- **CDKビルド禁止**: `cd cdk && npm run build` は実行しない（custom_rules準拠）
- **AWS環境更新はCDKのみ**: 本ステージではコード変更のみ。デプロイは別途CDKコマンドで実施
- **コメントは日本語、変数名・関数名は英語**
- このプランが Code Generation の単一の信頼できる情報源（single source of truth）
