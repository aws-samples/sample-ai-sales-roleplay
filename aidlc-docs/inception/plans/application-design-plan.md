# Application Design Plan - 3Dアバター機能

## 1. 概要

本計画では、現在の絵文字ベースのNPC表現（EmojiFeedback）を3Dアバター（VRM/VRoid）に置き換えるためのコンポーネント設計を行います。

## 2. 設計スコープ

### 2.1 新規コンポーネント
- VRMアバター表示コンポーネント群
- アバター管理サービス
- リップシンク制御
- 表情制御
- アニメーション制御

### 2.2 変更対象コンポーネント
- EmojiFeedbackContainer → VRMAvatarContainer に置き換え
- シナリオ管理画面（アバター選択UI追加）
- Bedrock API（感情分析拡張）

### 2.3 削除対象コンポーネント
- EmojiFeedback.tsx（3Dアバターで完全置き換え）
- EmojiFeedbackContainer.tsx（VRMAvatarContainerに置き換え）

---

## 3. 設計質問

### Q1: VRMモデルのロード戦略
VRMモデルファイル（約5-20MB）のロード戦略について：

A) **遅延ロード**: 会話画面に遷移した時点でロード開始
B) **事前ロード**: シナリオ選択時点でバックグラウンドでロード開始
C) **キャッシュ優先**: 一度ロードしたモデルはIndexedDBにキャッシュし、次回以降は即座に表示

[Answer]: A

---

### Q2: 感情分析の実装方式
NPCの発言から感情を推定する方式について：

A) **Bedrock API拡張**: 既存のNPC応答生成時に感情情報も同時に返す（レイテンシー最小）
B) **別途API呼び出し**: NPC応答後に別途感情分析APIを呼び出す（分離設計）
C) **フロントエンド推定**: 既存のメトリクス（angerLevel, trustLevel, progressLevel）から感情を推定（追加API不要）

[Answer]: Bedrock Agent Coreのリアルタイムフィードバックの中で実施します。

---

### Q3: リップシンクのタイミング制御
Amazon Polly Visemeデータと口形状の同期方式について：

A) **事前計算**: 音声生成時にVisemeタイムスタンプを取得し、再生時に同期
B) **リアルタイム**: 音声再生中にAudio Analyzerで音量を検出し、口を動かす
C) **ハイブリッド**: Phase 1はリアルタイム（音量ベース）、Phase 2で事前計算（Viseme）に移行

[Answer]: C

---

### Q4: WebGL非対応環境のフォールバック
WebGL 2.0非対応ブラウザでの動作について：

A) **静止画フォールバック**: アバターの静止画像を表示
B) **絵文字フォールバック**: 既存のEmojiFeedbackを表示
C) **エラー表示**: 「お使いのブラウザは3Dアバターに対応していません」と表示
D) **フォールバックなし**: WebGL非対応環境はサポート外とする

[Answer]: C

---

### Q5: アバターコンポーネントの状態管理
アバターの状態（表情、口形状、アニメーション）の管理方式について：

A) **ローカルState**: 各コンポーネント内でuseStateで管理
B) **Context API**: AvatarContextを作成し、アバター関連の状態を一元管理
C) **外部ライブラリ**: Zustandなどの軽量状態管理ライブラリを使用

[Answer]: B

---

### Q6: アバターサムネイル生成
シナリオ管理画面でのアバター選択UIに表示するサムネイルについて：

A) **事前生成**: VRMモデルから事前にサムネイル画像を生成し、S3に保存
B) **動的生成**: 選択画面でVRMモデルをロードし、Canvasからサムネイルを生成
C) **手動アップロード**: アバター登録時に管理者がサムネイル画像を手動でアップロード

[Answer]: A（アバター登録時に一度だけ生成してS3に保存）

---

## 4. 追加設計決定

### Q7: 既存状態管理との整合性
既存のConversationPageで管理されている状態との二重管理を避けるための方針：

**調査結果**:
ConversationPageで既に以下の状態が管理されている：
- `isSpeaking`: 発話中フラグ
- `currentEmotion`: 感情状態
- `currentMetrics`: angerLevel, trustLevel, progressLevel
- `audioEnabled`, `audioVolume`, `speechRate`: 音声設定

**決定**: 選択肢C - AvatarContextは最小限のみ

**AvatarContextで管理するもの（アバター固有の状態のみ）**:
- currentAvatarId: 現在のアバターID
- avatarInfo: アバター情報（モデルURL等）
- isLoading: アバターローディング状態
- error: アバターロードエラー

**ConversationPageで引き続き管理するもの（既存のまま）**:
- isSpeaking: 発話中フラグ
- currentEmotion: 感情状態
- currentMetrics: メトリクス
- audioEnabled, audioVolume, speechRate: 音声設定

**VRMAvatarContainerのプロパティ（EmojiFeedbackContainerと同等）**:
- avatarId: アバターID
- angerLevel, trustLevel, progressLevel: メトリクス
- isSpeaking: 発話中フラグ
- onEmotionChange: 感情変化コールバック

**LipSyncControllerの音声取得方法**:
- AudioService.getInstance()から直接取得（Contextを経由しない）

---

## 5. 設計タスク

## 5. 設計タスク

### 5.1 コンポーネント設計
- [x] VRMAvatar.tsx - メインアバターコンポーネント定義
- [x] VRMLoader.ts - VRMモデルローダー定義
- [x] ExpressionController.ts - 表情制御クラス定義
- [x] LipSyncController.ts - リップシンク制御クラス定義（AudioServiceから音声取得）
- [x] AnimationController.ts - アニメーション制御クラス定義
- [x] VRMAvatarContainer.tsx - コンテナコンポーネント定義（EmojiFeedbackContainerと同等インターフェース）
- [x] AvatarContext.tsx - アバター情報のみを管理（最小限）
- [x] AvatarThumbnail.tsx - S3保存済みサムネイル表示

### 5.2 サービス設計
- [x] AvatarService.ts - アバター管理サービス定義
- [x] PollyService.ts拡張 - Viseme対応追加（Phase 2）
- [x] AudioService.ts拡張 - getCurrentAudioElement追加

### 5.3 型定義
- [x] avatar.ts - アバター関連型定義（AvatarContextStateを最小限に変更）

### 5.4 コンポーネント依存関係
- [x] コンポーネント依存関係図作成
- [x] データフロー図作成
- [x] 既存状態管理との整合性確認

### 5.5 シナリオ管理統合
- [x] シナリオデータモデル拡張設計
- [x] アバター選択UI設計

---

## 6. 成果物

本計画の実行により、以下の成果物を生成します：

1. `aidlc-docs/inception/application-design/components.md` - コンポーネント定義
2. `aidlc-docs/inception/application-design/component-methods.md` - メソッド定義
3. `aidlc-docs/inception/application-design/services.md` - サービス定義
4. `aidlc-docs/inception/application-design/component-dependency.md` - 依存関係図

---

## 7. 設計決定サマリー

| 項目 | 決定 | 理由 |
|------|------|------|
| VRMロード戦略 | A - 遅延ロード | シンプルな実装、初期ロード時間短縮 |
| 感情分析 | 既存リアルタイムスコアリングAPI拡張 | Bedrock Agent Coreで実施 |
| リップシンク | C - ハイブリッド | Phase 1: 音量ベース → Phase 2: Viseme |
| フォールバック | C - エラー表示 | シンプルな実装 |
| 状態管理 | B - Context API（最小限） | アバター情報のみ管理、既存状態は維持 |
| サムネイル | A - S3保存 | アバター登録時に生成 |
| 既存状態との整合性 | C - AvatarContextは最小限 | 二重管理を回避 |

---

## 8. 次のステップ

1. ~~上記の質問（Q1-Q6）に回答してください~~ ✅ 完了
2. ~~回答に基づいてコンポーネント設計を確定します~~ ✅ 完了
3. ~~設計ドキュメントを生成します~~ ✅ 完了
4. Application Design承認後、NFR Requirementsステージに進む
