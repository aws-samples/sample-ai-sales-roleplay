# Component Inventory

## Application Packages

### Frontend Application
| Package | Purpose |
|---------|---------|
| frontend | React + TypeScript フロントエンドアプリケーション |

### Backend Lambda Functions
| Package | Language | Purpose |
|---------|----------|---------|
| cdk/lambda/bedrock | Python | Amazon Bedrock連携、NPC会話生成 |
| cdk/lambda/sessions | Python | セッション管理、メッセージ履歴 |
| cdk/lambda/scenarios | Python | シナリオCRUD、PDF管理 |
| cdk/lambda/scoring | Python | リアルタイムスコアリング、コンプライアンスチェック |
| cdk/lambda/videos | Python | 動画アップロード、Nova Premiere分析 |
| cdk/lambda/rankings | Python | ランキング機能 |
| cdk/lambda/guardrails | Python | Guardrails一覧取得 |
| cdk/lambda/audioAnalysis | Python | 音声分析処理 |
| cdk/lambda/sessionAnalysis | Python | セッション分析オーケストレーション |
| cdk/lambda/textToSpeech | TypeScript | Amazon Polly音声合成 |
| cdk/lambda/transcribeWebSocket | TypeScript | リアルタイム音声認識WebSocket |
| cdk/lambda/custom-resources | TypeScript | カスタムリソース管理 |

## Infrastructure Packages

### CDK Constructs
| Package | Purpose |
|---------|---------|
| cdk/lib/constructs/api | API Gateway関連コンストラクト |
| cdk/lib/constructs/api/api-gateway.ts | REST API Gateway |
| cdk/lib/constructs/api/bedrock-lambda.ts | Bedrock Lambda構築 |
| cdk/lib/constructs/api/session-lambda.ts | Session Lambda構築 |
| cdk/lib/constructs/api/scenario-lambda.ts | Scenario Lambda構築 |
| cdk/lib/constructs/api/scoring-lambda.ts | Scoring Lambda構築 |
| cdk/lib/constructs/api/videos-lambda.ts | Videos Lambda構築 |
| cdk/lib/constructs/api/rankings-lambda.ts | Rankings Lambda構築 |
| cdk/lib/constructs/api/guardrails-lambda.ts | Guardrails Lambda構築 |
| cdk/lib/constructs/api/audio-analysis-lambda.ts | Audio Analysis Lambda構築 |
| cdk/lib/constructs/api/session-analysis-lambda.ts | Session Analysis Lambda構築 |
| cdk/lib/constructs/api/transcribe-websocket.ts | Transcribe WebSocket構築 |
| cdk/lib/constructs/storage | ストレージ関連コンストラクト |
| cdk/lib/constructs/storage/database-tables.ts | DynamoDBテーブル定義 |
| cdk/lib/constructs/storage/audio-storage.ts | 音声ファイルS3バケット |
| cdk/lib/constructs/storage/video-storage.ts | 動画ファイルS3バケット |
| cdk/lib/constructs/storage/pdf-storage.ts | PDF資料S3バケット |
| cdk/lib/constructs/guardrails | Guardrails関連コンストラクト |
| cdk/lib/constructs/auth.ts | Cognito認証構築 |
| cdk/lib/constructs/web.ts | CloudFront + S3構築 |
| cdk/lib/constructs/polly.ts | Polly Lexicon構築 |
| cdk/lib/constructs/knowledgebase.ts | Bedrock Knowledge Base構築 |
| cdk/lib/constructs/common-web-acl.ts | WAF WebACL構築 |
| cdk/lib/constructs/audio-analysis-stepfunctions.ts | 音声分析Step Functions |
| cdk/lib/constructs/session-analysis-stepfunctions.ts | セッション分析Step Functions |

### CDK Stacks
| Package | Purpose |
|---------|---------|
| cdk/lib/infrastructure-stack.ts | メインインフラストラクチャスタック |
| cdk/lib/data-initializer-stack.ts | 初期データ投入スタック |
| cdk/lib/stacks/cloudfront-waf-stack.ts | CloudFront WAFスタック |

### Custom Resources
| Package | Purpose |
|---------|---------|
| cdk/lib/custom-resources/polly-lexicon | Polly Lexiconカスタムリソース |
| cdk/lib/custom-resources/scenario-initializer | シナリオ初期化カスタムリソース |

## Shared Packages

### Frontend Shared
| Package | Purpose |
|---------|---------|
| frontend/src/types | TypeScript型定義 |
| frontend/src/utils | ユーティリティ関数 |
| frontend/src/config | 設定ファイル |
| frontend/src/i18n | 国際化設定 |
| frontend/src/styles | スタイル定義 |

### Backend Shared
| Package | Purpose |
|---------|---------|
| cdk/lib/types | CDK型定義 |
| cdk/data | 初期データ（シナリオ、Guardrails設定） |

## Test Packages

### Frontend Tests
| Package | Type | Purpose |
|---------|------|---------|
| frontend/src/__tests__ | Unit/Integration | コンポーネント・ユーティリティテスト |
| frontend/src/tests | Unit | 追加ユニットテスト |
| frontend (playwright) | E2E | Playwrightによるエンドツーエンドテスト |

### Backend Tests
| Package | Type | Purpose |
|---------|------|---------|
| cdk/test | Unit | CDKスタックテスト |

## Total Count

| Category | Count |
|----------|-------|
| **Total Packages** | 45+ |
| **Application** | 13 |
| **Infrastructure** | 25+ |
| **Shared** | 7 |
| **Test** | 3 |

## Frontend Components Inventory

### Pages (8)
| Component | Purpose |
|-----------|---------|
| HomePage | ホームページ |
| ConversationPage | 会話ページ（メイン機能） |
| ResultPage | 結果表示ページ |
| ScenarioSelectPage | シナリオ選択ページ |
| ProfilePage | プロフィールページ |
| RankingPage | ランキングページ |
| AudioAnalysisPage | 音声分析ページ |
| history/* | 履歴関連ページ |

### Core Components (20+)
| Component | Purpose |
|-----------|---------|
| AppContent | アプリケーションコンテンツラッパー |
| Header | ヘッダーコンポーネント |
| EmojiFeedback | 感情フィードバック表示 |
| AnimatedMessage | アニメーション付きメッセージ |
| AnimatedMetricsProgress | メトリクスプログレスバー |
| LoadingButton | ローディング付きボタン |
| LoadingOverlay | ローディングオーバーレイ |
| ErrorAlert | エラーアラート |
| RankingList | ランキングリスト |
| LanguageSwitcher | 言語切り替え |
| LanguageSettings | 言語設定 |
| DemoGuide | デモガイド |
| DemoStarter | デモスターター |
| SpeechRecognitionFeedback | 音声認識フィードバック |

### Conversation Components (10+)
| Component | Purpose |
|-----------|---------|
| ConversationHeader | 会話ヘッダー |
| NPCInfoCard | NPC情報カード |
| EmojiFeedbackContainer | 感情フィードバックコンテナ |
| MessageList | メッセージリスト |
| MessageInput | メッセージ入力 |
| SidebarPanel | サイドバーパネル |
| ComplianceAlert | コンプライアンスアラート |

### Recording Components (5+)
| Component | Purpose |
|-----------|---------|
| VideoManager | 動画管理 |
| recording/v2/* | 録画関連コンポーネント |

### Scenario Components (5+)
| Component | Purpose |
|-----------|---------|
| scenarios/* | シナリオ関連コンポーネント |
