# Code Generation Plan - 3Dアバター機能

## 1. 概要

本計画では、3Dアバター機能のコード生成手順を定義します。

## 2. 生成ファイル一覧

### 2.1 新規ファイル（優先度順）

| # | ファイル | 説明 | 依存関係 |
|---|----------|------|----------|
| 1 | `types/avatar.ts` | アバター関連の型定義 | なし |
| 2 | `components/avatar/VRMLoader.ts` | VRMファイルローダー | types/avatar.ts |
| 3 | `components/avatar/ExpressionController.ts` | 表情制御 | types/avatar.ts |
| 4 | `components/avatar/LipSyncController.ts` | リップシンク制御 | AudioService |
| 5 | `components/avatar/AnimationController.ts` | アニメーション制御 | なし |
| 6 | `components/avatar/AvatarContext.tsx` | アバターContext | types/avatar.ts |
| 7 | `components/avatar/VRMAvatar.tsx` | VRMレンダリング | 2-5 |
| 8 | `components/avatar/VRMAvatarContainer.tsx` | コンテナ | 6, 7 |
| 9 | `components/avatar/AvatarSelector.tsx` | アバター選択UI | 6 |
| 10 | `components/avatar/AvatarThumbnail.tsx` | サムネイル表示 | なし |
| 11 | `components/avatar/index.ts` | エクスポート | 全て |
| 12 | `public/models/avatars/manifest.json` | アバターマニフェスト | なし |

### 2.2 変更ファイル

| # | ファイル | 変更内容 |
|---|----------|----------|
| 13 | `types/api.ts` | ScenarioInfoにavatarIdを追加 |
| 14 | `pages/ConversationPage.tsx` | EmojiFeedbackContainer → VRMAvatarContainer |

### 2.3 バックエンド変更（CDK経由）

| # | ファイル | 変更内容 |
|---|----------|----------|
| 15 | `cdk/lambda/scenarios/` | avatarIdフィールドの追加 |

---

## 3. 実装順序

### Phase 1: 基盤（型定義・ローダー）
- [x] Step 1.1: types/avatar.ts を作成
- [x] Step 1.2: VRMLoader.ts を作成
- [x] Step 1.3: manifest.json を作成

### Phase 2: コントローラー
- [x] Step 2.1: ExpressionController.ts を作成
- [x] Step 2.2: LipSyncController.ts を作成
- [x] Step 2.3: AnimationController.ts を作成

### Phase 3: Reactコンポーネント
- [x] Step 3.1: AvatarContext.tsx を作成
- [x] Step 3.2: VRMAvatar.tsx を作成
- [x] Step 3.3: VRMAvatarContainer.tsx を作成
- [x] Step 3.4: AvatarSelector.tsx を作成
- [x] Step 3.5: AvatarThumbnail.tsx を作成
- [x] Step 3.6: index.ts を作成

### Phase 4: 統合
- [x] Step 4.1: types/api.ts を変更（avatarId追加）
- [x] Step 4.2: ConversationPage.tsx を変更

### Phase 5: パッケージ
- [x] Step 5.1: three, @pixiv/three-vrm をインストール

---

## 4. 依存ライブラリ

```json
{
  "three": "^0.182.0",
  "@pixiv/three-vrm": "^3.4.5",
  "@types/three": "^0.182.0"
}
```

---

## 5. 実装詳細

### Step 1.1: types/avatar.ts

アバター関連の型定義を作成。既存のEmotionState型を使用し、VRM表情へのマッピングを定義。

### Step 1.2: VRMLoader.ts

GLTFLoader + VRMLoaderPluginを使用してVRMファイルを非同期ロード。進捗コールバックとエラーハンドリングを実装。

### Step 1.3: manifest.json

デフォルトアバターの定義。初期実装では1つのアバターのみ。

### Step 2.1: ExpressionController.ts

EmotionStateからVRM表情へのマッピングを実装。表情のスムーズなトランジションを実現。

### Step 2.2: LipSyncController.ts

Phase 1では音量ベースのリップシンクを実装。AudioService.getInstance()から音声要素を取得。

### Step 2.3: AnimationController.ts

瞬きと呼吸のプロシージャルアニメーションを実装。

### Step 3.1: AvatarContext.tsx

最小限の状態管理（currentAvatarId, avatarInfo, isLoading, error）。

### Step 3.2: VRMAvatar.tsx

Three.jsシーンの管理とVRMモデルのレンダリング。30fps目標。

### Step 3.3: VRMAvatarContainer.tsx

EmojiFeedbackContainerと同等のpropsインターフェース。WebGLチェックとエラー表示。

### Step 3.4: AvatarSelector.tsx

シナリオ管理画面でのアバター選択UI。

### Step 3.5: AvatarThumbnail.tsx

S3サムネイル画像の表示。

### Step 4.1: types/api.ts変更

ScenarioInfoにavatarId?: stringを追加。

### Step 4.2: ConversationPage.tsx変更

EmojiFeedbackContainerをVRMAvatarContainerに置き換え。AvatarProviderでラップ。

---

## 6. 承認

上記の計画で実装を開始してよろしいですか？

1. **変更を依頼** - 計画の修正
2. **実装を開始** - コード生成を開始
