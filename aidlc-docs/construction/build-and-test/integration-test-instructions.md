# Integration Test Instructions - 3Dアバター機能 Phase 2

## 目的
Phase 2で追加した機能（Visemeリップシンク、AI感情分析、複数アバター）の統合動作を検証する。

## テストシナリオ

### シナリオ1: Visemeリップシンク統合（TextToSpeech → AudioService → LipSyncController）
- **説明**: Polly Speech Marksのvisemeデータがリップシンクに正しく反映される
- **前提条件**: セッションが開始されている、音声が有効
- **テスト手順**:
  1. NPCが応答を生成
  2. TextToSpeech LambdaがSpeech Marks付きで音声合成
  3. AudioServiceがvisemeデータをCustomEventで配信
  4. VRMAvatarContainerがイベントを受信
  5. LipSyncControllerがvisemeタイミングに合わせて口形状を変更
- **期待結果**: 音声再生と同期した母音ベースのリップシンクが動作する
- **フォールバック確認**: visemeデータがない場合、Phase 1の音量ベースリップシンクが動作する

### シナリオ2: AI感情分析連動（realtime-scoring → ConversationPage → VRMAvatarContainer）
- **説明**: リアルタイム評価のnpcEmotionがアバター表情に反映される
- **前提条件**: セッションが開始されている
- **テスト手順**:
  1. ユーザーがメッセージを送信
  2. リアルタイム評価エージェントがnpcEmotionを返す
  3. ConversationPageがnpcEmotionをdirectEmotionとしてVRMAvatarContainerに渡す
  4. VRMAvatarContainerがdirectEmotionを優先してExpressionControllerに適用
- **期待結果**: NPCの感情がアバター表情にリアルタイムで反映される

### シナリオ3: 複数アバター切り替え
- **説明**: manifest.jsonに定義された複数アバターの切り替えが正しく動作する
- **前提条件**: manifest.jsonに複数アバターが定義されている
- **テスト手順**:
  1. テストページ（/avatar-test）にアクセス
  2. アバター切り替えドロップダウンからアバターを選択
  3. VRMモデルがリロードされる
  4. 表情・リップシンクが新しいモデルで動作する
- **期待結果**: アバター切り替え後も全機能が正常に動作する
- **注意**: VRMファイルが存在しない場合はエラーメッセージが表示される

### シナリオ4: Phase 1機能の回帰テスト
- **説明**: Phase 2の変更がPhase 1の機能に影響していないことを確認
- **テスト手順**:
  1. アバターが正しく表示される
  2. メトリクスベースの感情変化が動作する（directEmotionなし時）
  3. 瞬きアニメーションが自然に動作する
  4. WebGL非対応時にエラーメッセージが表示される
- **期待結果**: Phase 1の全機能が正常に動作する

## テスト環境のセットアップ

### 1. 開発サーバー起動
```bash
cd frontend
npm run dev
```

### 2. VRMモデルの配置
```bash
# public/models/avatars/ にVRMファイルを配置
# manifest.jsonでモデルを定義（v2.0.0形式）
```

### 3. バックエンドデプロイ（必要な場合）
```bash
cd cdk
npm run deploy:dev
```

## テスト実行

### テストページでの手動テスト
1. http://localhost:5173/avatar-test にアクセス
2. Phase 2セクションの各機能を確認:
   - Visemeリップシンク: 母音ボタンと「こんにちは」再生
   - directEmotion: 感情ボタンで表情変化
   - アバター切り替え: ドロップダウンでモデル変更

### E2Eテスト（Playwright）
```bash
cd frontend
npx playwright test avatar-emotion-test.spec.ts --project=chromium
```

## 検証項目チェックリスト
- [ ] Visemeリップシンクが音声と同期して動作する
- [ ] visemeデータがない場合、音量ベースリップシンクにフォールバックする
- [ ] directEmotionがメトリクスベースの感情計算より優先される
- [ ] directEmotionがない場合、従来のメトリクスベース計算が動作する
- [ ] アバター切り替え後も全機能が正常に動作する
- [ ] Phase 1の全機能が回帰なく動作する
