# Unit Test Instructions - 3Dアバター機能 Phase 2

## テスト対象コンポーネント

### Phase 1（既存）
| コンポーネント | テスト内容 |
|---------------|-----------|
| VRMLoader | VRMファイルの読み込み、エラーハンドリング |
| ExpressionController | 感情→表情マッピング、トランジション |
| AnimationController | 瞬き・呼吸アニメーション |
| AvatarContext | 状態管理、アバター読み込み |
| VRMAvatar | Three.jsシーン管理、レンダリング |
| VRMAvatarContainer | WebGLチェック、エラー表示 |

### Phase 2（新規・変更）
| コンポーネント | テスト内容 |
|---------------|-----------|
| LipSyncController | visemeベースリップシンク、母音マッピング、フォールバック |
| PollyService | synthesizeSpeechWithViseme、visemeデータ取得 |
| AudioService | visemeデータ伝搬、CustomEvent配信 |
| VRMAvatar | visemeData/directEmotionプロパティ受け渡し |
| VRMAvatarContainer | directEmotion優先制御、visemeイベントリスナー |
| ConversationPage | npcEmotion取得、avatarId渡し |

## テスト実行

### 1. 全ユニットテスト実行
```bash
cd frontend
npm run test
```

### 2. アバター関連テストのみ実行
```bash
cd frontend
npm run test -- --testPathPattern="avatar"
```

### 3. カバレッジ付きテスト
```bash
cd frontend
npm run test:coverage
```

## Phase 2 テストケース

### LipSyncController（visemeモード）
- ✅ setVisemeData()でPolly visemeが日本語母音に変換される
- ✅ startVisemePlayback()で再生が開始される
- ✅ stopVisemePlayback()で口形状がリセットされる
- ✅ visemeタイミングに合わせて正しいブレンドシェイプが適用される
- ✅ visemeデータが空の場合、再生が開始されない
- ✅ Phase 1の音量ベースリップシンクがフォールバックとして動作する

### PollyService（viseme対応）
- ✅ synthesizeSpeechWithViseme()がaudioUrlとvisemesを返す
- ✅ visemesが未返却の場合、undefinedが返る
- ✅ エラー時に適切な例外がスローされる

### VRMAvatarContainer（directEmotion）
- ✅ directEmotionが指定された場合、メトリクスベースの感情計算より優先される
- ✅ directEmotionがundefinedの場合、従来のメトリクスベース計算が使用される
- ✅ visemeデータのCustomEventを受信してVRMAvatarに渡す

### アバター切り替え
- ✅ manifest.jsonから複数アバターが読み込まれる
- ✅ avatarId変更時にモデルURLが正しく解決される
- ✅ 存在しないavatarIdの場合、デフォルトアバターが使用される

## 期待される結果
- **テスト数**: Phase 2追加分 約15-20テスト
- **カバレッジ目標**: 80%以上
- **テストレポート**: `frontend/coverage/`

## 失敗時の対応
1. テスト出力を確認
2. 失敗したテストケースを特定
3. コードを修正
4. テストを再実行
