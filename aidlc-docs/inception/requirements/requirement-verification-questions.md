# 要件確認質問書

## 概要
Strands AgentのLambdaからBedrock AgentCore Runtimeへの移植、およびAPI認証のBedrock Agent Identity Inbound Authへの置き換えに関する要件を明確化するための質問です。

**回答方法**: 各質問の `[Answer]:` タグの後に、選択肢の記号（A, B, C, D, E）を記入してください。

---

## Q1: 移行対象のLambda関数

現在、Strands Agentsを使用しているLambda関数は以下の2つが確認されています。どの範囲を移行対象としますか？

- A) Bedrock Lambda（NPC会話処理）のみ
- B) Scoring Lambda（リアルタイムスコアリング）のみ
- C) 両方（Bedrock Lambda + Scoring Lambda）
- D) 上記に加えて、他のLambda関数も将来的にAgentCore Runtimeに移行予定
- E) その他（下記に詳細を記載）

[Answer]: D. audioAnalysisも対象。

---

## Q2: 認証方式の移行範囲

現在、API Gateway + Cognito Authorizerで認証しています。Bedrock AgentCore Identity Inbound Authへの移行範囲はどうしますか？

- A) AgentCore Runtimeに移行するエージェントのみInbound Auth適用（他のAPIは現状維持）
- B) 全てのAPIをAgentCore Gateway経由に移行し、統一的にInbound Auth適用
- C) 段階的移行：まずエージェントのみ、後で他APIも検討
- D) その他（下記に詳細を記載）

[Answer]: A

---

## Q3: 既存Cognito User Poolの扱い

現在のCognito User Poolをどのように扱いますか？

- A) 既存Cognito User Poolをそのまま使用（AgentCore IdentityのJWT認証で連携）
- B) 新規にCognito User Poolを作成してAgentCore Identity用に設定
- C) Cognito以外のIdP（Okta、Auth0等）への移行も検討
- D) その他（下記に詳細を記載）

[Answer]: A

---

## Q4: フロントエンドの変更範囲

フロントエンドのAPI呼び出し方法の変更についてどうしますか？

- A) 最小限の変更（エンドポイントURLとAuthorizationヘッダーの変更のみ）
- B) APIクライアントの抽象化レイヤーを追加して将来の変更に備える
- C) 新規APIクライアントクラスを作成してAgentCore Runtime専用の呼び出しロジックを実装
- D) その他（下記に詳細を記載）

※ 注: AgentCore Runtime専用のAmplify SDKは存在しません。既存のCognito認証トークンを使用してHTTPSリクエストで呼び出します。

[Answer]: A

---

## Q5: 移行戦略

移行はどのように進めますか？

- A) ビッグバン移行（一度に全て切り替え）
- B) 段階的移行（新旧並行稼働期間を設ける）
- C) カナリアリリース（一部ユーザーから段階的に移行）
- D) 環境別移行（dev → staging → prod の順で移行）
- E) その他（下記に詳細を記載）

[Answer]: A

---

## Q6: AgentCore Runtimeの機能活用

AgentCore Runtimeの追加機能をどの程度活用しますか？

- A) 最小限（ホスティングと認証のみ）
- B) AgentCore Memoryも活用（セッション状態の永続化）
- C) AgentCore Observabilityも活用（トレーシング、メトリクス）
- D) AgentCore Gateway + Memory + Observability全て活用
- E) その他（下記に詳細を記載）

[Answer]: B,C

---

## Q7: 既存API Gatewayエンドポイントの扱い

移行後、既存のAPI Gatewayエンドポイント（/bedrock/conversation, /scoring/realtime）はどうしますか？

- A) 即座に削除
- B) 一定期間（例：1ヶ月）並行稼働後に削除
- C) 永続的に残す（後方互換性のため）
- D) リダイレクト設定を追加して新エンドポイントに誘導
- E) その他（下記に詳細を記載）

[Answer]: A

---

## Q8: CDK実装方針

AgentCore RuntimeのCDK実装方針はどうしますか？

- A) 既存のInfrastructureStackに追加
- B) 新規にAgentCoreStackを作成して分離
- C) 既存のapi.ts構造を拡張してAgentCore Constructを追加
- D) その他（下記に詳細を記載）

[Answer]: A

---

## Q9: エラーハンドリングとフォールバック

AgentCore Runtime障害時のフォールバック戦略はどうしますか？

- A) フォールバックなし（AgentCore Runtimeの可用性に依存）
- B) 旧Lambda関数をフォールバック先として一定期間維持
- C) エラー時はユーザーにリトライを促すUIを表示
- D) その他（下記に詳細を記載）

[Answer]: A

---

## Q10: 非機能要件の優先度

以下の非機能要件の優先度を教えてください（最も重要なものを選択）

- A) パフォーマンス（レイテンシー最小化）
- B) 可用性（ダウンタイム最小化）
- C) セキュリティ（認証・認可の強化）
- D) コスト最適化
- E) 運用性（監視・デバッグの容易さ）

[Answer]: D

---

## 追加コメント（任意）

上記の質問以外に、移行に関して考慮すべき点や要望があれば記載してください。

```
[追加コメント]:

```

---

**回答完了後**: 全ての質問に回答したら、チャットで「回答完了」とお知らせください。
