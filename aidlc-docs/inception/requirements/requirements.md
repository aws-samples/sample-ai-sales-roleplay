# アバター表示On/Off機能 - 要件定義書

## 1. Intent Analysis

- **ユーザーリクエスト**: アバターの機能を実装済みだが、シナリオごとにOn/Offできるようにしたい
- **リクエストタイプ**: Enhancement（既存機能の拡張）
- **スコープ**: Multiple Components（DynamoDB、Lambda、フロントエンドUI、ConversationPage）
- **複雑度**: Simple（既存データモデルにフラグ追加、条件分岐追加）

## 2. 機能要件

### FR-001: シナリオデータモデルへのアバター有効フラグ追加
- シナリオデータに `enableAvatar` (boolean) フィールドを追加する
- デフォルト値は `true`（アバター表示ON）
- 既存シナリオは `enableAvatar` 未設定の場合 `false` として扱う（既存シナリオはアバターOFF）

### FR-002: シナリオ作成画面でのアバターOn/Off設定
- シナリオ作成画面のNPC設定セクション内にトグルスイッチを追加する
- トグルスイッチのデフォルト値はON
- アバターOFF時はVRMファイルアップロードUIを非表示にする
- アバターON時はVRMファイルアップロードUIを表示する（既存動作）

### FR-003: シナリオ編集画面でのアバターOn/Off設定
- シナリオ編集画面のNPC設定セクション内にトグルスイッチを追加する
- 既存シナリオの `enableAvatar` 値を読み込んで反映する
- アバターOFF時はVRMファイルアップロードUIを非表示にする
- アバターON時はVRMファイルアップロードUIを表示する

### FR-004: 会話画面でのアバター表示制御
- シナリオの `enableAvatar` が `false` の場合、AvatarStageコンポーネントを非表示にする
- アバター非表示時はチャットログエリアを広く使用する（レイアウト調整）
- AvatarProviderの不要なマウントを避け、パフォーマンスを最適化する

### FR-005: バックエンドAPI対応
- シナリオ作成API（POST /scenarios）で `enableAvatar` フィールドを受け付ける
- シナリオ更新API（PUT /scenarios/{scenarioId}）で `enableAvatar` フィールドを更新可能にする
- シナリオ取得API（GET /scenarios/{scenarioId}）で `enableAvatar` フィールドを返却する

## 3. 非機能要件

### NFR-001: 後方互換性
- `enableAvatar` フィールドが未設定の既存シナリオは `false`（OFF）として動作する
- 既存のAPIレスポンスに影響を与えない

### NFR-002: アクセシビリティ
- トグルスイッチにはaria-labelを設定する
- アバター表示/非表示の状態変化をスクリーンリーダーに通知する

### NFR-003: 国際化
- トグルスイッチのラベルは日本語・英語の両方に対応する（i18nキー使用）

### NFR-004: パフォーマンス
- アバターOFF時はVRMモデルのロードを行わない
- AvatarProvider/VRMAvatarContainerの不要なマウントを回避する

## 4. 影響範囲

### バックエンド
- `cdk/lambda/scenarios/index.py` - シナリオCRUD APIに `enableAvatar` フィールド追加

### フロントエンド
- `frontend/src/types/api.ts` - ScenarioInfo型に `enableAvatar` 追加
- `frontend/src/types/index.ts` - Scenario型に `enableAvatar` 追加
- `frontend/src/pages/scenarios/ScenarioCreatePage.tsx` - トグルスイッチ追加、VRMアップロードUI条件表示
- `frontend/src/pages/scenarios/ScenarioEditPage.tsx` - トグルスイッチ追加、VRMアップロードUI条件表示
- `frontend/src/pages/ConversationPage.tsx` - アバター表示条件分岐、レイアウト調整
- `frontend/src/i18n/locales/ja.json` - 日本語翻訳キー追加
- `frontend/src/i18n/locales/en.json` - 英語翻訳キー追加

## 5. UI設計概要

### シナリオ作成・編集画面（NPC設定セクション内）
```
NPC設定
├── 名前: [入力フィールド]
├── 役職: [入力フィールド]
├── ...
├── 3Dアバター表示: [トグルスイッチ ON/OFF]
│   └── (ONの場合のみ表示)
│       └── VRMファイル: [アップロードUI]
└── 音声モデル: [ドロップダウン]
```

### 会話画面
```
アバターON時:
┌─────────────────────────┐
│ ヘッダー                 │
├─────────────────────────┤
│ [AvatarStage]           │
│ (3Dアバター表示)         │
├─────────────────────────┤
│ [チャットログ]           │
├─────────────────────────┤
│ [入力エリア]             │
└─────────────────────────┘

アバターOFF時:
┌─────────────────────────┐
│ ヘッダー                 │
├─────────────────────────┤
│                         │
│ [チャットログ]           │
│ (広いエリア)             │
│                         │
├─────────────────────────┤
│ [入力エリア]             │
└─────────────────────────┘
```
