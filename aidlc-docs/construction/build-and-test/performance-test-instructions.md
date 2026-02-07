# Performance Test Instructions - 3Dアバター機能 Phase 3（拡張実装）

## 目的
Phase 3で追加されたアニメーション・アバター管理機能のパフォーマンスを検証する。

## パフォーマンス要件

| 項目 | 目標値 |
|------|--------|
| フレームレート（アイドルモーション中） | 30fps以上 |
| フレームレート（ジェスチャー実行中） | 25fps以上 |
| ジェスチャー応答時間 | 200ms以下（gesture受信→アニメーション開始） |
| 感情トランジション時間 | 300-800ms（感情種類による） |
| VRMアップロード時間（10MB） | 10秒以下 |
| アバター一覧取得時間 | 2秒以下 |
| アバター切り替え時間 | 5秒以下 |

## テスト手順

### 1. フレームレートテスト
```javascript
// DevTools Consoleで実行
let frames = 0;
let lastTime = performance.now();
function countFrames() {
  frames++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    console.log(`FPS: ${frames}`);
    frames = 0;
    lastTime = now;
  }
  requestAnimationFrame(countFrames);
}
countFrames();
```
- アイドルモーション中: 30fps以上を確認
- ジェスチャー実行中: 25fps以上を確認
- 感情トランジション中: 25fps以上を確認

### 2. ジェスチャー応答時間テスト
- DevTools Networkでリアルタイム評価APIのレスポンスタイミングを記録
- アバターのアニメーション開始タイミングを目視確認
- 差分が200ms以下であることを確認

### 3. アバターアップロードパフォーマンス
- 10MBのVRMファイルでアップロード時間を計測
- S3署名付きURLの取得時間を確認（1秒以下）
- ファイルアップロード時間を確認（ネットワーク速度依存）

### 4. メモリ使用量テスト
- DevTools Memory タブでヒープスナップショットを取得
- セッション開始前後のメモリ増加量を確認
- アバター切り替え時のメモリリークがないことを確認
- 長時間セッション（10分以上）でメモリが安定していることを確認

## パフォーマンス最適化のポイント
- AnimationController: requestAnimationFrameベースの更新
- ExpressionController: 感情変化時のみ更新処理実行
- アイドルモーション: 発話中・ジェスチャー中は抑制
- VRMモデル: キャッシュによる再ロード防止
