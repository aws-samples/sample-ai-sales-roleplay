# Unit Test Instructions: AgentCore Runtime Migration

## 概要
AgentCore Runtime移行のユニットテスト手順を記載します。

---

## テスト実行手順

### CDKテスト

```bash
cd cdk
npm run test
```

### フロントエンドテスト

```bash
cd frontend
npm run test
```

---

## テスト対象

### CDKコンストラクト

| ファイル | テスト内容 |
|---------|----------|
| `agentcore-runtime.ts` | CfnRuntime作成、IAMロール設定 |
| `evaluation-api.ts` | Lambda作成、API Gateway設定 |

### エージェントコード

| ファイル | テスト内容 |
|---------|----------|
| `npc-conversation/agent.py` | 会話生成ロジック |
| `realtime-scoring/agent.py` | スコアリングロジック |
| `feedback-analysis/agent.py` | フィードバック生成 |
| `video-analysis/agent.py` | 動画分析 |
| `audio-analysis/agent.py` | 音声分析 |

### フロントエンド

| ファイル | テスト内容 |
|---------|----------|
| `AgentCoreService.ts` | API呼び出し、エラーハンドリング |

---

## テストカバレッジ

```bash
# フロントエンド
cd frontend
npm run test:coverage
```

---

## 次のステップ

ユニットテストが成功したら、`integration-test-instructions.md`に従って統合テストを実行してください。
