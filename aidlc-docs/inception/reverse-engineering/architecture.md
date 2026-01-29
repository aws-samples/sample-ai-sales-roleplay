# System Architecture

## System Overview

AI営業ロールプレイは、AWS上に構築されたサーバーレスアーキテクチャを採用したフルスタックアプリケーションです。フロントエンドはReact + TypeScript、バックエンドはAWS CDKで管理されるLambda関数群で構成されています。

## Architecture Diagram

```
Text Alternative (Architecture Overview):

┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  React 19 + TypeScript + Material UI 7 + Vite                       │   │
│  │  - AWS Amplify v6 (認証)                                            │   │
│  │  - i18next (国際化)                                                 │   │
│  │  - Chart.js (データ可視化)                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CDN / DELIVERY                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Amazon CloudFront + S3 (静的ホスティング)                          │   │
│  │  - WAF (IP制限、地域制限)                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                       │
│  ┌──────────────────────────┐  ┌──────────────────────────┐                │
│  │  API Gateway (REST)      │  │  API Gateway (WebSocket) │                │
│  │  - Cognito Authorizer    │  │  - Transcribe Streaming  │                │
│  └──────────────────────────┘  └──────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              COMPUTE LAYER                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │  Bedrock    │ │  Sessions   │ │  Scenarios  │ │  Scoring    │          │
│  │  Lambda     │ │  Lambda     │ │  Lambda     │ │  Lambda     │          │
│  │  (Python)   │ │  (Python)   │ │  (Python)   │ │  (Python)   │          │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │  Videos     │ │  Rankings   │ │  Guardrails │ │  TextToSpeech│         │
│  │  Lambda     │ │  Lambda     │ │  Lambda     │ │  Lambda     │          │
│  │  (Python)   │ │  (Python)   │ │  (Python)   │ │  (TypeScript)│         │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐          │
│  │  Audio      │ │  Session    │ │  Transcribe WebSocket       │          │
│  │  Analysis   │ │  Analysis   │ │  Lambda (TypeScript)        │          │
│  │  Lambda     │ │  Lambda     │ │                             │          │
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI/ML SERVICES                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                  │
│  │  Amazon Bedrock         │  │  Amazon Transcribe      │                  │
│  │  - Claude 3.5 Haiku     │  │  - Streaming API        │                  │
│  │  - Claude Sonnet 4.5    │  │                         │                  │
│  │  - Nova Lite (Video)    │  └─────────────────────────┘                  │
│  │  - Guardrails           │  ┌─────────────────────────┐                  │
│  │  - Knowledge Base       │  │  Amazon Polly           │                  │
│  └─────────────────────────┘  │  - SSML対応             │                  │
│                               └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                      │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                  │
│  │  DynamoDB               │  │  Amazon S3              │                  │
│  │  - Sessions Table       │  │  - PDF Storage          │                  │
│  │  - Messages Table       │  │  - Audio Storage        │                  │
│  │  - Scenarios Table      │  │  - Video Storage        │                  │
│  │  - Session Feedback     │  │  - Frontend Assets      │                  │
│  └─────────────────────────┘  └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORCHESTRATION                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  AWS Step Functions                                                  │   │
│  │  - Audio Analysis State Machine                                      │   │
│  │  - Session Analysis State Machine                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AUTHENTICATION                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Amazon Cognito                                                      │   │
│  │  - User Pool + Identity Pool                                         │   │
│  │  - Email認証                                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### Frontend Application
- **Purpose**: ユーザーインターフェースを提供
- **Responsibilities**: UI表示、状態管理、API通信、音声入出力
- **Dependencies**: AWS Amplify, API Gateway
- **Type**: Application

### API Gateway (REST)
- **Purpose**: RESTful APIエンドポイントを提供
- **Responsibilities**: リクエストルーティング、認証、CORS処理
- **Dependencies**: Lambda関数群、Cognito
- **Type**: Infrastructure

### API Gateway (WebSocket)
- **Purpose**: リアルタイム音声認識用WebSocket接続を提供
- **Responsibilities**: WebSocket接続管理、メッセージルーティング
- **Dependencies**: Transcribe WebSocket Lambda、Cognito
- **Type**: Infrastructure

### Bedrock Lambda
- **Purpose**: NPC会話生成
- **Responsibilities**: プロンプト構築、LLM呼び出し、会話履歴管理
- **Dependencies**: Amazon Bedrock、DynamoDB
- **Type**: Application

### Sessions Lambda
- **Purpose**: セッション管理
- **Responsibilities**: セッションCRUD、メッセージ履歴、フィードバック取得
- **Dependencies**: DynamoDB、Bedrock Knowledge Base
- **Type**: Application

### Scenarios Lambda
- **Purpose**: シナリオ管理
- **Responsibilities**: シナリオCRUD、PDF管理、共有設定
- **Dependencies**: DynamoDB、S3、Bedrock Knowledge Base
- **Type**: Application

### Scoring Lambda
- **Purpose**: リアルタイム評価
- **Responsibilities**: メトリクス計算、ゴール評価、コンプライアンスチェック
- **Dependencies**: Amazon Bedrock、DynamoDB
- **Type**: Application

### Videos Lambda
- **Purpose**: 動画分析
- **Responsibilities**: 動画アップロード、Nova Premiere分析
- **Dependencies**: S3、Amazon Bedrock (Nova)
- **Type**: Application

### Session Analysis Lambda
- **Purpose**: セッション分析オーケストレーション
- **Responsibilities**: フィードバック生成、動画分析連携、参照評価
- **Dependencies**: Step Functions、Bedrock、S3
- **Type**: Application

### Audio Analysis Lambda
- **Purpose**: 音声分析
- **Responsibilities**: 音声処理、Transcribe連携
- **Dependencies**: S3、Amazon Transcribe
- **Type**: Application

### Transcribe WebSocket Lambda
- **Purpose**: リアルタイム音声認識
- **Responsibilities**: WebSocket接続、Transcribe Streaming連携
- **Dependencies**: Amazon Transcribe、DynamoDB
- **Type**: Application

### TextToSpeech Lambda
- **Purpose**: 音声合成
- **Responsibilities**: Amazon Polly呼び出し、SSML処理
- **Dependencies**: Amazon Polly、S3
- **Type**: Application

## Data Flow

### 会話フロー
```
1. ユーザー → 音声入力 → Transcribe WebSocket → テキスト変換
2. テキスト → Bedrock Lambda → Claude 3.5 Haiku → NPC応答生成
3. NPC応答 → TextToSpeech Lambda → Amazon Polly → 音声出力
4. 同時に → Scoring Lambda → メトリクス更新 → フロントエンド表示
```

### セッション分析フロー
```
1. セッション終了 → Session Analysis Lambda → Step Functions開始
2. Step Functions → フィードバック生成 (Bedrock)
3. Step Functions → 動画分析 (Nova Premiere)
4. Step Functions → 参照評価 (Knowledge Base)
5. 結果統合 → DynamoDB保存 → フロントエンド表示
```

## Integration Points

### External APIs
- **Amazon Bedrock**: LLM呼び出し（会話、評価、分析）
- **Amazon Transcribe**: 音声認識
- **Amazon Polly**: 音声合成

### Databases
- **DynamoDB**: セッション、メッセージ、シナリオ、フィードバック
- **S3**: PDF資料、音声ファイル、動画ファイル

### Third-party Services
- なし（すべてAWSサービスで構成）

## Infrastructure Components

### CDK Stacks
- **InfrastructureStack**: メインスタック（認証、API、Lambda、ストレージ）
- **DataInitializerStack**: 初期データ投入
- **CloudFrontWafStack**: CDN + WAF設定

### Deployment Model
- **環境分離**: dev / staging / prod
- **デプロイ方式**: AWS CDK deploy
- **CI/CD**: GitHub Actions（想定）

### Networking
- **VPC**: 使用なし（サーバーレス構成）
- **セキュリティ**: WAF、Cognito認証、IAM最小権限
