# NFR要件定義書: AgentCore Runtime Migration

## 1. パフォーマンス要件

### 1.1 レスポンスタイム
| 項目 | 要件 | 備考 |
|-----|------|------|
| NPC会話応答 | 現状維持（Lambda同等） | ストリーミング対応 |
| スコアリング | 現状維持（Lambda同等） | 非同期処理可 |
| 音声分析 | 現状維持（Lambda同等） | バッチ処理可 |

### 1.2 コールドスタート
- **許容度**: 特に制限なし
- **Provisioned Concurrency**: 不要
- **理由**: コスト最適化優先、小規模利用想定

### 1.3 スループット
- **同時セッション数**: 10未満（小規模）
- **ピーク時想定**: 通常の2倍程度

---

## 2. スケーラビリティ要件

### 2.1 スケーリング戦略
| 項目 | 設定 |
|-----|------|
| スケーリング方式 | AgentCore Runtime自動スケーリング |
| 最小インスタンス | 0（コスト最適化） |
| 最大インスタンス | AgentCore Runtimeデフォルト |

### 2.2 負荷対応
- **通常負荷**: 同時10セッション未満
- **ピーク負荷**: AgentCore Runtimeの自動スケーリングに依存
- **スケールダウン**: アイドル時は0にスケールダウン

---

## 3. 可用性要件

### 3.1 可用性目標
| 項目 | 目標 |
|-----|------|
| 可用性SLA | AgentCore Runtime SLAに依存 |
| 計画停止 | CDKデプロイ時のみ |
| 障害復旧 | 自動（AgentCore Runtime管理） |

### 3.2 障害時動作
- **フォールバック**: なし（AgentCore Runtime可用性に依存）
- **エラーハンドリング**: フロントエンドでリトライUI表示
- **通知**: CloudWatchアラーム（基本メトリクス）

---

## 4. セキュリティ要件

### 4.1 認証・認可
| 項目 | 実装 |
|-----|------|
| 認証方式 | Cognito JWT（Inbound Auth） |
| トークン検証 | AgentCore Identity |
| ユーザー識別 | JWT claims（sub, email） |

### 4.2 データ保護
| 項目 | 実装 |
|-----|------|
| 転送時暗号化 | TLS 1.2+ |
| 保存時暗号化 | AgentCore Memory暗号化 |
| セッション分離 | マイクロVM分離 |

### 4.3 アクセス制御
- **IAMロール**: 最小権限の原則
- **リソースポリシー**: AgentCore Runtime専用
- **監査ログ**: CloudTrail統合

---

## 5. 運用性要件

### 5.1 監視
| 項目 | 実装 |
|-----|------|
| メトリクス | 基本メトリクスのみ（呼び出し回数、エラー率） |
| ダッシュボード | CloudWatch基本ダッシュボード |
| アラーム | エラー率閾値超過時 |

### 5.2 ログ
| 項目 | 設定 |
|-----|------|
| ログ出力 | CloudWatch Logs |
| 保持期間 | 30日間 |
| ログレベル | INFO（本番）、DEBUG（開発） |

### 5.3 トレーシング
- **実装**: AgentCore Observability基本機能
- **詳細トレーシング**: 不要（コスト最適化）
- **X-Ray統合**: 基本レベル

---

## 6. コスト要件

### 6.1 コスト最適化戦略
| 項目 | 方針 |
|-----|------|
| 優先度 | コスト最優先 |
| Provisioned Concurrency | 使用しない |
| アイドル時 | 0スケールダウン |

### 6.2 コスト監視
- **予算アラート**: AWS Budgets設定
- **コスト配分タグ**: 環境別（dev/staging/prod）
- **月次レビュー**: コストレポート確認

### 6.3 コスト見積もり
| 項目 | 想定 |
|-----|------|
| AgentCore Runtime | 従量課金（呼び出し回数ベース） |
| AgentCore Memory | セッション数 × 保存期間 |
| CloudWatch Logs | 30日保持 |

---

## 7. AgentCore固有要件

### 7.1 AgentCore Memory（統合データストア）
| 項目 | 設定 |
|-----|------|
| 活用範囲 | 全セッションデータの統合管理 |
| 保存データ | 会話履歴、メトリクス履歴、ゴール状態、セッションメタデータ |
| 保存期間 | 365日間（Short-Term Memory） |
| クロスエージェントアクセス | ListEvents APIで全エージェントがデータ参照可能 |
| 料金 | $0.25 / 1,000イベント |

### 7.2 データストレージ戦略（AgentCoreネイティブ）
| データ種別 | 保存先 | 理由 |
|-----------|--------|------|
| 会話履歴 | AgentCore Memory | 統合管理、エージェント間共有 |
| リアルタイムメトリクス | AgentCore Memory | セッション状態の一元管理 |
| ゴール達成状況 | AgentCore Memory | エージェント間で参照 |
| セッションメタデータ | AgentCore Memory | 統合管理 |
| フィードバック分析結果 | S3 (JSON) | 大容量データ、長期保存 |
| 動画分析結果 | S3 (JSON) | 大容量データ |
| リファレンスチェック結果 | S3 (JSON) | 大容量データ |

### 7.3 DynamoDB移行計画
| 項目 | 対応 |
|-----|------|
| 既存DynamoDBテーブル | 段階的に廃止 |
| 会話履歴テーブル | AgentCore Memoryに移行 |
| セッションテーブル | AgentCore Memoryに移行 |
| メトリクステーブル | AgentCore Memoryに移行 |
| シナリオテーブル | 継続使用（マスタデータ） |
| NPCテーブル | 継続使用（マスタデータ） |

### 7.4 新規API設計
| エンドポイント | 機能 | データソース |
|---------------|------|-------------|
| GET /sessions/{id}/history | 会話履歴取得 | AgentCore Memory ListEvents |
| GET /sessions/{id}/metrics | メトリクス履歴取得 | AgentCore Memory ListEvents |
| GET /sessions/{id}/feedback | フィードバック取得 | S3 |
| GET /sessions/{id}/video-analysis | 動画分析結果取得 | S3 |

**決定根拠**:
- データ管理の一元化によるシンプルさ
- DynamoDBコスト削減
- AgentCore機能のフル活用
- 長期運用を見据えた設計

### 7.5 AgentCore Observability
| 項目 | 設定 |
|-----|------|
| メトリクス | 基本メトリクスのみ |
| トレーシング | 基本レベル |
| カスタムメトリクス | 不要 |

### 7.6 AgentCore Identity（Inbound Auth）
| 項目 | 設定 |
|-----|------|
| 認証方式 | Custom JWT Authorizer |
| IdP | 既存Cognito User Pool |
| トークン種別 | ID Token |
| 適用範囲 | **フロントエンドから直接呼ばれるエージェントのみ** |

#### 7.6.1 AgentCore Identity適用対象
| Lambda | 呼び出し元 | AgentCore Identity |
|--------|-----------|-------------------|
| `bedrock/index.py` | フロントエンド直接（API Gateway） | **必要** |
| `scoring/realtime_scoring.py` | フロントエンド直接（API Gateway） | **必要** |
| `sessionAnalysis/feedback_handler.py` | Step Functions | 不要（IAMロール認証） |
| `sessionAnalysis/reference_handler.py` | Step Functions | 不要（IAMロール認証） |
| `sessionAnalysis/video_handler.py` | Step Functions | 不要（IAMロール認証） |
| `audioAnalysis/agent/agent.py` | Step Functions | 不要（IAMロール認証） |

**決定根拠**:
- Step Functions内のLambdaはIAMロールで認証されるため、Inbound Auth不要
- フロントエンドから直接呼ばれるエージェントのみCognito JWT認証が必要
- 認証オーバーヘッドの最小化

---

## 8. 制約事項

### 8.1 技術的制約
- CDKデプロイ必須（CLI/コンソール操作禁止）
- 既存Cognito User Pool継続使用
- Strands Agents SDK継続使用

### 8.2 運用制約
- フォールバック機構なし
- 旧Lambda/API Gateway即時削除

---

**作成日**: 2026-01-08
**バージョン**: 1.0
