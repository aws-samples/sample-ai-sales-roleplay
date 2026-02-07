# Phase 3（拡張実装）コード生成プラン

## 概要
Phase 3の実装を以下のステップで実行する。

---

## Step 1: バックエンド - realtime-scoringにgestureフィールド追加
- [x] `cdk/agents/realtime-scoring/models.py` - `ScoringResult`に`gesture`フィールド追加（`nod`/`headTilt`/`none`）
- [x] `cdk/agents/realtime-scoring/prompts.py` - ジェスチャー推定プロンプト追加（日本語・英語）

**変更ファイル**: `models.py`, `prompts.py`

---

## Step 2: フロントエンド型定義 - gesture/アバター管理型追加
- [x] `frontend/src/types/avatar.ts` - `GestureType`型、`VRMAvatarContainerProps`に`gesture`追加、`AvatarUploadResponse`型追加
- [x] `frontend/src/types/avatar.ts` - `VRMAvatarProps`に`gesture`追加

**変更ファイル**: `avatar.ts`

---

## Step 3: AnimationController拡張 - ジェスチャー + アイドルモーション
- [x] `frontend/src/components/avatar/AnimationController.ts` - `triggerNod()`メソッド追加（headボーンX軸回転）
- [x] `frontend/src/components/avatar/AnimationController.ts` - `triggerHeadTilt()`メソッド追加（headボーンZ軸回転）
- [x] `frontend/src/components/avatar/AnimationController.ts` - 視線移動アイドルモーション追加（leftEye/rightEyeボーン）
- [x] `frontend/src/components/avatar/AnimationController.ts` - 体の揺れアイドルモーション追加（spineボーン）
- [x] `frontend/src/components/avatar/AnimationController.ts` - 発話中・ジェスチャー中のアイドルモーション抑制

**変更ファイル**: `AnimationController.ts`

---

## Step 4: ExpressionController拡張 - 感情トランジション高度化
- [x] `frontend/src/components/avatar/ExpressionController.ts` - 感情間の中間状態トランジション定義
- [x] `frontend/src/components/avatar/ExpressionController.ts` - 感情種類に応じたトランジション速度調整

**変更ファイル**: `ExpressionController.ts`

---

## Step 5: VRMAvatar/VRMAvatarContainer - gesture受け渡し + レスポンシブ
- [x] `frontend/src/components/avatar/VRMAvatar.tsx` - gestureプロパティ追加、AnimationControllerへのジェスチャートリガー
- [x] `frontend/src/components/avatar/VRMAvatarContainer.tsx` - gestureプロパティ追加、VRMAvatarへの受け渡し
- [x] `frontend/src/components/avatar/VRMAvatar.tsx` - レスポンシブ対応（コンテナリサイズ監視）

**変更ファイル**: `VRMAvatar.tsx`, `VRMAvatarContainer.tsx`

---

## Step 6: ConversationPage - gestureデータの受け渡し
- [x] `frontend/src/pages/ConversationPage.tsx` - `gesture`状態追加、リアルタイム評価レスポンスからgesture取得
- [x] `frontend/src/pages/ConversationPage.tsx` - VRMAvatarContainerにgesture渡し
- [x] `frontend/src/services/ApiService.ts` - リアルタイム評価レスポンス型にgesture追加
- [x] `frontend/src/services/AgentCoreService.ts` - invokeAgentCoreRuntime結果型にgesture追加、return objectにgesture追加

**変更ファイル**: `ConversationPage.tsx`, `ApiService.ts`, `AgentCoreService.ts`

---

## Step 7: CDKインフラ - アバターストレージ + API
- [x] `cdk/lib/constructs/storage/avatar-storage.ts` (新規) - S3バケット + DynamoDBテーブル
- [x] `cdk/lib/constructs/api/avatar-lambda.ts` (新規) - アバターCRUD Lambda構成
- [x] `cdk/lambda/avatars/index.py` (新規) - アバターCRUD Lambdaハンドラー
- [x] CDKスタックにアバターストレージ・API統合（`api.ts`, `api-gateway.ts`）

**変更ファイル**: 新規3ファイル + スタック更新2ファイル

---

## Step 8: フロントエンド - アバター管理UI
- [x] `frontend/src/components/avatar/AvatarUpload.tsx` (新規) - VRMアップロードコンポーネント
- [x] `frontend/src/components/avatar/AvatarManagement.tsx` (新規) - アバター管理画面
- [x] `frontend/src/services/AvatarService.ts` (新規) - アバターAPI呼び出しサービス

**変更ファイル**: 新規3ファイル

---

## Step 9: i18n - 新規翻訳キー追加
- [x] `frontend/src/i18n/locales/ja.json` - アバター管理関連の日本語キー追加
- [x] `frontend/src/i18n/locales/en.json` - アバター管理関連の英語キー追加

**変更ファイル**: `ja.json`, `en.json`

---

## Step 10: リント・型チェック
- [x] `getDiagnostics`で変更ファイルの型エラー確認 → エラーなし
- [x] `cd frontend && npm run lint` でリントエラー確認 → エラーなし

**確認対象**: 全変更ファイル

---

## 実装順序の理由
1. Step 1-2: バックエンド・型定義を先に確定（他のステップの基盤）
2. Step 3-4: コアアニメーションロジック（フロントエンドのみ、独立して動作確認可能）
3. Step 5-6: UI統合（Step 1-4の成果物を接続）
4. Step 7-8: アバター管理機能（独立した機能、他のステップと並行可能）
5. Step 9-10: 仕上げ（i18n、品質チェック）
