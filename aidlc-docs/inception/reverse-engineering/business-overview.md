# Business Overview

## Business Context

AI営業ロールプレイは、若手営業担当者（入社3年目まで）を対象としたAI駆動型営業トレーニングシステムです。生成AIとのインタラクティブなシミュレーションを通じて、実践的な営業スキルの向上を図ります。

## Business Description

本システムは、感情表現豊かなAI（NPC: Non-Player Character）との音声対話を通じて、営業担当者が安全な環境で営業スキルを練習できるプラットフォームを提供します。リアルタイムのフィードバック、詳細な分析レポート、動画分析による包括的な評価を通じて、ユーザーの営業スキル向上を支援します。

## Business Transactions

### 1. シナリオ選択・管理
- **説明**: ユーザーが練習したい営業シナリオを選択・作成・管理する
- **アクター**: 営業担当者、研修担当者
- **フロー**: シナリオ一覧表示 → シナリオ選択/作成 → NPC設定 → ゴール設定

### 2. ロールプレイセッション実行
- **説明**: AIとの音声対話による営業ロールプレイを実行する
- **アクター**: 営業担当者
- **フロー**: セッション開始 → 音声入力 → AI応答生成 → リアルタイム評価 → セッション終了

### 3. リアルタイム評価・フィードバック
- **説明**: ユーザーの発言をリアルタイムで評価し、メトリクスを更新する
- **アクター**: システム（自動）
- **フロー**: 発言分析 → スコア計算 → メトリクス更新 → 感情状態表示

### 4. コンプライアンスチェック
- **説明**: ユーザーの発言がコンプライアンスに違反していないかチェックする
- **アクター**: システム（自動）
- **フロー**: 発言取得 → Guardrails評価 → 違反検出 → 通知表示

### 5. セッション分析・レポート生成
- **説明**: セッション終了後に詳細な分析レポートを生成する
- **アクター**: システム（自動）
- **フロー**: セッションデータ収集 → AI分析 → フィードバック生成 → レポート表示

### 6. 動画分析
- **説明**: セッション中の録画を分析し、視線・表情・身振りを評価する
- **アクター**: システム（自動）
- **フロー**: 動画アップロード → Nova Premiere分析 → スコア生成 → 結果表示

### 7. 参照資料評価（Knowledge Base）
- **説明**: ユーザーの発言がPDF参照資料に準拠しているか評価する
- **アクター**: システム（自動）
- **フロー**: 発言取得 → Knowledge Base検索 → 適切性評価 → 結果表示

### 8. ランキング・進捗管理
- **説明**: ユーザー間の成績比較と個人の成長記録を管理する
- **アクター**: 営業担当者、研修担当者
- **フロー**: スコア集計 → ランキング計算 → 進捗表示

## Business Dictionary

| 用語 | 説明 |
|------|------|
| NPC | Non-Player Character。AIが演じる顧客役のキャラクター |
| シナリオ | 営業ロールプレイの設定（顧客情報、目標、難易度など） |
| セッション | 1回のロールプレイ実行単位 |
| メトリクス | 評価指標（怒りレベル、信頼度、進捗度） |
| ゴール | セッション中に達成すべき目標 |
| Guardrails | Amazon Bedrock Guardrailsによるコンプライアンスチェック機能 |
| Knowledge Base | PDF参照資料を格納したAmazon Bedrock Knowledge Base |
| フィードバック | セッション後に生成される改善提案を含む分析レポート |

## Component Level Business Descriptions

### Frontend (React Application)
- **Purpose**: ユーザーインターフェースを提供し、営業ロールプレイ体験を実現
- **Responsibilities**: 
  - シナリオ選択・管理画面の提供
  - 音声入力・出力の処理
  - リアルタイムメトリクス表示
  - セッション録画・管理
  - 結果・フィードバック表示

### Bedrock Lambda
- **Purpose**: Amazon Bedrockを使用してNPCとの会話を処理
- **Responsibilities**:
  - プロンプト生成・管理
  - LLM呼び出し（Claude 3.5 Haiku）
  - 会話履歴管理
  - セッション・メッセージ保存

### Scoring Lambda
- **Purpose**: ユーザーの発言をリアルタイムで評価
- **Responsibilities**:
  - メトリクス計算（怒り、信頼、進捗）
  - ゴール達成状況評価
  - コンプライアンスチェック
  - 評価結果のDynamoDB保存

### Sessions Lambda
- **Purpose**: セッション履歴とメッセージを管理
- **Responsibilities**:
  - セッション一覧・詳細取得
  - メッセージ履歴管理
  - フィードバック取得
  - Knowledge Base評価連携

### Scenarios Lambda
- **Purpose**: シナリオのCRUD操作を管理
- **Responsibilities**:
  - シナリオ作成・更新・削除
  - PDF資料アップロード
  - 共有設定管理
  - Knowledge Base ingestion

### Videos Lambda
- **Purpose**: 動画分析を実行
- **Responsibilities**:
  - 動画アップロードURL発行
  - Amazon Nova Premiereによる分析
  - 分析結果保存

### Session Analysis Lambda
- **Purpose**: セッション終了後の包括的分析を実行
- **Responsibilities**:
  - フィードバック生成
  - 動画分析連携
  - 参照資料評価
  - Step Functions連携

### Audio Analysis Lambda
- **Purpose**: 音声データの分析を実行
- **Responsibilities**:
  - 音声ファイル処理
  - Transcribe連携
  - 分析結果保存

### Transcribe WebSocket
- **Purpose**: リアルタイム音声認識を提供
- **Responsibilities**:
  - WebSocket接続管理
  - Amazon Transcribe Streaming連携
  - 認識結果配信
