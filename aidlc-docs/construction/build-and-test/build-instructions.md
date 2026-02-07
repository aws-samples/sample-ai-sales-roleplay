# Build Instructions - 3Dアバター機能 Phase 3（拡張実装）

## 前提条件
- **Node.js**: 18.x以上
- **npm**: 9.x以上
- **Python**: 3.9以上（バックエンドLambda）
- **ブラウザ**: Chrome最新版（WebGL対応）
- **AWS CLI**: 最新版（デプロイ時）

## 依存パッケージ

### フロントエンド（Phase 1から継続）
```json
{
  "three": "^0.182.0",
  "@pixiv/three-vrm": "^3.4.5",
  "@types/three": "^0.182.0"
}
```

### バックエンド（Lambda - 新規）
- `cdk/lambda/avatars/requirements.txt`: boto3, aws-lambda-powertools

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
- **期待結果**: エラー0件

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
- **新規Lambda**: avatars（VRMアバターCRUD）
- **変更対象Lambda**: realtime-scoring（gestureフィールド追加）
- **新規リソース**: S3バケット（アバターストレージ）、DynamoDBテーブル（アバターメタデータ）

## Phase 3 変更ファイル一覧

### バックエンド（7ファイル）
| ファイル | 変更内容 |
|----------|----------|
| `cdk/agents/realtime-scoring/models.py` | gestureフィールド追加 |
| `cdk/agents/realtime-scoring/prompts.py` | ジェスチャー推定プロンプト追加 |
| `cdk/lib/constructs/storage/avatar-storage.ts` | 新規: S3 + DynamoDB |
| `cdk/lib/constructs/api/avatar-lambda.ts` | 新規: Lambda構成 |
| `cdk/lambda/avatars/index.py` | 新規: CRUD Lambdaハンドラー |
| `cdk/lib/constructs/api.ts` | アバターストレージ・API統合 |
| `cdk/lib/constructs/api/api-gateway.ts` | アバターAPIルート追加 |

### フロントエンド（10ファイル）
| ファイル | 変更内容 |
|----------|----------|
| `frontend/src/types/avatar.ts` | GestureType型追加 |
| `frontend/src/components/avatar/AnimationController.ts` | ジェスチャー + アイドルモーション |
| `frontend/src/components/avatar/ExpressionController.ts` | 感情トランジション高度化 |
| `frontend/src/components/avatar/VRMAvatar.tsx` | gesture受け渡し |
| `frontend/src/components/avatar/VRMAvatarContainer.tsx` | gesture受け渡し |
| `frontend/src/pages/ConversationPage.tsx` | gestureデータフロー |
| `frontend/src/services/AgentCoreService.ts` | gesture型追加 |
| `frontend/src/services/ApiService.ts` | gesture型追加 |
| `frontend/src/services/AvatarService.ts` | 新規: アバター管理API |
| `frontend/src/components/avatar/AvatarUpload.tsx` | 新規: VRMアップロード |

### i18n（2ファイル）
| ファイル | 変更内容 |
|----------|----------|
| `frontend/src/i18n/locales/ja.json` | アバター管理キー追加 |
| `frontend/src/i18n/locales/en.json` | アバター管理キー追加 |

## トラブルシューティング

### gestureフィールドが返されない
- **原因**: realtime-scoringエージェントのプロンプト更新がデプロイされていない
- **解決策**: `cd cdk && npm run deploy:dev`でバックエンドを再��プロイ

### アバターアップロードAPI 403エラー
- **原因**: API GatewayにアバターAPIルートが追加されていない
- **解決策**: CDKデプロイが完了しているか確認

### AnimationControllerでジェスチャーが動作しない
- **原因**: VRMモデルにheadボーンが存在しない
- **解決策**: VRoid Studioで作成したモデルを使用（humanoidボーン対応）
