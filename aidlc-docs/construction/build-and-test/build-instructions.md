# Build Instructions - 3Dアバター機能 Phase 2（標準実装）

## 前提条件
- **Node.js**: 18.x以上
- **npm**: 9.x以上
- **Python**: 3.9以上（バックエンドLambda）
- **ブラウザ**: Chrome最新版（WebGL対応）
- **AWS CLI**: 最新版（デプロイ時）

## 依存パッケージ

### フロントエンド
```json
{
  "three": "^0.182.0",
  "@pixiv/three-vrm": "^3.4.5",
  "@types/three": "^0.182.0"
}
```

### バックエンド（Lambda）
- boto3（AWS SDK for Python）
- Amazon Polly Speech Marks API対応

## ビルド手順

### 1. フロントエンド依存関係のインストール
```bash
cd frontend
npm install
```

### 2. TypeScript型チェック
```bash
cd frontend
npx tsc --noEmit
```

### 3. リントチェック
```bash
cd frontend
npm run lint
```
- **期待結果**: エラー0件（warning 1件はAvatarContext.tsxのreact-refresh警告で許容）

### 4. フロントエンドビルド実行
```bash
cd frontend
npm run build:full
```

### 5. ビルド成功の確認
- **期待される出力**: `dist/`ディレクトリにビルド成果物が生成される
- **ビルド成果物**: `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`

### 6. バックエンドデプロイ（CDK）
```bash
cd cdk
npm run deploy:dev
```
- **注意**: `npm run build`は実行禁止（カスタムルール）
- **変更対象Lambda**: textToSpeech（Speech Marks対応）、realtime-scoring（npcEmotion追加）

## Phase 2 変更ファイル一覧

### バックエンド（3ファイル）
| ファイル | 変更内容 |
|----------|----------|
| `cdk/lambda/textToSpeech/app.ts` | Speech Marks API追加、visemeレスポンス |
| `cdk/agents/realtime-scoring/models.py` | npcEmotionフィールド追加 |
| `cdk/agents/realtime-scoring/prompts.py` | 感情推定プロンプト追加 |

### フロントエンド（8ファイル）
| ファイル | 変更内容 |
|----------|----------|
| `frontend/src/types/avatar.ts` | viseme型、directEmotion型追加 |
| `frontend/src/services/PollyService.ts` | visemeデータ取得メソッド追加 |
| `frontend/src/services/ApiService.ts` | callPollyAPIレスポンスにvisemes追加 |
| `frontend/src/services/AudioService.ts` | visemeデータ伝搬 |
| `frontend/src/components/avatar/LipSyncController.ts` | visemeベースリップシンク |
| `frontend/src/components/avatar/VRMAvatar.tsx` | viseme/directEmotion受け渡し |
| `frontend/src/components/avatar/VRMAvatarContainer.tsx` | directEmotion対応 |
| `frontend/src/pages/ConversationPage.tsx` | directEmotion連携、avatarId渡し |

### その他（1ファイル）
| ファイル | 変更内容 |
|----------|----------|
| `frontend/public/models/avatars/manifest.json` | 複数アバター構造（v2.0.0） |

## トラブルシューティング

### Speech Marks APIエラー
- **原因**: Polly APIのSpeechMarkTypes設定不正
- **解決策**: textToSpeech Lambdaのログを確認、OutputFormat: 'json'が設定されているか確認

### visemeデータが空
- **原因**: Polly APIがvisemeを返さない場合がある（短いテキスト等）
- **解決策**: Phase 1の音量ベースリップシンクにフォールバックされるため動作に影響なし

### アバター切り替え時のエラー
- **原因**: VRMファイルが存在しない
- **解決策**: `public/models/avatars/`に対応するVRMファイルを配置
