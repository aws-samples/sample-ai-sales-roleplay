# Code Generation Plan - 3Dアバター機能 Phase 2（標準実装）

## 1. 概要

Phase 2では以下の4機能を実装します：
1. Amazon Polly Visemeによる母音リップシンク
2. AI感情分析による表情連動
3. 複数アバター対応
4. シナリオ管理統合（ConversationPageでのavatarId渡し）

## 2. 実装順序

### Step 1: バックエンド - TextToSpeech Lambda にSpeech Marks対応を追加
- [x] `cdk/lambda/textToSpeech/app.ts` を変更
  - Speech Marks API呼び出し（OutputFormat: 'json', SpeechMarkTypes: ['viseme']）を追加
  - visemeデータをパースしてレスポンスに`visemes`フィールドとして含める
  - 音声合成（mp3）とSpeech Marks取得を並列実行してレイテンシーを最小化
  - TextToSpeechResponse型に`visemes`フィールドを追加

### Step 2: フロントエンド型定義 - viseme関連型の追加
- [x] `frontend/src/types/avatar.ts` を変更
  - `PollyViseme`型（Polly viseme文字列）を追加
  - `PollyVisemeToVowel`マッピング定数を追加
  - `SpeechMarksEntry`型を追加
  - `VRMAvatarContainerProps`に`directEmotion`プロパティを追加
  - `VRMAvatarProps`に`visemeData`と`directEmotion`プロパティを追加

### Step 3: フロントエンド - PollyService にvisemeデータ取得を追加
- [x] `frontend/src/services/PollyService.ts` を変更
  - `synthesizeSpeechWithViseme()`メソッドを追加（audioUrl + visemesを返す）
  - 既存の`synthesizeSpeech()`はフォールバックとして維持

### Step 4: フロントエンド - AudioService にvisemeデータ伝搬を追加
- [x] `frontend/src/services/AudioService.ts` を変更
  - `synthesizeAndQueueAudio()`でvisemeデータを取得・保存
  - visemeデータをCustomEventで配信する仕組みを追加
  - AudioQueueItemにvisemeデータを追加

### Step 5: フロントエンド - LipSyncController をvisemeベースに拡張
- [x] `frontend/src/components/avatar/LipSyncController.ts` を変更
  - visemeデータを受け取り、タイミングに合わせて母音ブレンドシェイプを切り替え
  - `setVisemeData()`メソッドを追加
  - `startVisemePlayback()`メソッドを追加
  - Polly viseme → VRM口形状（aa, ih, ou, ee, oh）マッピングを実装
  - Phase 1の音量ベースリップシンクをフォールバックとして維持

### Step 6: フロントエンド - VRMAvatar にvisemeデータ受け渡しを追加
- [x] `frontend/src/components/avatar/VRMAvatar.tsx` を変更
  - `visemeData`プロパティを受け取り、LipSyncControllerに渡す
  - `directEmotion`プロパティを受け取り、ExpressionControllerに渡す

### Step 7: フロントエンド - VRMAvatarContainer にdirectEmotion対応を追加
- [x] `frontend/src/components/avatar/VRMAvatarContainer.tsx` を変更
  - `directEmotion`プロパティを追加
  - directEmotionが指定された場合、メトリクスベースの感情計算より優先
  - visemeデータのCustomEventリスナーを追加し、VRMAvatarに渡す

### Step 8: バックエンド - リアルタイム評価にNPC感情フィールドを追加
- [x] `cdk/agents/realtime-scoring/models.py` を変更
  - `ScoringResult`に`npcEmotion`フィールド（happy/angry/sad/relaxed/neutral）を追加
  - `npcEmotionIntensity`フィールド（0.0-1.0）を追加
- [x] `cdk/agents/realtime-scoring/prompts.py` を変更
  - プロンプトにNPC感情推定の指示を追加

### Step 9: フロントエンド - ConversationPage にdirectEmotion連携を追加
- [x] `frontend/src/pages/ConversationPage.tsx` を変更
  - リアルタイム評価レスポンスから`npcEmotion`を取得
  - `VRMAvatarContainer`に`directEmotion`を渡す
  - シナリオの`avatarId`を`VRMAvatarContainer`に渡す

### Step 10: 複数アバター - manifest.json拡張
- [x] `frontend/public/models/avatars/manifest.json` を変更
  - 複数アバターエントリのサンプル構造を追加（実際のVRMファイルはユーザーが配置）

### Step 11: i18n - アバター関連の翻訳キー追加
- [x] 日本語・英語の翻訳ファイルにアバター関連キーを追加（必要に応じて）

---

## 3. 変更ファイル一覧

### バックエンド
| # | ファイル | 変更内容 |
|---|----------|----------|
| 1 | `cdk/lambda/textToSpeech/app.ts` | Speech Marks API追加、visemeレスポンス |
| 2 | `cdk/agents/realtime-scoring/models.py` | npcEmotionフィールド追加 |
| 3 | `cdk/agents/realtime-scoring/prompts.py` | 感情推定プロンプト追加 |

### フロントエンド
| # | ファイル | 変更内容 |
|---|----------|----------|
| 4 | `frontend/src/types/avatar.ts` | viseme型、directEmotion型追加 |
| 5 | `frontend/src/services/PollyService.ts` | visemeデータ取得メソッド追加 |
| 6 | `frontend/src/services/AudioService.ts` | visemeデータ伝搬 |
| 7 | `frontend/src/components/avatar/LipSyncController.ts` | visemeベースリップシンク |
| 8 | `frontend/src/components/avatar/VRMAvatar.tsx` | viseme/directEmotion受け渡し |
| 9 | `frontend/src/components/avatar/VRMAvatarContainer.tsx` | directEmotion対応 |
| 10 | `frontend/src/pages/ConversationPage.tsx` | directEmotion連携、avatarId渡し |
| 11 | `frontend/public/models/avatars/manifest.json` | 複数アバター構造 |

---

## 4. 依存関係

```
Step 1 (Lambda) → Step 2 (型定義) → Step 3 (PollyService) → Step 4 (AudioService) → Step 5 (LipSyncController) → Step 6 (VRMAvatar) → Step 7 (VRMAvatarContainer)
Step 8 (評価エージェント) → Step 9 (ConversationPage)
Step 10 (manifest.json) は独立
```

Step 1とStep 8は並列実行可能（バックエンド変更）。
Step 2〜7は順序依存（visemeデータの流れ）。
Step 9はStep 7とStep 8に依存。
Step 10は独立。

---

## 5. 承認

上記の計画で実装を開始してよろしいですか？

1. **変更を依頼** - 計画の修正
2. **実装を開始** - コード生成を開始
