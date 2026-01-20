# Integration Test Instructions: AgentCore Runtime Migration

## 概要
AgentCore Runtime移行の統合テスト手順を記載します。

---

## 前提条件

- CDKデプロイ完了
- AgentCore Runtimeが稼働中
- フロントエンドがデプロイ済み

---

## 統合テスト手順

### Step 1: AgentCore Runtime疎通確認

```bash
# NPC会話エージェント
aws bedrock-agentcore invoke-runtime \
  --runtime-arn <NPC_CONVERSATION_RUNTIME_ARN> \
  --payload '{"message": "こんにちは", "sessionId": "test-session"}'

# スコアリングエージェント
aws bedrock-agentcore invoke-runtime \
  --runtime-arn <REALTIME_SCORING_RUNTIME_ARN> \
  --payload '{"message": "テスト", "sessionId": "test-session"}'
```

### Step 2: 評価画面API疎通確認

```bash
# 会話履歴取得
curl -H "Authorization: Bearer <ID_TOKEN>" \
  https://<API_ENDPOINT>/evaluation/test-session/history

# メトリクス取得
curl -H "Authorization: Bearer <ID_TOKEN>" \
  https://<API_ENDPOINT>/evaluation/test-session/metrics
```

### Step 3: E2Eテスト

```bash
cd frontend
npm run test:e2e
```

---

## テストシナリオ

### シナリオ1: NPC会話フロー

1. セッション開始
2. ユーザーメッセージ送信
3. NPC応答受信
4. スコアリング結果確認
5. セッション終了

### シナリオ2: 評価画面表示

1. セッション完了後
2. 評価画面遷移
3. 会話履歴表示確認
4. メトリクスグラフ表示確認
5. フィードバック表示確認

---

## 期待結果

| テスト項目 | 期待結果 |
|-----------|---------|
| NPC応答時間 | 5秒以内 |
| スコアリング時間 | 3秒以内 |
| 評価画面読み込み | 2秒以内 |
| エラー率 | 1%未満 |

---

## 次のステップ

統合テストが成功したら、本番デプロイを検討してください。
