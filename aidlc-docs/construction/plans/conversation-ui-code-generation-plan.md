# コード生成計画 - 会話画面UI/UXリデザイン

## ユニット情報
- **ユニット名**: conversation-ui-redesign
- **スコープ**: 会話画面（ConversationPage）のみ
- **デザインリファレンス**: `aidlc-docs/inception/application-design/mock-v2/`
- **要件定義書**: `aidlc-docs/inception/requirements/requirements-conversation-ui.md`

## 依存関係
- 既存のAPIサービス層（変更なし）
- 既存のReact Context API（変更なし）
- 既存のVRMAvatarContainer（再配置のみ）
- 既存のVideoManager（再配置のみ）
- 既存のi18nフレームワーク（キー追加のみ）

## 実装ステップ

### Step 1: i18nキーの追加（日本語・英語）
- [x] 新規UIテキスト用のi18nキーを日本語・英語の翻訳ファイルに追加
  - メトリクスオーバーレイ関連キー
  - 右側パネル（ゴール・シナリオ・ペルソナ）関連キー
  - コーチングヒントバー関連キー
  - ヘッダーアクションボタンのaria-label
  - チャットログ展開/折りたたみ関連キー
  - セッション終了ボタン関連キー
- **対象ファイル**: `frontend/src/i18n/locales/ja.json`, `frontend/src/i18n/locales/en.json`（またはプロジェクトのi18nファイル構造に従う）

### Step 2: 新規コンポーネント作成 - MetricsOverlay
- [x] `frontend/src/components/conversation/MetricsOverlay.tsx` を新規作成
  - 半透明白背景 + backdrop-filter: blur のオーバーレイスタイル
  - 怒り（赤）・信頼（青）・進捗（緑）の3メトリクスをプログレスバーで表示
  - `role="progressbar"` + `aria-valuenow/min/max/label` 設定
  - CSS transition（0.5s ease）によるアニメーション
  - `prefers-reduced-motion` 対応
  - Props: `currentMetrics`, `prevMetrics`, `metricsUpdating`, `visible`
- **参照**: 既存 `MetricsPanel.tsx` のロジック、モックv2の `.metrics-overlay` スタイル

### Step 3: 新規コンポーネント作成 - ScenarioPanel
- [x] `frontend/src/components/conversation/ScenarioPanel.tsx` を新規作成
  - シナリオの説明文を表示
  - 半透明オーバーレイスタイル（MetricsOverlayと統一）
  - Props: `scenario`
- **参照**: モックv2の `.scenario-overlay`

### Step 4: 新規コンポーネント作成 - PersonaPanel
- [x] `frontend/src/components/conversation/PersonaPanel.tsx` を新規作成
  - NPC名、役職、アバターアイコンをヘッダーに表示
  - NPCのペルソナ説明文を全文表示
  - 半透明オーバーレイスタイル
  - Props: `npc` (Scenario['npc']型)
- **参照**: モックv2の `.persona-overlay`、既存 `NPCInfoCard.tsx` のデータ構造

### Step 5: 新規コンポーネント作成 - RightPanelContainer
- [x] `frontend/src/components/conversation/RightPanelContainer.tsx` を新規作成
  - GoalsPanel + ScenarioPanel + PersonaPanel を縦並びで配置
  - 縦スクロール可能なコンテナ
  - `visible` propで一括表示/非表示制御
  - 右側固定配置（position: absolute, right: 16px, top: 16px）
  - 最大幅 260-280px
  - Props: `visible`, `goals`, `goalStatuses`, `scenario`, `npc`
- **参照**: モックv2の `.right-panels`

### Step 6: 新規コンポーネント作成 - CoachingHintBar
- [x] `frontend/src/components/conversation/CoachingHintBar.tsx` を新規作成
  - 💡アイコン + テキストのコンパクトなバー形式
  - アクセントカラー背景
  - フェードインアニメーション
  - ヒントがない場合は非表示
  - `aria-live="polite"` でスクリーンリーダー通知
  - Props: `hint` (string | undefined)
- **参照**: モックv2の `.coaching-bar`

### Step 7: 新規コンポーネント作成 - AvatarStage
- [x] `frontend/src/components/conversation/AvatarStage.tsx` を新規作成
  - VRMAvatarContainerを中央大表示でラップ
  - NPC名ラベル（半透明背景）をアバター上に表示
  - 発話中サウンドウェーブインジケーター表示
  - VideoManagerをステージ隅に小さく配置
  - `flex: 1` で残りスペースを占有
  - Props: アバター関連props + VideoManager関連props + `npcName`, `isSpeaking`
- **参照**: モックv2の `.avatar-stage`

### Step 8: ConversationHeader の改修
- [x] `frontend/src/components/conversation/ConversationHeader.tsx` を改修
  - 戻るボタン（←）→ セッション終了確認モーダルトリガー
  - シナリオタイトル + 難易度バッジ表示
  - 「セッション終了」ボタンを常にヘッダーに表示（sessionStarted && !sessionEnded 条件を削除）
  - ヘッダー右側にアクションボタン群を追加:
    - 📋 右側パネル一括トグル
    - 📊 メトリクスパネルトグル
    - 🔊 音声設定モーダル
  - ターン数表示は維持
  - 新規Props追加: `onToggleRightPanels`, `onToggleMetrics`, `onOpenAudioSettings`, `rightPanelsVisible`, `metricsVisible`

### Step 9: ComplianceAlert の改修
- [x] `frontend/src/components/compliance/ComplianceAlert.tsx` を改修
  - Snackbar（画面上部中央）→ ヘッダー下スライドインバナーに変更
  - 重大度に応じた色分け（high=赤、medium=黄、low=青）
  - 重大度ラベル + メッセージ + 閉じるボタン
  - スライドダウンアニメーション
  - 8秒後に自動非表示（既存のautoHideDuration維持）
  - `role="alert"` 設定

### Step 10: ConversationPage.tsx の全面改修
- [x] レイアウト構造の全面変更
  - **削除**: SidebarPanel, NPCInfoCard, EmojiFeedbackContainer のインポートと使用箇所
  - **新レイアウト構造**:
    ```
    Container (fullscreen, flex column)
    ├── ConversationHeader（改修版）
    ├── ComplianceAlert（ヘッダー下スライドイン）
    ├── conv-main (flex: 1, position: relative)
    │   ├── MetricsOverlay（左上、position: absolute）
    │   ├── RightPanelContainer（右側、position: absolute）
    │   ├── AvatarStage（中央、flex: 1）
    │   └── ChatLog（下部、max-height: 150px、展開可能）
    ├── CoachingHintBar（入力エリア上部）
    └── MessageInput（下部固定）
    ```
  - **新規state変数追加**:
    - `rightPanelsVisible: boolean` (デフォルト: true)
    - `metricsVisible: boolean` (デフォルト: true)
    - `chatLogExpanded: boolean` (デフォルト: false)
    - `showAudioSettings: boolean` (デフォルト: false)
  - **既存state活用**: `currentMetrics.analysis` → CoachingHintBarのhintに使用
  - **チャットログ**: MessageListをコンパクト化（max-height: 150px + クリック展開）
  - **音声設定**: AudioSettingsPanelをモーダルダイアログとして表示

### Step 11: 音声設定モーダルの実装
- [x] ConversationPage内に音声設定モーダル（Dialog）を追加
  - 既存のAudioSettingsPanelコンポーネントをDialog内に配置
  - 🔊ボタンで開閉
  - Props: 既存のaudio関連state（audioEnabled, audioVolume, speechRate, silenceThreshold）

### Step 12: リント・型チェック
- [x] `getDiagnostics` で変更ファイルの型エラー・リントエラーを確認
- [x] エラーがあれば修正
- [x] 全変更ファイルのエラー0件を確認

## コンポーネント依存関係

```
ConversationPage.tsx
├── ConversationHeader（改修）
│   └── ヘッダーアクションボタン群（新規）
├── ComplianceAlert（改修：ヘッダー下スライドイン）
├── MetricsOverlay（新規）
├── RightPanelContainer（新規）
│   ├── GoalsPanel（既存再利用・スタイル調整）
│   ├── ScenarioPanel（新規）
│   └── PersonaPanel（新規）
├── AvatarStage（新規）
│   ├── VRMAvatarContainer（既存再配置）
│   └── VideoManager（既存再配置）
├── MessageList（既存・コンパクト化）
├── CoachingHintBar（新規）
├── MessageInput（既存・変更なし）
└── AudioSettingsPanel（既存・モーダル化）
```

## 削除対象
- `SidebarPanel` のインポートと使用（ConversationPage.tsxから）
- `NPCInfoCard` のインポートと使用（ConversationPage.tsxから）
- `EmojiFeedbackContainer` 関連のインポートと使用（存在する場合）

## 品質基準
- リントエラー: 0件
- 型エラー: 0件
- アクセシビリティ: NFR-2準拠（aria属性、role属性、prefers-reduced-motion）
- 国際化: NFR-4準拠（全テキストi18nキー化、日英対応）
- パフォーマンス: NFR-1準拠（CSS transition、useMemo/useCallback適切使用）
