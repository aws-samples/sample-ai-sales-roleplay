# ビルド手順 - 会話画面UI/UXリデザイン

## 前提条件
- Node.js 18.x以上
- npm 9.x以上
- 環境変数: `.env` ファイルが `frontend/` に配置済み

## ビルドステップ

### 1. 依存関係のインストール
```bash
cd frontend
npm install
```

### 2. 型チェック
```bash
cd frontend
npx tsc --noEmit
```

### 3. リントチェック
```bash
cd frontend
npm run lint
```

### 4. プロダクションビルド（型チェック付き）
```bash
cd frontend
npm run build:full
```

### 5. ビルド成功の確認
- `frontend/dist/` ディレクトリにビルド成果物が生成される
- コンソールにエラーが表示されないこと
- ビルドサイズが妥当であること

## 変更ファイル一覧

### 新規作成
- `frontend/src/components/conversation/MetricsOverlay.tsx`
- `frontend/src/components/conversation/ScenarioPanel.tsx`
- `frontend/src/components/conversation/PersonaPanel.tsx`
- `frontend/src/components/conversation/RightPanelContainer.tsx`
- `frontend/src/components/conversation/CoachingHintBar.tsx`
- `frontend/src/components/conversation/AvatarStage.tsx`

### 改修
- `frontend/src/components/conversation/ConversationHeader.tsx`
- `frontend/src/components/compliance/ComplianceAlert.tsx`
- `frontend/src/pages/ConversationPage.tsx`
- `frontend/src/i18n/locales/ja.json`
- `frontend/src/i18n/locales/en.json`

## トラブルシューティング

### 型エラーが発生する場合
- `npx tsc --noEmit` で詳細なエラー箇所を確認
- 新規コンポーネントのProps型定義を確認

### リントエラーが発生する場合
- `npm run lint -- --fix` で自動修正可能なエラーを修正
- i18nキーの不足がないか `npm run validate-i18n` で確認
