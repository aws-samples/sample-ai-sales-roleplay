# Dependencies

## Internal Dependencies

### Package Dependency Diagram

```
Text Alternative (Dependency Flow):

Frontend Application
    │
    ├── depends on → API Gateway (REST)
    │                    │
    │                    ├── routes to → Bedrock Lambda
    │                    │                   └── uses → DynamoDB (Sessions, Messages, Scenarios)
    │                    │                   └── uses → Amazon Bedrock
    │                    │
    │                    ├── routes to → Sessions Lambda
    │                    │                   └── uses → DynamoDB (Sessions, Messages, Feedback)
    │                    │                   └── uses → Bedrock Knowledge Base
    │                    │
    │                    ├── routes to → Scenarios Lambda
    │                    │                   └── uses → DynamoDB (Scenarios)
    │                    │                   └── uses → S3 (PDF Storage)
    │                    │                   └── uses → Bedrock Knowledge Base
    │                    │
    │                    ├── routes to → Scoring Lambda
    │                    │                   └── uses → DynamoDB (Feedback)
    │                    │                   └── uses → Amazon Bedrock
    │                    │                   └── uses → Bedrock Guardrails
    │                    │
    │                    ├── routes to → Videos Lambda
    │                    │                   └── uses → S3 (Video Storage)
    │                    │                   └── uses → Amazon Bedrock (Nova)
    │                    │
    │                    ├── routes to → Rankings Lambda
    │                    │                   └── uses → DynamoDB (Feedback, Sessions)
    │                    │                   └── uses → Cognito (User Info)
    │                    │
    │                    ├── routes to → TextToSpeech Lambda
    │                    │                   └── uses → Amazon Polly
    │                    │                   └── uses → S3 (Audio Storage)
    │                    │
    │                    ├── routes to → Session Analysis Lambda
    │                    │                   └── uses → Step Functions
    │                    │                   └── uses → DynamoDB
    │                    │                   └── uses → Amazon Bedrock
    │                    │
    │                    └── routes to → Audio Analysis Lambda
    │                                        └── uses → Step Functions
    │                                        └── uses → Amazon Transcribe
    │
    └── depends on → API Gateway (WebSocket)
                         │
                         └── routes to → Transcribe WebSocket Lambda
                                             └── uses → Amazon Transcribe Streaming
                                             └── uses → DynamoDB (Connections)
```

### CDK Construct Dependencies

```
InfrastructureStack
    │
    ├── creates → Auth (Cognito)
    │
    ├── creates → DatabaseTables (DynamoDB)
    │                 └── Sessions Table
    │                 └── Messages Table
    │                 └── Scenarios Table
    │                 └── Session Feedback Table
    │
    ├── creates → GuardrailsConstruct
    │
    ├── creates → PdfStorageConstruct (S3)
    │
    ├── creates → VectorKB (Knowledge Base)
    │                 └── depends on → PdfStorageConstruct
    │
    ├── creates → Api
    │                 └── depends on → Auth
    │                 └── depends on → DatabaseTables
    │                 └── depends on → GuardrailsConstruct
    │                 └── depends on → PdfStorageConstruct
    │                 └── depends on → VectorKB
    │                 │
    │                 └── creates → AudioStorageConstruct
    │                 └── creates → VideoStorageConstruct
    │                 └── creates → BedrockLambdaConstruct
    │                 └── creates → SessionLambdaConstruct
    │                 └── creates → ScenarioLambdaConstruct
    │                 └── creates → ScoringLambdaConstruct
    │                 └── creates → VideosLambdaConstruct
    │                 └── creates → RankingsLambdaConstruct
    │                 └── creates → GuardrailsLambdaConstruct
    │                 └── creates → AudioAnalysisLambdaConstruct
    │                 └── creates → SessionAnalysisLambdaConstruct
    │                 └── creates → TranscribeWebSocketConstruct
    │                 └── creates → TextToSpeechFunction
    │                 └── creates → ApiGatewayConstruct
    │                 └── creates → AudioAnalysisStepFunctionsConstruct
    │                 └── creates → SessionAnalysisStepFunctionsConstruct
    │
    ├── creates → CommonWebAcl (WAF)
    │
    └── creates → Web (CloudFront + S3)
                      └── depends on → Api
                      └── depends on → Auth
```

## External Dependencies

### Frontend Dependencies

| Dependency | Version | Purpose | License |
|------------|---------|---------|---------|
| react | ^19.2.3 | UIフレームワーク | MIT |
| react-dom | ^19.2.3 | React DOMレンダリング | MIT |
| @mui/material | ^7.3.6 | UIコンポーネント | MIT |
| @mui/icons-material | ^7.3.6 | MUIアイコン | MIT |
| @emotion/react | ^11.14.0 | CSS-in-JS | MIT |
| @emotion/styled | ^11.14.1 | Styled Components | MIT |
| aws-amplify | ^6.15.9 | AWS認証・API | Apache-2.0 |
| @aws-amplify/ui-react | ^6.13.2 | Amplify UIコンポーネント | Apache-2.0 |
| @aws-amplify/pubsub | ^6.1.65 | Amplify PubSub | Apache-2.0 |
| react-router-dom | ^7.10.1 | ルーティング | MIT |
| i18next | ^25.7.2 | 国際化 | MIT |
| react-i18next | ^16.5.0 | React i18n | MIT |
| i18next-browser-languagedetector | ^8.2.0 | 言語検出 | MIT |
| chart.js | ^4.5.1 | チャート | MIT |
| react-chartjs-2 | ^5.3.1 | React Chart.js | MIT |
| @fontsource/roboto | ^5.2.9 | Robotoフォント | Apache-2.0 |

### Frontend Dev Dependencies

| Dependency | Version | Purpose | License |
|------------|---------|---------|---------|
| typescript | ~5.9.3 | TypeScript | Apache-2.0 |
| vite | ^7.2.7 | ビルドツール | MIT |
| @vitejs/plugin-react | ^5.1.2 | Vite Reactプラグイン | MIT |
| eslint | ^9.39.2 | リンター | MIT |
| prettier | ^3.7.4 | フォーマッター | MIT |
| jest | ^30.2.0 | テストフレームワーク | MIT |
| @testing-library/react | ^16.3.0 | Reactテスト | MIT |
| @testing-library/jest-dom | ^6.9.1 | Jest DOM拡張 | MIT |
| @playwright/test | ^1.57.0 | E2Eテスト | Apache-2.0 |

### Backend (CDK) Dependencies

| Dependency | Version | Purpose | License |
|------------|---------|---------|---------|
| aws-cdk-lib | ^2.233.0 | CDKコアライブラリ | Apache-2.0 |
| constructs | ^10.4.4 | CDKコンストラクト | Apache-2.0 |
| @aws-cdk/aws-lambda-python-alpha | ^2.233.0-alpha.0 | Python Lambda | Apache-2.0 |
| @cdklabs/generative-ai-cdk-constructs | ^0.1.312 | AI CDKコンストラクト | Apache-2.0 |
| @aws-amplify/auth-construct | ^1.10.0 | Amplify認証 | Apache-2.0 |
| @aws-solutions-constructs/* | ^2.97.0 | AWSソリューション | Apache-2.0 |
| @aws/pdk | ^0.26.15 | AWS PDK | Apache-2.0 |
| cdk-nag | ^2.37.55 | セキュリティチェック | Apache-2.0 |
| deploy-time-build | ^0.4.5 | デプロイ時ビルド | MIT |
| jsonwebtoken | ^9.0.3 | JWT処理 | MIT |
| jwks-rsa | ^3.2.0 | JWKS処理 | MIT |

### Backend (CDK) Dev Dependencies

| Dependency | Version | Purpose | License |
|------------|---------|---------|---------|
| typescript | ~5.9.3 | TypeScript | Apache-2.0 |
| aws-cdk | 2.1100.1 | CDK CLI | Apache-2.0 |
| jest | ^30.2.0 | テストフレームワーク | MIT |
| ts-jest | ^29.4.6 | TypeScript Jest | MIT |
| ts-node | ^10.9.2 | TypeScript実行 | MIT |
| @types/node | 25.0.3 | Node.js型定義 | MIT |
| @types/aws-lambda | ^8.10.159 | Lambda型定義 | MIT |

### AWS SDK Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| @aws-sdk/client-dynamodb | ^3.958.0 | DynamoDB操作 |
| @aws-sdk/lib-dynamodb | ^3.958.0 | DynamoDB Document Client |
| @aws-sdk/client-s3 | ^3.958.0 | S3操作 |
| @aws-sdk/s3-request-presigner | ^3.958.0 | S3署名付きURL |
| @aws-sdk/client-polly | ^3.958.0 | Polly操作 |
| @aws-sdk/client-transcribe-streaming | ^3.958.0 | Transcribe Streaming |
| @aws-sdk/client-apigatewaymanagementapi | ^3.958.0 | WebSocket管理 |

### Python Lambda Dependencies

| Dependency | Purpose |
|------------|---------|
| aws-lambda-powertools | ロギング、トレーシング |
| boto3 | AWS SDK for Python |
| strands | Bedrock Agent呼び出し |
| botocore | AWS SDK低レベルライブラリ |

## Dependency Security Notes

- すべての依存関係は定期的に更新を推奨
- `npm audit` / `pip audit` による脆弱性チェックを実施
- cdk-nagによるCDKセキュリティチェックを実施
- 本番環境では依存関係のバージョンを固定
