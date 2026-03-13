# コンポーネント依存関係 - 3Dアバター機能

## 1. 概要

本ドキュメントでは、3Dアバター機能のコンポーネント間の依存関係とデータフローを記述します。

### 1.1 既存システムとの整合性

本設計は既存の`EmojiFeedbackContainer`と同じインターフェースを維持し、段階的な移行を可能にします。

---

## 2. 依存関係図

```
┌─────────────────────────────────────────────────────────────────┐
│                        ConversationPage                          │
│  (会話画面 - AvatarProviderでラップ)                              │
│  パス: frontend/src/pages/ConversationPage.tsx                   │
│  管理する状態: isSpeaking, currentEmotion, currentMetrics        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ props: avatarId, angerLevel, trustLevel,
                                │        progressLevel, isSpeaking, onEmotionChange
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VRMAvatarContainer                          │
│  パス: frontend/src/components/avatar/VRMAvatarContainer.tsx     │
│  - WebGLサポートチェック                                          │
│  - エラー表示                                                     │
│  - 発話インジケーター                                             │
│  - 既存EmojiFeedbackContainerと同じpropsインターフェース          │
│  - メトリクスから感情を計算してonEmotionChangeで通知              │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌───────────┐   ┌─────────────┐   ┌─────────────┐
        │ VRMAvatar │   │AvatarContext│   │AvatarService│
        │ (3D描画)  │   │(アバター情報)│   │ (データ取得)│
        └───────────┘   └─────────────┘   └─────────────┘
                │               │
    ┌───────────┼───────────┬───┴───────┐
    ▼           ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│VRMLoader│ │Expression│ │LipSync  │ │Animation│
│         │ │Controller│ │Controller│ │Controller│
└─────────┘ └─────────┘ └─────────┘ └─────────┘
                              │
                              ▼
                        ┌─────────────┐
                        │AudioService │
                        │(音声要素取得)│
                        └─────────────┘
```

**注意**: 
- `isSpeaking`, `currentEmotion`, `currentMetrics`はConversationPageで管理（既存のまま）
- AvatarContextはアバター情報（avatarInfo, isLoading, error）のみを管理
- LipSyncControllerはAudioServiceから直接音声要素を取得

---

## 3. 依存関係マトリクス

| コンポーネント | パス | 依存先 |
|---------------|------|--------|
| ConversationPage | `pages/ConversationPage.tsx` | VRMAvatarContainer, AvatarProvider |
| VRMAvatarContainer | `components/avatar/VRMAvatarContainer.tsx` | VRMAvatar, AvatarContext, calculateEmotionState |
| VRMAvatar | `components/avatar/VRMAvatar.tsx` | VRMLoader, ExpressionController, LipSyncController, AnimationController |
| VRMLoader | `components/avatar/VRMLoader.ts` | three, @pixiv/three-vrm |
| ExpressionController | `components/avatar/ExpressionController.ts` | VRM (three-vrm), EmotionState (types/index.ts) |
| LipSyncController | `components/avatar/LipSyncController.ts` | VRM (three-vrm), Web Audio API, AudioService |
| AnimationController | `components/avatar/AnimationController.ts` | VRM (three-vrm) |
| AvatarContext | `components/avatar/AvatarContext.tsx` | AvatarService |
| AvatarService | `services/AvatarService.ts` | AvatarInfo (types/avatar.ts) |
| AvatarSelector | `components/avatar/AvatarSelector.tsx` | AvatarService, AvatarThumbnail |
| AvatarThumbnail | `components/avatar/AvatarThumbnail.tsx` | - (S3画像表示のみ) |

---

## 4. データフロー

### 4.1 アバターロードフロー

1. ConversationPageがシナリオデータからavatarIdを取得
2. VRMAvatarContainerにavatarIdをpropsで渡す
3. VRMAvatarContainerがAvatarContext.loadAvatarを呼び出し
4. AvatarServiceがアバター情報（モデルURL含む）を取得
5. AvatarContextの状態が更新（avatarInfo, isLoading）
6. VRMAvatarがVRMLoaderを使用してモデルをロード
7. ロード完了後、各コントローラーを初期化
8. レンダリングループ開始

### 4.2 感情更新フロー

1. AgentCoreServiceがNPC応答とスコア情報を返却
2. ConversationPageがcurrentMetricsを更新
3. VRMAvatarContainerがprops（angerLevel, trustLevel, progressLevel）の変更を検知
4. calculateEmotionState関数で感情を計算
5. onEmotionChangeコールバックでConversationPageに通知
6. VRMAvatarがemotionプロパティの変更を検知
7. ExpressionControllerが表情をスムーズに変更

### 4.3 リップシンクフロー（Phase 1: 音量ベース）

1. PollyServiceが音声URLを返却
2. AudioServiceが音声を再生
3. ConversationPageがisSpeaking=trueに設定
4. VRMAvatarContainerがisSpeaking=trueを受け取る
5. LipSyncControllerがAudioService.getInstance()から音声要素を取得
6. LipSyncControllerがWeb Audio APIで音量を分析
7. 音量に応じて口の開き具合を更新
8. 音声再生終了時、ConversationPageがisSpeaking=falseに設定
9. LipSyncControllerが接続を解除

> **⚠️ 実装時の注意**: 
> 現在のAudioService.tsには`getCurrentAudioElement()`メソッドが未実装です。
> 実装フェーズでAudioServiceに以下の拡張が必要です：
> - `currentAudioElement`プロパティの追加（または既存のaudioQueueから取得）
> - `getCurrentAudioElement()`メソッドの追加
> 詳細は`services.md`の「3.3 AudioService拡張」を参照してください。

### 4.4 リップシンクフロー（Phase 2: Visemeベース）

1. PollyServiceが音声URLとVisemeデータを返却
2. LipSyncControllerにVisemeデータを設定
3. 音声再生開始
4. LipSyncControllerが現在の再生時刻に対応するVisemeを検索
5. 対応する口形状（aa, ih, ou, ee, oh）を設定
6. 音声再生終了時にVisemeデータをクリア

---

## 5. 外部ライブラリ依存

| ライブラリ | バージョン | 使用コンポーネント | 用途 |
|-----------|-----------|-------------------|------|
| three | ^0.182.0 | VRMAvatar, VRMLoader, AvatarThumbnail | 3Dレンダリング |
| @pixiv/three-vrm | ^3.4.5 | VRMLoader, ExpressionController, LipSyncController, AnimationController | VRMモデル制御 |

---

## 6. 通信パターン

### 6.1 コンポーネント間通信

| 通信元 | 通信先 | 方式 | データ |
|--------|--------|------|--------|
| ConversationPage | VRMAvatarContainer | Props | avatarId, angerLevel, trustLevel, progressLevel, isSpeaking |
| VRMAvatarContainer | ConversationPage | Callback | onEmotionChange(emotion) |
| VRMAvatarContainer | AvatarContext | Context API | loadAvatar(avatarId) |
| AvatarContext | VRMAvatarContainer | Context購読 | avatarInfo, isLoading, error |
| VRMAvatarContainer | VRMAvatar | Props | モデルURL、感情 |
| VRMAvatar | 各Controller | メソッド呼び出し | 状態更新 |
| LipSyncController | AudioService | getInstance() | 音声要素取得 |

### 6.2 サービス間通信

| 通信元 | 通信先 | 方式 | データ |
|--------|--------|------|--------|
| AvatarService | manifest.json | fetch | アバター情報（初期実装） |
| AvatarService | ApiService | HTTP (将来) | アバター情報（将来のAPI化時） |
| PollyService | バックエンドAPI | HTTP | 音声URL、Visemeデータ（Phase 2） |
| AgentCoreService | バックエンドAPI | HTTP | NPC応答、スコア情報 |

> **⚠️ 実装依存関係**:
> - LipSyncController → AudioService: `getCurrentAudioElement()`メソッドの実装が必要（services.md参照）
> - Phase 2のVisemeデータ取得: PollyServiceの`synthesizeSpeechWithViseme()`メソッドとバックエンドLambda関数の拡張が必要

---

## 7. 置き換え対象

### 7.1 EmojiFeedbackContainer → VRMAvatarContainer

**現在の構造**:
```
ConversationPage
  └── EmojiFeedbackContainer (components/conversation/)
        └── EmojiFeedback (components/)
```

**変更後の構造**:
```
ConversationPage (isSpeaking, currentEmotion, currentMetrics管理)
  └── AvatarProvider (components/avatar/)
        └── VRMAvatarContainer (components/avatar/)
              │  props: avatarId, angerLevel, trustLevel, progressLevel, isSpeaking, onEmotionChange
              └── VRMAvatar (components/avatar/)
```

**propsインターフェースの互換性**:

既存の`EmojiFeedbackContainer`と同じpropsを維持し、段階的な移行を可能にします：

```typescript
// 既存（EmojiFeedbackContainer）
interface EmojiFeedbackContainerProps {
  angerLevel: number;
  trustLevel: number;
  progressLevel: number;
  isSpeaking: boolean;
  onEmotionChange: (emotion: EmotionState) => void;
}

// 新規（VRMAvatarContainer）- 同じインターフェース + avatarId
interface VRMAvatarContainerProps {
  angerLevel: number;
  trustLevel: number;
  progressLevel: number;
  isSpeaking: boolean;
  onEmotionChange: (emotion: EmotionState) => void;  // 既存互換
  avatarId?: string;  // 新規追加
}
```

**変更点**:
- `EmojiFeedbackContainer`を`VRMAvatarContainer`に置き換え
- `AvatarProvider`で`ConversationPage`をラップ
- `onEmotionChange`コールバックは既存互換のため維持
- `avatarId`はシナリオから取得（未設定時はデフォルト）

### 7.2 シナリオ管理画面の変更

**追加コンポーネント**:
- `AvatarSelector`: シナリオ作成/編集画面に追加
- `AvatarThumbnail`: `AvatarSelector`内で使用

**変更対象ファイル**:
- `frontend/src/pages/scenarios/ScenarioCreatePage.tsx`
- `frontend/src/pages/scenarios/ScenarioEditPage.tsx`
- `frontend/src/pages/scenarios/creation/` 配下のステップコンポーネント

**データモデル変更**:
- `ScenarioInfo`インターフェース（`types/api.ts`）に`avatarId`フィールドを追加
- `formData`に`avatarId`フィールドを追加

---

## 8. アクセシビリティ考慮

### 8.1 prefers-reduced-motion対応

`AnimationController`は`prefers-reduced-motion`メディアクエリを確認し、ユーザーがモーション軽減を設定している場合は瞬きと呼吸のアニメーションを無効化する。

```typescript
// AnimationController内での実装例
private checkReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

### 8.2 フォールバック

WebGL非対応環境では、3Dアバターの代わりにエラーメッセージを表示する。

```tsx
// VRMAvatarContainer内でのフォールバック
if (!isWebGLSupported) {
  return (
    <Box role="alert" aria-live="polite">
      <Typography>
        {t('conversation.avatar.webglNotSupported')}
      </Typography>
    </Box>
  );
}
```

### 8.3 発話状態の通知

発話中は`aria-live`領域を使用して状態変化を通知する。視覚的なインジケーター（スピーカーアイコン）も表示する。

```tsx
{isSpeaking && (
  <Box
    role="status"
    aria-live="polite"
    aria-label={t('conversation.avatar.speaking')}
  >
    <VolumeUpIcon />
  </Box>
)}
```

### 8.4 キーボードアクセシビリティ

`AvatarSelector`コンポーネントはキーボード操作に対応：
- Tab: アバター間のフォーカス移動
- Enter/Space: アバター選択
- 矢印キー: グリッド内のナビゲーション
