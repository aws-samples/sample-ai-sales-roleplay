# パフォーマンステスト手順

## 目的
新レイアウトがパフォーマンス要件（NFR-1）を満たすことを確認する。

## パフォーマンス要件
- レイアウト遷移: CSS transition 0.5s以内
- メトリクス更新: 画面反映 100ms以内
- チャットログ展開/折りたたみ: 300ms以内
- パネルトグル: 即座に反映（16ms以内）
- 不要な再レンダリング: なし

## テスト項目

### 1. レンダリングパフォーマンス
- React DevTools Profiler でコンポーネントのレンダリング時間を計測
- ConversationPage の再レンダリング回数を確認
- メトリクス更新時に AvatarStage が不要に再レンダリングされないこと

### 2. CSS アニメーションパフォーマンス
- Chrome DevTools Performance タブで以下を確認:
  - MetricsOverlay のプログレスバー transition
  - CoachingHintBar のフェードインアニメーション
  - ComplianceAlert のスライドダウンアニメーション
  - チャットログの max-height transition
- Layout Shift が発生しないこと

### 3. prefers-reduced-motion 対応
- OS設定で「視差効果を減らす」を有効にした状態で確認
- すべてのアニメーションが無効化されること

## テスト手順

### React DevTools Profiler
1. React DevTools をインストール
2. Profiler タブを開く
3. 録画開始 → メッセージ送受信 → 録画停止
4. コンポーネントごとのレンダリング時間を確認

### Chrome Performance
1. DevTools → Performance タブ
2. 録画開始 → パネルトグル・チャットログ展開 → 録画停止
3. フレームレートが60fps を維持していることを確認
4. Long Task（50ms超）がないことを確認

## 合格基準
- 全コンポーネントのレンダリング: 16ms以内
- CSS transition: ジャンクなし（60fps維持）
- prefers-reduced-motion: 全アニメーション無効化
