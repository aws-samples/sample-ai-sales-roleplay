# 技術スタック

## フロントエンド
- **フレームワーク**: React 19.1.1
- **言語**: TypeScript 5.9.2
- **UIライブラリ**: Material UI 7.3.1
- **ビルドツール**: Vite 7.1.3
- **認証**: AWS Amplify v6.15.5
- **状態管理**: React Context API
- **HTTP通信**: AWS Amplify API (REST)

- **国際化**: i18next 25.4.2 + react-i18next 15.7.2
- **チャート**: Chart.js 4.5.0 + react-chartjs-2 5.3.0
- **ルーティング**: React Router DOM 7.8.2
- **テスト**: Jest 30.0.5 + React Testing Library 16.3.0 + Playwright 1.55.0

## バックエンド
- **インフラ**: AWS CDK 2.1026.0
- **コンピューティング**: AWS Lambda (Python 3.9)
- **API**: Amazon API Gateway (REST + WebSocket)
- **データベース**: DynamoDB, RDS PostgreSQL
- **ストレージ**: Amazon S3 (PDF資料、音声ファイル、動画録画)
- **音声認識**: Amazon Transcribe Streaming (WebSocket)
- **AI/ML**:
  - Amazon Bedrock (Claude 3.5 Haiku)
  - Amazon Nova Premiere (動画分析)
  - Amazon Polly (音声合成、SSML対応)
  - Amazon Bedrock Guardrails (コンプライアンスチェック)
  - Amazon Bedrock Knowledge Base (PDF参照評価)
- **認証**: Amazon Cognito
- **セキュリティ**: CDK Nag 2.37.9 (セキュリティチェック)

## 共通コマンド

### フロントエンド開発
```bash
# 開発サーバー起動
cd frontend
npm run dev

# ビルド（型チェック付き）
cd frontend
npm run build:full

# リント
cd frontend
npm run lint

# フォーマット
cd frontend
npm run format

# テスト実行
cd frontend
npm run test

# カバレッジ付きテスト
cd frontend
npm run test:coverage

# E2Eテスト
cd frontend
npm run test:e2e

# 国際化検証
cd frontend
npm run validate-i18n
```

### バックエンド開発
```bash
# CDKデプロイ（環境別）
cd cdk
npm run deploy:dev      # 開発環境
npm run deploy:staging  # ステージング環境
npm run deploy:prod     # 本番環境

# CDK合成（環境別）
cd cdk
npm run synth:dev
npm run synth:staging
npm run synth:prod

# CDKテスト
cd cdk
npm run test

# CDK Nagセキュリティチェック
cd cdk
npm run nag-check
```

### プロジェクト全体
```bash
# Husky準備（Git hooks）
npm run prepare

# 全テスト実行
npm run test

```

## 開発環境要件
- Node.js 18.x以上
- Python 3.9以上
- AWS CLI最新版
- AWS CDK最新版

## コーディング規約
- ESLintを使用したコード品質管理
- TypeScriptの型定義を厳密に行う
- Lambdaハンドラーには適切なエラーハンドリングを実装
- AWS CDKではcdk-nagによるセキュリティチェックを実施
- コンポーネントは機能単位で分割し、再利用性を高める

## アーキテクチャパターン
- RESTful APIを使用した効率的な通信
- ストリーミングAPIによる低レイテンシー応答
- サーバーレスアーキテクチャによるスケーラビリティ確保
- マイクロサービス設計によるサービス分離
- プロンプトエンジニアリングによるAI応答制御
- セッション録画・動画分析による包括的評価
- Knowledge Baseを活用したPDF参照評価
- Global Secondary Indexによる効率的なデータフィルタリング

## API設計パターン
- **認証**: Cognito IDトークンによるAPI認証
- **エラーハンドリング**: 統一されたエラーレスポンス形式
- **ページネーション**: nextTokenベースのページング
- **ファイルアップロード**: S3署名付きURLによる直接アップロード
- **リアルタイム評価**: 非同期処理によるパフォーマンス最適化
- **動画処理**: セッション録画の自動アップロード・分析
- **音声処理**: Amazon Polly SSML対応による自然な音声合成
- **PDF処理**: Knowledge Base連携による参照資料評価
- **コンプライアンス**: Guardrails統合による自動違反検出

## セキュリティ対策
- **Guardrails**: Amazon Bedrock Guardrailsによるコンプライアンスチェック
- **IAM**: 最小権限の原則に基づくアクセス制御
- **データ暗号化**: 保存時・転送時の暗号化
- **入力検証**: フロントエンド・バックエンド両方での検証
