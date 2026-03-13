# Build Instructions - アバター表示On/Off機能

## Prerequisites
- Node.js 18.x以上
- Python 3.9以上
- npm（フロントエンド依存関係管理）

## Build Steps

### 1. フロントエンド依存関係インストール
```bash
cd frontend
npm install
```

### 2. フロントエンドビルド（型チェック付き）
```bash
cd frontend
npm run build:full
```

### 3. フロントエンドリント
```bash
cd frontend
npm run lint
```

### 4. ビルド成功の確認
- `frontend/dist/` ディレクトリにビルド成果物が生成されること
- TypeScript型エラーが0件であること
- ESLintエラーが0件であること

## バックエンド（Lambda）
- Lambda関数はPythonで記述されており、CDKデプロイ時に自動的にパッケージングされる
- `cdk/lambda/scenarios/index.py` の変更はCDKデプロイで反映される

### CDKデプロイ（開発環境）
```bash
cd cdk
npm run deploy:dev
```

## Troubleshooting

### TypeScript型エラー
- `enableAvatar?: boolean` が `ScenarioInfo` と `Scenario` 型に追加されていることを確認
- `NPCInfoStepProps` に `enableAvatar` と `onEnableAvatarChange` が追加されていることを確認

### i18nキー未定義エラー
- `frontend/src/i18n/locales/ja.json` と `en.json` に `enableToggle` と `enableToggleHelp` キーが追加されていることを確認
