# 3Dアバター機能 Phase 2（標準実装） - 要件定義書

## 1. 概要

### 1.1 Intent Analysis（意図分析）

| 項目 | 内容 |
|------|------|
| **ユーザーリクエスト** | Phase 1（MVP）で実装した3Dアバター機能を標準レベルに拡張 |
| **リクエストタイプ** | 機能強化（Enhancement） |
| **スコープ** | 複数コンポーネント（フロントエンド + バックエンド） |
| **複雑度** | 中（Polly Speech Marks統合、感情分析拡張、UI追加） |
| **前提条件** | Phase 1完了済み（VRM表示、音量ベースリップシンク、瞬き、単一アバター） |

### 1.2 Phase 1からの差分

Phase 1（MVP）で実装済み：
- VRMモデルの表示とレンダリング
- 音量ベースのリップシンク（`aa`ブレンドシェイプのみ）
- 瞬き・呼吸アニメーション
- メトリクスベースの感情状態計算と表情反映
- 単一アバター（default.vrm）
- AvatarContext、VRMAvatar、VRMAvatarContainer等のコンポーネント基盤

---

## 2. 機能要件

### 2.1 Amazon Polly Visemeによる母音リップシンク

| ID | 要件 | 優先度 |
|----|------|--------|
| P2-FR-001 | Polly Speech Marks APIを使用してvisemeタイミングデータを取得する | 必須 |
| P2-FR-002 | Polly visemeを日本語母音（a, i, u, e, o, sil）にマッピングする | 必須 |
| P2-FR-003 | VRMの口形状ブレンドシェイプ（aa, ih, ou, ee, oh）に母音を反映する | 必須 |
| P2-FR-004 | 音声再生タイミングとvisemeデータを同期させる | 必須 |
| P2-FR-005 | Phase 1の音量ベースリップシンクをフォールバックとして維持する | 推奨 |

#### 技術仕様
- Polly Speech Marks: `OutputFormat: 'json'`, `SpeechMarkTypes: ['viseme']`
- Polly viseme → 日本語母音マッピング:
  - `a, @, E` → `a`（あ）
  - `i, I` → `i`（い）
  - `u, U, o, O` → `u`（う）
  - `e` → `e`（え）
  - `O` → `o`（お）
  - `sil, p, t, S, T, f, k, r, s` → `sil`（無音/閉口）
- 制約: Generativeエンジンではviseme非対応のため、Neural/Standardエンジンを使用

### 2.2 AI感情分析による表情連動

| ID | 要件 | 優先度 |
|----|------|--------|
| P2-FR-006 | NPC応答テキストからAIで感情を推定し、アバター表情に反映する | 必須 |
| P2-FR-007 | 感情データ（emotion + intensity）をNPC応答と共に返す | 必須 |
| P2-FR-008 | メトリクスベースの間接的感情計算に加え、AI直接指定の感情も反映する | 必須 |
| P2-FR-009 | 感情の変化はスムーズにトランジションする（既存ExpressionController活用） | 必須 |

#### 技術仕様
- 感情推定はリアルタイム評価API（`/scoring/realtime`）のレスポンスに`npcEmotion`フィールドを追加
- 感情タイプ: `happy`, `angry`, `sad`, `relaxed`, `neutral`
- 強度: 0.0 - 1.0
- VRMAvatarContainerに`directEmotion`プロパティを追加

### 2.3 複数アバター対応

| ID | 要件 | 優先度 |
|----|------|--------|
| P2-FR-010 | manifest.jsonに複数のアバター定義を追加できる | 必須 |
| P2-FR-011 | アバター選択UIをシナリオ管理画面に表示する | 必須 |
| P2-FR-012 | 選択されたアバターIDをシナリオデータに保存する | 必須 |
| P2-FR-013 | 会話開始時にシナリオに紐づくアバターを読み込む | 必須 |
| P2-FR-014 | アバターIDが未指定の場合はデフォルトアバターを使用する | 必須 |

#### 技術仕様
- manifest.jsonの拡張（複数アバターエントリ）
- AvatarContextは既に複数アバター対応設計
- VRMファイルはfrontend/public/models/avatars/に配置

### 2.4 シナリオ管理統合

| ID | 要件 | 優先度 |
|----|------|--------|
| P2-FR-015 | シナリオ作成/編集画面にアバター選択ドロップダウンを追加する | 必須 |
| P2-FR-016 | ConversationPageでシナリオのavatarIdをVRMAvatarContainerに渡す | 必須 |
| P2-FR-017 | アバターサムネイル画像を選択UIに表示する | 推奨 |

---

## 3. 非機能要件

| ID | 要件 | 基準 |
|----|------|------|
| P2-NFR-001 | Speech Marks取得による追加レイテンシーは500ms以内 | 目標 |
| P2-NFR-002 | 感情分析による追加レイテンシーは既存評価APIに含まれる | 必須 |
| P2-NFR-003 | 複数アバター切り替え時のモデル読み込みは3秒以内 | 目標 |
| P2-NFR-004 | Chrome最新版でのみ動作確認（Phase 1と同様） | 必須 |

---

## 4. 変更影響範囲

### 4.1 バックエンド変更
| ファイル | 変更内容 |
|----------|----------|
| `cdk/lambda/textToSpeech/app.ts` | Speech Marks API呼び出し追加、visemeデータをレスポンスに含める |

### 4.2 フロントエンド変更
| ファイル | 変更内容 |
|----------|----------|
| `frontend/src/types/avatar.ts` | VisemeData型は定義済み。追加型定義（SpeechMarksResponse等） |
| `frontend/src/services/PollyService.ts` | visemeデータ取得・返却対応 |
| `frontend/src/services/AudioService.ts` | visemeデータの伝搬、再生タイミング同期 |
| `frontend/src/components/avatar/LipSyncController.ts` | visemeベースリップシンク実装（Phase 1の音量ベースを置換） |
| `frontend/src/components/avatar/VRMAvatarContainer.tsx` | directEmotionプロパティ追加 |
| `frontend/src/components/avatar/VRMAvatar.tsx` | directEmotionの受け渡し |
| `frontend/src/pages/ConversationPage.tsx` | avatarId渡し、directEmotion連携 |
| `frontend/public/models/avatars/manifest.json` | 複数アバター定義 |

### 4.3 変更不要
- CDKインフラ構成（既存API Gateway、Lambda構成で対応可能）
- DynamoDBスキーマ（avatarIdは既にScenarioInfoに定義済み）
- 認証・セキュリティ（既存Cognito認証をそのまま使用）

---

## 5. 成功基準

1. NPCの発話に合わせて母音（あ・い・う・え・お）に対応した口形状が変化する
2. NPCの感情がAI分析に基づいてリアルタイムで表情に反映される
3. シナリオごとに異なるアバターを選択・設定できる
4. 既存機能（音声認識、録画、評価、コンプライアンスチェック）が正常に動作する
