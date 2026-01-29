# Code Structure

## Build System

### Frontend
- **Type**: npm + Vite
- **Configuration**: 
  - `frontend/package.json` - 依存関係管理
  - `frontend/vite.config.ts` - Viteビルド設定
  - `frontend/tsconfig.json` - TypeScript設定
  - `frontend/eslint.config.js` - ESLint設定

### Backend (CDK)
- **Type**: npm + AWS CDK
- **Configuration**:
  - `cdk/package.json` - 依存関係管理
  - `cdk/cdk.json` - CDK設定（環境別Bedrockモデル設定含む）
  - `cdk/tsconfig.json` - TypeScript設定

## Project Structure

```
/
├── frontend/                    # Reactアプリケーション
│   ├── src/
│   │   ├── components/         # UIコンポーネント
│   │   │   ├── common/         # 共通コンポーネント
│   │   │   ├── compliance/     # コンプライアンス関連
│   │   │   ├── conversation/   # 会話画面コンポーネント
│   │   │   ├── recording/      # 録画関連
│   │   │   ├── referenceCheck/ # 参照チェック関連
│   │   │   └── user/           # ユーザー関連
│   │   ├── pages/              # ページコンポーネント
│   │   │   ├── history/        # 履歴関連ページ
│   │   │   └── scenarios/      # シナリオ関連ページ
│   │   ├── services/           # APIサービス、認証等
│   │   ├── hooks/              # カスタムReactフック
│   │   ├── types/              # TypeScript型定義
│   │   ├── utils/              # ユーティリティ関数
│   │   ├── i18n/               # 国際化設定
│   │   │   └── locales/        # 言語ファイル
│   │   ├── config/             # 設定ファイル
│   │   └── styles/             # スタイル定義
│   ├── eslint-plugin-i18n-keys/ # カスタムESLintプラグイン
│   └── public/                 # 静的ファイル
│
├── cdk/                        # AWS CDKインフラコード
│   ├── bin/                    # CDKエントリーポイント
│   ├── lib/
│   │   ├── constructs/         # 再利用可能なCDKコンストラクト
│   │   │   ├── api/            # API Gateway関連
│   │   │   ├── storage/        # S3、DynamoDB関連
│   │   │   └── guardrails/     # Guardrails関連
│   │   ├── stacks/             # デプロイ可能なスタック
│   │   ├── custom-resources/   # カスタムリソース
│   │   └── types/              # 型定義
│   ├── lambda/                 # Lambda関数実装
│   │   ├── bedrock/            # Bedrock連携 (Python)
│   │   ├── sessions/           # セッション管理 (Python)
│   │   ├── scenarios/          # シナリオ管理 (Python)
│   │   ├── scoring/            # スコアリング (Python)
│   │   ├── videos/             # 動画処理 (Python)
│   │   ├── rankings/           # ランキング (Python)
│   │   ├── guardrails/         # Guardrails (Python)
│   │   ├── audioAnalysis/      # 音声分析 (Python)
│   │   ├── sessionAnalysis/    # セッション分析 (Python)
│   │   ├── textToSpeech/       # 音声合成 (TypeScript)
│   │   ├── transcribeWebSocket/ # Transcribe WebSocket (TypeScript)
│   │   └── custom-resources/   # カスタムリソース (TypeScript)
│   ├── data/                   # 初期データ
│   └── scripts/                # ユーティリティスクリプト
│
├── docs/                       # ドキュメント
│   ├── cost/                   # コスト試算
│   ├── custom-resources/       # カスタムリソースガイド
│   ├── deployment/             # デプロイガイド
│   └── image/                  # 画像ファイル
│
├── memory-bank/                # プロジェクトコンテキスト
├── scripts/                    # プロジェクトスクリプト
└── .kiro/                      # Kiro AI設定
    └── steering/               # ステアリングルール
```

## Key Classes/Modules

### Frontend Services

```
ApiService (Singleton)
├── chatWithNPC()           # NPC会話API
├── getRealtimeEvaluation() # リアルタイム評価API
├── getSessions()           # セッション一覧取得
├── getScenarios()          # シナリオ一覧取得
├── createScenario()        # シナリオ作成
├── updateScenario()        # シナリオ更新
├── deleteScenario()        # シナリオ削除
├── getSessionFeedback()    # フィードバック取得
├── startSessionAnalysis()  # セッション分析開始
└── uploadPdfFile()         # PDFアップロード

AudioService (Singleton)
├── synthesizeAndQueueAudio() # 音声合成・キュー追加
├── setAudioEnabled()         # 音声有効/無効設定
└── setVolume()               # 音量設定

TranscribeService (Singleton)
├── initializeConnection()    # WebSocket接続初期化
├── startRecognition()        # 音声認識開始
├── stopRecognition()         # 音声認識停止
└── dispose()                 # リソース解放

PollyService (Singleton)
├── synthesizeSpeech()        # 音声合成
└── setSpeechRate()           # 読み上げ速度設定

LanguageService (Singleton)
├── getCurrentLanguage()      # 現在の言語取得
├── changeLanguage()          # 言語変更
└── loadLanguageSettingFromUserProfile() # 言語設定読み込み
```

### Frontend Pages

```
ConversationPage
├── シナリオ読み込み
├── セッション管理
├── メッセージ送受信
├── メトリクス表示
├── 音声入出力
└── 録画管理

ScenarioSelectPage
├── シナリオ一覧表示
├── フィルタリング
└── シナリオ選択

ResultPage
├── フィードバック表示
├── メトリクス表示
├── 動画分析結果表示
└── ゴール達成状況表示
```

### Backend Lambda Handlers

```
bedrock/index.py
├── handle_bedrock_conversation() # 会話処理
├── invoke_bedrock_model()        # Bedrockモデル呼び出し
├── create_or_update_session()    # セッション管理
└── save_message()                # メッセージ保存

sessions/index.py
├── register_session_routes()     # セッションルート登録
├── register_message_routes()     # メッセージルート登録
└── register_analysis_results_routes() # 分析結果ルート登録

scenarios/index.py
├── get_scenarios()               # シナリオ一覧取得
├── get_scenario()                # シナリオ詳細取得
├── create_scenario()             # シナリオ作成
├── update_scenario()             # シナリオ更新
├── delete_scenario()             # シナリオ削除
└── start_knowledge_base_ingestion() # KB ingestion開始

scoring/index.py
├── handle_realtime_scoring()     # リアルタイムスコアリング
├── calculate_realtime_scores()   # スコア計算
├── check_compliance_violations() # コンプライアンスチェック
└── save_realtime_metrics_to_dynamodb() # メトリクス保存
```

## Design Patterns

### Singleton Pattern
- **Location**: Frontend Services (ApiService, AudioService, TranscribeService, PollyService, LanguageService)
- **Purpose**: サービスインスタンスの一元管理
- **Implementation**: `getInstance()` メソッドによる遅延初期化

### Repository Pattern
- **Location**: Lambda関数のDynamoDB操作
- **Purpose**: データアクセスの抽象化
- **Implementation**: テーブル操作をヘルパー関数で抽象化

### Factory Pattern
- **Location**: CDK Constructs
- **Purpose**: インフラリソースの生成
- **Implementation**: Constructクラスによるリソース生成

### Observer Pattern
- **Location**: React状態管理、WebSocket接続
- **Purpose**: 状態変更の通知
- **Implementation**: React useState/useEffect、イベントリスナー

### Strategy Pattern
- **Location**: Bedrockモデル選択
- **Purpose**: 環境・用途に応じたモデル切り替え
- **Implementation**: cdk.jsonの環境別設定

## Critical Dependencies

### Frontend

| Dependency | Version | Usage | Purpose |
|------------|---------|-------|---------|
| react | ^19.2.3 | Core | UIフレームワーク |
| @mui/material | ^7.3.6 | UI | コンポーネントライブラリ |
| aws-amplify | ^6.15.9 | Auth/API | AWS認証・API通信 |
| i18next | ^25.7.2 | i18n | 国際化 |
| react-router-dom | ^7.10.1 | Routing | ルーティング |
| chart.js | ^4.5.1 | Charts | データ可視化 |

### Backend (CDK)

| Dependency | Version | Usage | Purpose |
|------------|---------|-------|---------|
| aws-cdk-lib | ^2.233.0 | Core | CDKコアライブラリ |
| @aws-cdk/aws-lambda-python-alpha | ^2.233.0-alpha.0 | Lambda | Python Lambda構築 |
| @cdklabs/generative-ai-cdk-constructs | ^0.1.312 | AI | Bedrock構築 |
| cdk-nag | ^2.37.55 | Security | セキュリティチェック |
| @aws-sdk/* | ^3.958.0 | AWS | AWS SDK v3 |

### Python Lambda

| Dependency | Usage | Purpose |
|------------|-------|---------|
| aws-lambda-powertools | Logging/Tracing | ロギング・トレーシング |
| boto3 | AWS SDK | AWSサービス呼び出し |
| strands | AI Agent | Bedrock Agent呼び出し |
