# Performance Test Instructions - 3Dアバター機能 Phase 2

## パフォーマンス要件
- フレームレート: 30fps以上（visemeリップシンク動作中含む）
- VRMロード時間: 5秒以内
- アバター切り替え時間: 5秒以内（モデルリロード含む）
- メモリ使用量: 200MB以下（アバター部分）
- CPU使用率: 30%以下（アイドル時）
- Visemeレイテンシー: 音声再生との同期ずれ100ms以内
- Speech Marks API追加レイテンシー: 500ms以内（並列実行）

## Phase 2 追加テスト項目

### 1. Visemeリップシンクのフレームレート影響
- テスト内容: visemeベースリップシンク動作中のフレームレート
- 手順: テストページで「こんにちは」再生中にFPSを計測
- 目標: 30fps以上を維持

### 2. アバター切り替え時間
- テスト内容: アバター切り替え時のモデルリロード時間
- 手順: テストページでアバターを切り替え、ローディング完了までの時間を計測
- 目標: 5秒以内

### 3. Speech Marks API追加レイテンシー
- テスト内容: Speech Marks取得による音声合成の追加遅延
- 手順: CloudWatch LogsでTextToSpeech Lambdaの実行時間を確認
- 目標: 並列実行により追加レイテンシー500ms以内

### 4. メモリリーク確認（アバター切り替え）
- テスト内容: アバター切り替えを繰り返した際のメモリリーク
- 手順: テストページでアバターを10回切り替え、メモリ使用量を確認
- 目標: メモリ使用量が安定（増加し続けない）

## テスト手順

### フレームレート測定（Chrome DevTools Console）
```javascript
let frameCount = 0;
let lastTime = performance.now();
function measureFPS() {
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    console.log('FPS: ' + frameCount);
    frameCount = 0;
    lastTime = now;
  }
  requestAnimationFrame(measureFPS);
}
measureFPS();
```

### パフォーマンスプロファイリング
1. Chrome DevToolsを開く
2. Performanceタブを選択
3. 記録を開始
4. テストページでPhase 2機能を操作
5. 30秒間操作
6. 記録を停止して結果を分析

### 結果記録テンプレート
| 項目 | 目標 | 実測値 | 判定 |
|------|------|--------|------|
| フレームレート（通常） | 30fps以上 | - | - |
| フレームレート（viseme中） | 30fps以上 | - | - |
| VRMロード時間 | 5秒以内 | - | - |
| アバター切り替え時間 | 5秒以内 | - | - |
| メモリ使用量 | 200MB以下 | - | - |
| CPU使用率（アイドル） | 30%以下 | - | - |
| Speech Marks追加レイテンシー | 500ms以内 | - | - |

## 最適化のヒント

### Visemeリップシンクが重い場合
- MOUTH_TRANSITION_SPEEDの値を調整（現在12.0）
- visemeデータの間引き処理を追加

### アバター切り替えが遅い場合
- VRMファイルのプリロードを実装
- モデルキャッシュの導入を検討

### Speech Marks APIが遅い場合
- 音声合成とSpeech Marks取得の並列実行を確認
- Lambda関数のメモリ割り当てを増加
