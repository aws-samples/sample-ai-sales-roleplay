# コンポーネント定義 - 3Dアバター機能

## 1. 概要

本ドキュメントでは、3Dアバター機能を実現するためのコンポーネント定義を記述します。

### 1.1 既存システムとの整合性

本設計は既存システムとの整合性を考慮し、以下の点を反映しています：

| 項目 | 既存実装 | 本設計での対応 |
|------|----------|----------------|
| 感情状態の型 | `EmotionState` (angry, annoyed, neutral, satisfied, happy) | 既存の`EmotionState`を使用し、VRM表情へのマッピングレイヤーを追加 |
| コンテナの配置 | `components/conversation/` | 同じディレクトリ構造を踏襲 |
| Context管理 | contextsディレクトリなし | `components/avatar/`内にContext定義を配置 |
| メトリクス範囲 | 0-10 | 同一（変更なし） |

---

## 2. 新規コンポーネント

### 2.1 VRMAvatar

**パス**: `frontend/src/components/avatar/VRMAvatar.tsx`

**責務**:
- VRMモデルの3Dレンダリング
- Three.jsシーンの管理
- レンダリングループの制御

**プロパティ**:
- modelUrl: VRMモデルのURL
- emotion: 現在の感情状態（既存のEmotionState型を使用）
- isSpeaking: 発話中フラグ
- onLoad: ロード完了コールバック（オプション）
- onError: エラーコールバック（オプション）

**依存関係**:
- VRMLoader
- ExpressionController
- LipSyncController
- AnimationController

---

### 2.2 VRMAvatarContainer

**パス**: `frontend/src/components/avatar/VRMAvatarContainer.tsx`

**責務**:
- VRMAvatarのラッパーコンポーネント
- AvatarContextとの連携（アバター情報取得のみ）
- WebGL対応チェックとフォールバック表示
- 発話インジケーターの表示

**プロパティ**（EmojiFeedbackContainerと同等のインターフェース）:
- avatarId: アバターID
- angerLevel: 怒りレベル（0-10）
- trustLevel: 信頼度（0-10）
- progressLevel: 進捗度（0-10）
- isSpeaking: 発話中フラグ
- onEmotionChange: 感情変化コールバック

**Contextから取得**:
- avatarInfo: アバター情報（モデルURL含む）
- isLoading: ローディング状態
- error: エラー情報

**設計理由**:
既存のConversationPageで`isSpeaking`、`currentMetrics`、`currentEmotion`が管理されているため、二重管理を避けるために親コンポーネントからプロパティとして受け取る方式を採用。

**依存関係**:
- VRMAvatar
- AvatarContext（アバター情報のみ）
- AudioService（リップシンク用音声要素取得）

---

### 2.3 VRMLoader

**パス**: `frontend/src/components/avatar/VRMLoader.ts`

**責務**:
- VRMファイルの非同期ロード
- GLTFLoader + VRMLoaderPluginの管理
- ロード進捗の通知

**メソッド**:
- constructor: GLTFLoader + VRMLoaderPlugin初期化
- load: VRMファイルを非同期ロード（URL, 進捗コールバック）→ VRMインスタンス
- dispose: リソース解放

**依存関係**:
- three (GLTFLoader)
- @pixiv/three-vrm (VRMLoaderPlugin)

---

### 2.4 ExpressionController

**パス**: `frontend/src/components/avatar/ExpressionController.ts`

**責務**:
- VRM表情プリセットの制御
- 感情状態から表情へのマッピング
- 表情トランジションのスムージング

**メソッド**:
- constructor: VRMインスタンスを受け取り初期化
- setEmotion: 感情状態と強度を設定
- update: 毎フレーム呼び出し、表情をスムーズにトランジション
- dispose: リソース解放

**感情マッピング（既存EmotionStateからVRM表情へ）**:

既存システムの`EmotionState`型をVRMの表情プリセットにマッピングします：

| EmotionState（既存） | VRM Expression | 強度 | 備考 |
|---------------------|----------------|------|------|
| happy | happy | 0.8 | 満足・成功時 |
| satisfied | relaxed | 0.6 | 穏やかな満足 |
| neutral | neutral | 0.0 | 通常状態 |
| annoyed | angry | 0.4 | 軽度の不満 |
| angry | angry | 0.8 | 強い不満・怒り |

**注意**: VRMの`sad`と`relaxed`は既存の`EmotionState`に直接対応するものがないため、`satisfied`を`relaxed`にマッピングしています。

---

### 2.5 LipSyncController

**パス**: `frontend/src/components/avatar/LipSyncController.ts`

**責務**:
- 音声からの口形状制御
- Phase 1: 音量ベースのリップシンク
- Phase 2: Visemeベースの母音リップシンク

**メソッド**:
- constructor: VRMインスタンスを受け取り初期化
- connectToAudioService: AudioServiceから音声要素を取得して接続（Phase 1: 音量ベース）
- setVisemeData: Visemeデータを設定（Phase 2）
- update: 毎フレーム呼び出し、口形状を更新
- disconnect: 音声接続を解除
- dispose: リソース解放

**音声要素の取得方法**:
```typescript
// AudioServiceから直接取得（Contextを経由しない）
const audioService = AudioService.getInstance();
const audioElement = audioService.getCurrentAudioElement();
```

**口形状マッピング（Phase 2）**:
| Polly Viseme | VRM BlendShape | 日本語母音 |
|--------------|----------------|-----------|
| a | aa | あ |
| i | ih | い |
| u | ou | う |
| e | ee | え |
| o | oh | お |

---

### 2.6 AnimationController

**パス**: `frontend/src/components/avatar/AnimationController.ts`

**責務**:
- 瞬きアニメーションの制御
- 微細な体の揺れ（呼吸）の制御
- プロシージャルアニメーションの管理

**メソッド**:
- constructor: VRMインスタンスを受け取り初期化
- startIdleAnimations: 待機アニメーション開始
- stopIdleAnimations: 待機アニメーション停止
- update: 毎フレーム呼び出し、アニメーション更新
- dispose: リソース解放

**アニメーションパラメータ**:
- 瞬き間隔: 2-6秒（ランダム）
- 瞬き時間: 0.1秒
- 呼吸周期: 4秒
- 呼吸振幅: 微小（Y軸 ±0.5%）

---

### 2.7 AvatarContext

**パス**: `frontend/src/components/avatar/AvatarContext.tsx`

**注意**: 既存プロジェクトには`contexts/`ディレクトリが存在しないため、`components/avatar/`内にContextを配置します。

**責務**:
- アバター情報の一元管理（アバター固有の状態のみ）
- アバター情報のキャッシュ
- ローディング・エラー状態の管理

**状態**（最小限に限定）:
- currentAvatarId: 現在のアバターID
- avatarInfo: アバター情報（モデルURL等）
- isLoading: ローディング状態
- error: エラー情報

**提供メソッド**:
- loadAvatar: アバターをロード

**設計理由**:
既存のConversationPageで以下の状態が管理されているため、AvatarContextでは管理しない：
- `isSpeaking`: ConversationPageで管理（AudioServiceと連動）
- `currentEmotion`: ConversationPageで管理（EmojiFeedbackから通知）
- `currentMetrics`: ConversationPageで管理（APIから取得）
- `audioElement`: AudioService.getInstance()から取得

これにより二重管理を避け、既存のデータフローを維持する。

---

### 2.8 AvatarSelector

**パス**: `frontend/src/components/avatar/AvatarSelector.tsx`

**責務**:
- シナリオ管理画面でのアバター選択UI
- アバター一覧の表示（サムネイル付き）
- 選択されたアバターのプレビュー

**プロパティ**:
- selectedAvatarId: 選択中のアバターID（オプション）
- onSelect: 選択時のコールバック
- disabled: 無効状態（オプション）

---

### 2.9 AvatarThumbnail

**パス**: `frontend/src/components/avatar/AvatarThumbnail.tsx`

**責務**:
- S3に保存されたサムネイル画像を表示
- アバター選択UIでの表示

**プロパティ**:
- avatarId: アバターID
- thumbnailUrl: サムネイル画像のURL（S3）
- size: サイズ（デフォルト: 80px、オプション）
- onClick: クリックハンドラ（オプション）
- selected: 選択状態（オプション）

**サムネイル生成タイミング**:
- Phase 1（MVP）: 管理者が手動でVRMとサムネイルを配置
- 将来: アバター登録時にフロントエンドで生成し、S3にアップロード

---

## 3. 変更対象コンポーネント

### 3.1 ConversationPage

**パス**: `frontend/src/pages/ConversationPage.tsx`

**変更内容**:
- `EmojiFeedbackContainer` → `VRMAvatarContainer` に置き換え
- `AvatarProvider`でラップ
- シナリオから`avatarId`を取得して`VRMAvatarContainer`に渡す

**変更前**:
```tsx
<EmojiFeedbackContainer
  angerLevel={currentMetrics.angerLevel}
  trustLevel={currentMetrics.trustLevel}
  progressLevel={currentMetrics.progressLevel}
  isSpeaking={isSpeaking}
  onEmotionChange={handleEmotionChange}
/>
```

**変更後**:
```tsx
<AvatarProvider>
  <VRMAvatarContainer
    avatarId={scenario.avatarId}
    angerLevel={currentMetrics.angerLevel}
    trustLevel={currentMetrics.trustLevel}
    progressLevel={currentMetrics.progressLevel}
    isSpeaking={isSpeaking}
    onEmotionChange={handleEmotionChange}
  />
</AvatarProvider>
```

**注意**: プロパティの順序を`avatarId`を先頭に変更。既存の状態管理（`isSpeaking`、`currentMetrics`、`currentEmotion`）はConversationPageで引き続き管理し、VRMAvatarContainerにはプロパティとして渡す。

### 3.2 ScenarioEditPage / ScenarioCreatePage

**パス**: 
- `frontend/src/pages/scenarios/ScenarioEditPage.tsx`
- `frontend/src/pages/scenarios/ScenarioCreatePage.tsx`

**変更内容**:
- `AvatarSelector`コンポーネントを追加
- `formData`に`avatarId`フィールドを追加
- シナリオ保存時に`avatarId`を含める

**追加するフォームフィールド**:
```typescript
// formDataに追加
avatarId: string | undefined;  // 使用するアバターのID
```

### 3.3 ApiService

**パス**: `frontend/src/services/ApiService.ts`

**追加メソッド**:
```typescript
// アバター一覧取得（初期実装ではローカルマニフェストから取得）
public async getAvatarList(): Promise<AvatarInfo[]>;

// アバター情報取得
public async getAvatarInfo(avatarId: string): Promise<AvatarInfo>;
```

**注意**: 初期実装ではバックエンドAPIは不要。`public/models/avatars/manifest.json`から取得。

---

## 4. 削除対象コンポーネント

| コンポーネント | パス | 理由 |
|---------------|------|------|
| EmojiFeedback.tsx | `components/EmojiFeedback.tsx` | VRMAvatarで完全置き換え |
| EmojiFeedbackContainer.tsx | `components/conversation/EmojiFeedbackContainer.tsx` | VRMAvatarContainerで置き換え |

**注意**: 削除は3Dアバター機能が安定稼働した後に実施。移行期間中は両方のコンポーネントを維持。

---

## 5. ディレクトリ構造

```
frontend/src/
├── components/
│   ├── avatar/                          # 新規ディレクトリ
│   │   ├── VRMAvatar.tsx
│   │   ├── VRMAvatarContainer.tsx       # → conversation/に配置も可
│   │   ├── VRMLoader.ts
│   │   ├── ExpressionController.ts
│   │   ├── LipSyncController.ts
│   │   ├── AnimationController.ts
│   │   ├── AvatarContext.tsx            # Contextもここに配置
│   │   ├── AvatarSelector.tsx
│   │   ├── AvatarThumbnail.tsx
│   │   └── index.ts
│   ├── conversation/
│   │   ├── EmojiFeedbackContainer.tsx   # 既存（移行後に削除）
│   │   └── VRMAvatarContainer.tsx       # 代替案：ここに配置
│   └── EmojiFeedback.tsx                # 既存（移行後に削除）
├── services/
│   └── AvatarService.ts                 # 新規
├── types/
│   ├── index.ts                         # 既存
│   └── avatar.ts                        # 新規
└── public/
    └── models/
        └── avatars/
            ├── manifest.json            # アバター一覧定義
            ├── default.vrm
            └── [other avatars].vrm
```


---

## 6. 型定義（types/avatar.ts）

既存の型システムとの整合性を保ちながら、アバター関連の型を定義します。

```typescript
import { EmotionState } from './index';

/**
 * アバター情報
 */
export interface AvatarInfo {
  id: string;                    // アバターID
  name: string;                  // 表示名
  modelPath: string;             // VRMファイルのパス（public/models/avatars/からの相対パス）
  thumbnail?: string;            // サムネイル画像パス（オプション、動的生成も可）
  description?: string;          // 説明文
  isDefault?: boolean;           // デフォルトアバターフラグ
}

/**
 * アバターマニフェスト（manifest.json）
 */
export interface AvatarManifest {
  version: string;               // マニフェストバージョン
  defaultAvatarId: string;       // デフォルトアバターID
  avatars: AvatarInfo[];         // アバター一覧
}

/**
 * Visemeデータ（Phase 2: リップシンク用）
 */
export interface VisemeData {
  time: number;                  // 音声開始からのミリ秒
  value: 'a' | 'i' | 'u' | 'e' | 'o' | 'sil';  // 母音またはサイレンス
}

/**
 * アバターContext状態（最小限）
 * 注意: emotion, isSpeaking等はConversationPageで管理するため、ここには含めない
 */
export interface AvatarContextState {
  currentAvatarId: string | null;  // 現在のアバターID
  avatarInfo: AvatarInfo | null;   // アバター情報
  isLoading: boolean;              // ローディング状態
  error: Error | null;             // エラー情報
}

/**
 * VRM表情マッピング
 */
export type VRMExpressionName = 'happy' | 'angry' | 'sad' | 'relaxed' | 'neutral';

/**
 * EmotionStateからVRM表情へのマッピング定義
 */
export const EMOTION_TO_VRM_EXPRESSION: Record<EmotionState, { expression: VRMExpressionName; intensity: number }> = {
  happy: { expression: 'happy', intensity: 0.8 },
  satisfied: { expression: 'relaxed', intensity: 0.6 },
  neutral: { expression: 'neutral', intensity: 0.0 },
  annoyed: { expression: 'angry', intensity: 0.4 },
  angry: { expression: 'angry', intensity: 0.8 },
};
```

---

## 7. マニフェストファイル定義

**パス**: `frontend/public/models/avatars/manifest.json`

```json
{
  "version": "1.0.0",
  "defaultAvatarId": "default",
  "avatars": [
    {
      "id": "default",
      "name": "デフォルトアバター",
      "modelPath": "default.vrm",
      "description": "標準的なビジネスパーソンのアバター",
      "isDefault": true
    }
  ]
}
```

**注意**: 
- 新しいアバターを追加する場合は、このマニフェストファイルにエントリを追加
- VRMファイルは`frontend/public/models/avatars/`ディレクトリに配置
- サムネイルは動的生成（AvatarThumbnailコンポーネント）を使用するため、事前生成は不要

---

## 8. ScenarioInfo型の拡張

**パス**: `frontend/src/types/api.ts`

既存の`ScenarioInfo`インターフェースに`avatarId`フィールドを追加します。

```typescript
export interface ScenarioInfo {
  // ... 既存フィールド ...
  
  // 新規追加フィールド
  avatarId?: string;  // 使用するアバターのID（未指定時はデフォルトアバターを使用）
}
```

**バックエンド対応**:
- DynamoDBのシナリオテーブルに`avatarId`属性を追加
- シナリオ作成/更新APIで`avatarId`を受け付けるように修正
- シナリオ取得APIで`avatarId`を返却するように修正

---

## 9. 移行計画

### Phase 1: 並行運用期間
1. 新規コンポーネント（VRMAvatar系）を追加
2. 既存コンポーネント（EmojiFeedback系）は維持
3. フィーチャーフラグで切り替え可能にする

### Phase 2: 完全移行
1. 3Dアバター機能の安定稼働を確認
2. EmojiFeedback系コンポーネントを削除
3. フィーチャーフラグを削除

**フィーチャーフラグ例**:
```typescript
// 環境変数または設定ファイルで制御
const USE_3D_AVATAR = import.meta.env.VITE_USE_3D_AVATAR === 'true';

// ConversationPageでの使用
{USE_3D_AVATAR ? (
  <VRMAvatarContainer {...props} />
) : (
  <EmojiFeedbackContainer {...props} />
)}
```
