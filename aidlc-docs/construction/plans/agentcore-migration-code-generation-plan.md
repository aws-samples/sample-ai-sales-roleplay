# Code Generation Plan: AgentCore Runtime Migration

## 概要
インフラストラクチャ設計に基づき、AgentCore Runtime移行のコード生成を行います。
本計画は、コード生成の唯一の情報源（Single Source of Truth）です。

---

## ユニットコンテキスト

### 移行対象
| 既存Lambda | 移行先AgentCore Runtime | 機能 |
|-----------|------------------------|------|
| bedrock/index.py | npc-conversation-agent | NPC会話応答生成 |
| scoring/realtime_scoring.py | realtime-scoring-agent | リアルタイムスコアリング |
| sessionAnalysis/feedback_handler.py | feedback-analysis-agent | フィードバック分析 |
| sessionAnalysis/video_handler.py | video-analysis-agent | 動画分析 |
| audioAnalysis/agent/agent.py | audio-analysis-agent | 音声分析 |

### 新規作成
| コンポーネント | 機能 |
|--------------|------|
| evaluation-api Lambda | 評価画面API（AgentCore Memory/S3からデータ取得） |
| AgentCoreService.ts | フロントエンドAgentCore呼び出しサービス |

### 依存関係
- Cognito User Pool（既存）
- S3バケット（既存）
- DynamoDB（シナリオ/NPC - 継続使用）
- Step Functions（更新）

---

## コード生成計画チェックリスト

### Part 1: CDKインフラコード生成

#### Step 1: AgentCore Runtime CDKコンストラクト作成
- [ ] 1.1 `cdk/lib/constructs/agentcore/agentcore-runtime.ts` 作成
  - CfnRuntime L1コンストラクトのラッパー
  - IAMロール設定
  - AgentCore Identity設定（JWT認証）
  - 環境変数設定

#### Step 2: 評価画面API CDKコンストラクト作成
- [ ] 2.1 `cdk/lib/constructs/api/evaluation-api.ts` 作成
  - Lambda関数定義
  - API Gatewayエンドポイント定義
  - IAMロール設定

#### Step 3: InfrastructureStack更新
- [ ] 3.1 `cdk/lib/stacks/infrastructure-stack.ts` 更新
  - AgentCore Runtimeコンストラクト追加
  - 評価画面APIコンストラクト追加
  - 旧Lambda/API Gateway削除
  - DynamoDBテーブル削除（会話履歴、メトリクス）

### Part 2: エージェントコード生成

#### Step 4: NPC会話エージェント作成
- [ ] 4.1 `cdk/agents/npc-conversation/agent.py` 作成
  - BedrockAgentCoreApp エントリーポイント
  - 会話履歴管理（AgentCore Memory）
  - Bedrock Claude 4.5 Haiku呼び出し
  - 感情状態管理

#### Step 5: スコアリングエージェント作成
- [ ] 5.1 `cdk/agents/realtime-scoring/agent.py` 作成
  - BedrockAgentCoreApp エントリーポイント
  - メトリクス計算ロジック
  - ゴール評価ロジック
  - AgentCore Memory保存

#### Step 6: フィードバック分析エージェント作成
- [ ] 6.1 `cdk/agents/feedback-analysis/agent.py` 作成
  - BedrockAgentCoreApp エントリーポイント
  - AgentCore Memory ListEvents呼び出し
  - フィードバック生成ロジック
  - S3保存

#### Step 7: 動画分析エージェント作成
- [ ] 7.1 `cdk/agents/video-analysis/agent.py` 作成
  - BedrockAgentCoreApp エントリーポイント
  - S3動画取得
  - Nova Premiere呼び出し
  - S3結果保存

#### Step 8: 音声分析エージェント作成
- [ ] 8.1 `cdk/agents/audio-analysis/agent.py` 作成
  - BedrockAgentCoreApp エントリーポイント
  - S3音声取得
  - Transcribe/Bedrock呼び出し
  - S3結果保存

### Part 3: 評価画面API Lambda生成

#### Step 9: 評価画面API Lambda作成
- [ ] 9.1 `cdk/lambda/evaluation-api/index.py` 作成
  - GET /evaluation/{sessionId}/history
  - GET /evaluation/{sessionId}/metrics
  - GET /evaluation/{sessionId}/feedback
  - GET /evaluation/{sessionId}/video-analysis
  - AgentCore Memory ListEvents呼び出し
  - S3データ取得

### Part 4: Step Functions更新

#### Step 10: Step Functions定義更新
- [ ] 10.1 `cdk/lib/constructs/session-analysis-stepfunctions.ts` 更新
  - Lambda呼び出し → AgentCore Runtime呼び出しに変更
  - 並列実行設定維持

### Part 5: フロントエンドコード生成

#### Step 11: AgentCoreサービス作成
- [ ] 11.1 `frontend/src/services/AgentCoreService.ts` 作成
  - AgentCore Runtime呼び出しメソッド
  - JWT認証ヘッダー設定
  - エラーハンドリング
  - タイムアウト設定（120秒）

#### Step 12: 既存サービス更新
- [ ] 12.1 `frontend/src/services/ApiService.ts` 更新
  - 評価画面API呼び出しメソッド追加
  - 旧エンドポイント削除

#### Step 13: 会話画面更新
- [ ] 13.1 `frontend/src/pages/SessionPage.tsx` 更新
  - AgentCoreService呼び出しに変更
  - エラーハンドリング更新

#### Step 14: 評価画面更新
- [ ] 14.1 `frontend/src/pages/ResultPage.tsx` 更新
  - 新規評価画面API呼び出しに変更
  - データ取得ロジック更新

### Part 6: 環境設定更新

#### Step 15: 環境変数設定
- [ ] 15.1 `frontend/.env.*` 更新
  - AgentCore Runtime ARN追加
- [ ] 15.2 `cdk/.env.*` 更新
  - AgentCore設定追加

### Part 7: 旧コード削除

#### Step 16: 旧Lambdaコード削除
- [ ] 16.1 `cdk/lambda/bedrock/` 削除
- [ ] 16.2 `cdk/lambda/scoring/` 削除
- [ ] 16.3 `cdk/lambda/sessionAnalysis/` 削除
- [ ] 16.4 `cdk/lambda/audioAnalysis/` 削除

### Part 8: ドキュメント生成

#### Step 17: README更新
- [ ] 17.1 `cdk/README.md` 更新
  - AgentCore Runtime説明追加
  - デプロイ手順更新

---

## 生成ファイル一覧

### CDKインフラ
| ファイル | 操作 |
|---------|------|
| `cdk/lib/constructs/agentcore/agentcore-runtime.ts` | 新規作成 |
| `cdk/lib/constructs/api/evaluation-api.ts` | 新規作成 |
| `cdk/lib/stacks/infrastructure-stack.ts` | 更新 |
| `cdk/lib/constructs/session-analysis-stepfunctions.ts` | 更新 |

### エージェントコード
| ファイル | 操作 |
|---------|------|
| `cdk/agents/npc-conversation/agent.py` | 新規作成 |
| `cdk/agents/npc-conversation/requirements.txt` | 新規作成 |
| `cdk/agents/realtime-scoring/agent.py` | 新規作成 |
| `cdk/agents/realtime-scoring/requirements.txt` | 新規作成 |
| `cdk/agents/feedback-analysis/agent.py` | 新規作成 |
| `cdk/agents/feedback-analysis/requirements.txt` | 新規作成 |
| `cdk/agents/video-analysis/agent.py` | 新規作成 |
| `cdk/agents/video-analysis/requirements.txt` | 新規作成 |
| `cdk/agents/audio-analysis/agent.py` | 新規作成 |
| `cdk/agents/audio-analysis/requirements.txt` | 新規作成 |

### Lambda
| ファイル | 操作 |
|---------|------|
| `cdk/lambda/evaluation-api/index.py` | 新規作成 |
| `cdk/lambda/evaluation-api/requirements.txt` | 新規作成 |

### フロントエンド
| ファイル | 操作 |
|---------|------|
| `frontend/src/services/AgentCoreService.ts` | 新規作成 |
| `frontend/src/services/ApiService.ts` | 更新 |
| `frontend/src/pages/SessionPage.tsx` | 更新 |
| `frontend/src/pages/ResultPage.tsx` | 更新 |

### 削除対象
| ファイル | 操作 |
|---------|------|
| `cdk/lambda/bedrock/*` | 削除 |
| `cdk/lambda/scoring/*` | 削除 |
| `cdk/lambda/sessionAnalysis/*` | 削除 |
| `cdk/lambda/audioAnalysis/*` | 削除 |

---

## 実行順序

1. **CDKインフラコード** (Step 1-3) - 基盤となるインフラ定義
2. **エージェントコード** (Step 4-8) - AgentCore Runtime用エージェント
3. **評価画面API** (Step 9) - 新規Lambda
4. **Step Functions** (Step 10) - ワークフロー更新
5. **フロントエンド** (Step 11-14) - UI/サービス更新
6. **環境設定** (Step 15) - 環境変数
7. **旧コード削除** (Step 16) - クリーンアップ
8. **ドキュメント** (Step 17) - README更新

---

## 注意事項

- **CDKビルド禁止**: `npm run build`は実行しない
- **テスト実行**: Build and Testステージで実施
- **段階的実装**: 各Stepを順番に実行
- **チェックボックス更新**: 完了後即座に[x]に更新

---

**作成日**: 2026-01-08
**ステータス**: 承認待ち
