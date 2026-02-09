# 統合テスト手順

## 目的
会話画面の新レイアウトが既存のAPIサービス・状態管理と正しく連携することを確認する。

## テストシナリオ

### シナリオ1: セッション開始フロー
- ConversationPage → startConversation → API呼び出し → AvatarStage表示
- MetricsOverlay・RightPanelContainer が sessionStarted 後に表示されること
- VideoManager がセッション開始後に録画を開始すること

### シナリオ2: メッセージ送受信フロー
- MessageInput → sendMessage → API応答 → MessageList更新
- CoachingHintBar が currentMetrics.analysis を表示すること
- MetricsOverlay がリアルタイム評価結果を反映すること

### シナリオ3: パネルトグル操作
- 📋ボタン → RightPanelContainer の表示/非表示切り替え
- 📊ボタン → MetricsOverlay の表示/非表示切り替え
- 🔊ボタン → AudioSettingsPanel モーダル表示

### シナリオ4: コンプライアンス違反通知
- API評価結果に違反情報 → ComplianceAlert がヘッダー下にスライドイン
- 8秒後に自動非表示 or 閉じるボタンで非表示

### シナリオ5: セッション終了フロー
- セッション終了ボタン → endSession → 録画アップロード待機 → 結果ページ遷移
- セッション終了ボタンが sessionStarted 時に常に表示されること

## 手動統合テスト手順

### 1. 開発サーバー起動
```bash
cd frontend
npm run dev
```

### 2. テスト実行
1. シナリオ選択画面からシナリオを選択
2. カメラ許可 → 「商談を開始」ボタンクリック
3. アバターが中央に大きく表示されることを確認
4. チャットログが下部にコンパクト表示されることを確認
5. メトリクスオーバーレイが左上に表示されることを確認
6. 右側パネル（ゴール・シナリオ・ペルソナ）が表示されることを確認
7. メッセージを送信し、NPC応答を確認
8. 📋📊🔊ボタンの動作を確認
9. チャットログクリックで展開/折りたたみを確認
10. セッション終了ボタンで結果ページに遷移することを確認

## 注意事項
- バックエンドAPI（Lambda）が稼働している環境で実行すること
- Cognito認証が必要なため、テストユーザーでログインすること
- WebSocket接続（Transcribe）はオプション（接続失敗しても会話は続行可能）
