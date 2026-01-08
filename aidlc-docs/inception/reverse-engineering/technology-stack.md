# Technology Stack

## Programming Languages

| Language | Version | Usage |
|----------|---------|-------|
| TypeScript | ~5.9.3 | フロントエンド、一部Lambda関数 |
| Python | 3.9+ | Lambda関数（バックエンド） |
| JavaScript | ES2022+ | ビルドスクリプト、設定ファイル |

## Frameworks

### Frontend
| Framework | Version | Purpose |
|-----------|---------|---------|
| React | ^19.2.3 | UIフレームワーク |
| Material UI | ^7.3.6 | UIコンポーネントライブラリ |
| Vite | ^7.2.7 | ビルドツール・開発サーバー |
| React Router DOM | ^7.10.1 | ルーティング |
| i18next | ^25.7.2 | 国際化フレームワーク |
| react-i18next | ^16.5.0 | React用i18nバインディング |
| Chart.js | ^4.5.1 | データ可視化 |
| react-chartjs-2 | ^5.3.1 | React用Chart.jsラッパー |

### Backend
| Framework | Version | Purpose |
|-----------|---------|---------|
| AWS CDK | ^2.233.0 | インフラストラクチャ as Code |
| AWS Lambda Powertools | Latest | Lambda関数ユーティリティ |
| Strands Agents | Latest | Bedrock Agent呼び出し |

## Infrastructure

### AWS Services
| Service | Purpose |
|---------|---------|
| Amazon Cognito | ユーザー認証・認可 |
| Amazon API Gateway | REST API / WebSocket API |
| AWS Lambda | サーバーレスコンピューティング |
| Amazon DynamoDB | NoSQLデータベース |
| Amazon S3 | オブジェクトストレージ |
| Amazon CloudFront | CDN |
| AWS WAF | Webアプリケーションファイアウォール |
| AWS Step Functions | ワークフローオーケストレーション |

### AI/ML Services
| Service | Purpose |
|---------|---------|
| Amazon Bedrock | LLM呼び出し（Claude、Nova） |
| Amazon Bedrock Guardrails | コンプライアンスチェック |
| Amazon Bedrock Knowledge Base | PDF参照評価 |
| Amazon Transcribe | 音声認識 |
| Amazon Polly | 音声合成 |

### Bedrock Models
| Model | Purpose |
|-------|---------|
| Claude 3.5 Haiku | 会話生成、スコアリング |
| Claude Sonnet 4.5 | フィードバック生成、参照評価 |
| Amazon Nova Lite | 動画分析 |

## Build Tools

| Tool | Version | Purpose |
|------|---------|---------|
| npm | Latest | パッケージ管理 |
| Vite | ^7.2.7 | フロントエンドビルド |
| TypeScript Compiler | ~5.9.3 | TypeScriptコンパイル |
| ESLint | ^9.39.2 | コード品質チェック |
| Prettier | ^3.7.4 | コードフォーマット |
| AWS CDK CLI | 2.1100.1 | CDKデプロイ |

## Testing Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Jest | ^30.2.0 | ユニットテスト |
| React Testing Library | ^16.3.0 | Reactコンポーネントテスト |
| Playwright | ^1.57.0 | E2Eテスト |
| ts-jest | ^29.4.6 | TypeScript用Jestトランスフォーマー |
| cdk-nag | ^2.37.55 | CDKセキュリティチェック |

## Development Tools

| Tool | Purpose |
|------|---------|
| Husky | Git hooks管理 |
| lint-staged | ステージングファイルのリント |
| ts-prune | 未使用エクスポート検出 |
| ts-unused-exports | 未使用エクスポート検出 |

## Authentication & Authorization

| Component | Technology |
|-----------|------------|
| User Authentication | Amazon Cognito User Pool |
| Identity Federation | Amazon Cognito Identity Pool |
| API Authorization | Cognito Authorizer (JWT) |
| WebSocket Auth | JWT Token (Query Parameter) |

## Data Storage

| Storage Type | Technology | Purpose |
|--------------|------------|---------|
| Session Data | DynamoDB | セッション情報 |
| Message History | DynamoDB | メッセージ履歴 |
| Scenario Data | DynamoDB | シナリオ情報 |
| Feedback Data | DynamoDB | フィードバック結果 |
| PDF Files | S3 | 参照資料 |
| Audio Files | S3 | 音声ファイル |
| Video Files | S3 | 録画ファイル |
| Frontend Assets | S3 + CloudFront | 静的ファイル |

## Monitoring & Logging

| Component | Technology |
|-----------|------------|
| Lambda Logging | AWS Lambda Powertools Logger |
| API Logging | API Gateway Access Logs |
| Tracing | AWS X-Ray (via Powertools) |
| Metrics | CloudWatch Metrics |

## Security

| Component | Technology |
|-----------|------------|
| WAF | AWS WAF (IP制限、地域制限) |
| Encryption at Rest | S3 SSE, DynamoDB Encryption |
| Encryption in Transit | TLS 1.2+ |
| IAM | 最小権限の原則 |
| Security Scanning | cdk-nag |
| Content Filtering | Amazon Bedrock Guardrails |

## Environment Configuration

| Environment | Configuration File |
|-------------|-------------------|
| Development | cdk/.env.dev |
| Staging | cdk/.env.staging |
| Production | cdk/.env.prod |
| CDK Context | cdk/cdk.json |
| Frontend | frontend/.env.local |
