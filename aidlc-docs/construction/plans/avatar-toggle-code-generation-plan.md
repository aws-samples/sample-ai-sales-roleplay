# Code Generation Plan - アバター表示On/Off機能

## 概要
シナリオごとに3Dアバター表示をOn/Offできる機能を実装する。

## 実装ステップ

### Step 1: バックエンド - Lambda scenarios/index.py
- [x] シナリオ作成APIの`optional_fields`に`enableAvatar`を追加
- [x] シナリオ更新APIの`field_mappings`に`enableAvatar`を追加
- [x] `enableAvatar`はboolean型、DynamoDBにそのまま保存

### Step 2: フロントエンド型定義
- [x] `frontend/src/types/api.ts` - `ScenarioInfo`に`enableAvatar?: boolean`追加
- [x] `frontend/src/types/index.ts` - `Scenario`に`enableAvatar?: boolean`追加
- [x] `frontend/src/types/components.ts` - `NPCInfoStepProps`に`enableAvatar`と`onEnableAvatarChange`追加

### Step 3: NPCInfoStep - アバターOn/Offトグル追加
- [x] `frontend/src/pages/scenarios/creation/NPCInfoStep.tsx`にトグルスイッチ追加
- [x] VRMアバターアップロードUIをトグル状態で条件表示
- [x] aria-label設定（アクセシビリティ対応）

### Step 4: ScenarioCreatePage - enableAvatar状態管理
- [x] `frontend/src/pages/scenarios/ScenarioCreatePage.tsx`に`enableAvatar` state追加（デフォルト: true）
- [x] NPCInfoStepに`enableAvatar`と`onEnableAvatarChange`を渡す
- [x] シナリオ作成APIリクエストに`enableAvatar`を含める

### Step 5: ScenarioEditPage - enableAvatar状態管理
- [x] `frontend/src/pages/scenarios/ScenarioEditPage.tsx`に`enableAvatar` state追加
- [x] シナリオ読み込み時に`enableAvatar`値を復元（未設定時はfalse）
- [x] NPCInfoStepに`enableAvatar`と`onEnableAvatarChange`を渡す
- [x] シナリオ更新APIリクエストに`enableAvatar`を含める
- [x] enableAvatarがfalseの場合、avatarFile/existingAvatarFileNameをクリア

### Step 6: ConversationPage - アバター表示条件分岐
- [x] `frontend/src/pages/ConversationPage.tsx`に`enableAvatar` state追加
- [x] シナリオ取得時に`enableAvatar`値を読み込み（未設定時はfalse）
- [x] `enableAvatar`がfalseの場合、AvatarProvider/AvatarStageブロックを非表示
- [x] アバター非表示時のチャットログレイアウト調整（maxHeight制限解除）

### Step 7: i18n - 翻訳キー追加
- [x] `frontend/src/i18n/locales/ja.json` - アバター表示トグルの日本語キー追加
- [x] `frontend/src/i18n/locales/en.json` - アバター表示トグルの英語キー追加

### Step 8: リント・型チェック
- [x] getDiagnosticsで変更ファイルの型エラー確認
- [x] リントエラー確認・修正
