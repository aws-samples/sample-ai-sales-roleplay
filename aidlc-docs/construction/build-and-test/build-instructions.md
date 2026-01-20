# Build Instructions: AgentCore Runtime Migration

## 概要
AgentCore Runtime移行のビルド手順を記載します。

---

## 前提条件

- Node.js 22+
- Python 3.9+
- AWS CLI 2+ (設定済み)
- AWS CDK 2+

---

## ビルド手順

### Step 1: 依存関係インストール

```bash
# CDK依存関係
cd cdk
npm install

# フロントエンド依存関係
cd ../frontend
npm install
```

### Step 2: TypeScript型チェック（CDK）

```bash
cd cdk
npx tsc --noEmit
```

**注意**: `npm run build`は実行禁止です。

### Step 3: CDK Synth（テンプレート生成）

```bash
cd cdk
npm run synth:dev
```

### Step 4: フロントエンドビルド

```bash
cd frontend
npm run build:full
```

### Step 5: Lint実行

```bash
# CDK
cd cdk
npm run lint

# フロントエンド
cd ../frontend
npm run lint
```

---

## 段階的統合手順

### Phase 1: AgentCore Runtime CDKコンストラクト検証

1. `cdk/lib/constructs/agentcore/agentcore-runtime.ts`の型チェック
2. `cdk/lib/constructs/agentcore/index.ts`のエクスポート確認

### Phase 2: InfrastructureStack統合

1. `cdk/lib/infrastructure-stack.ts`にAgentCoreRuntimeをインポート
2. 各エージェント用のAgentCoreRuntimeインスタンスを作成
3. 既存のApiコンストラクトとの依存関係を確認

### Phase 3: Step Functions更新

1. `cdk/lib/constructs/session-analysis-stepfunctions.ts`を更新
2. Lambda呼び出しをAgentCore Runtime呼び出しに変更

### Phase 4: フロントエンド統合

1. `AgentCoreService.ts`の型チェック
2. 既存サービスとの統合テスト

---

## トラブルシューティング

### CfnRuntime型エラー

```
Property 'CfnRuntime' does not exist on type 'typeof import("aws-cdk-lib/aws-bedrockagentcore")'
```

**解決策**: AWS CDKバージョンを確認し、最新版にアップデート

```bash
npm update aws-cdk-lib
```

### AgentCore Memory API未対応

AgentCore Memory APIがまだSDKに含まれていない場合、S3フォールバックを使用します。

---

## 次のステップ

ビルドが成功したら、`unit-test-instructions.md`に従ってテストを実行してください。
