# Performance Test Instructions - アバター表示On/Off機能

## 目的
アバター表示On/Off機能がパフォーマンスに悪影響を与えないことを確認する。

## パフォーマンス要件
- アバターOFF時の会話画面初期表示: 既存と同等以下
- アバターON時の会話画面初期表示: 既存と同等（変更なし）
- トグル切り替え時のUI応答: 100ms以内

## テスト観点

### 1. アバターOFF時のリソース節約
- AvatarProvider/AvatarStageがレンダリングされないこと
- three.js関連のリソース（WebGLコンテキスト等）が確保されないこと
- メモリ使用量がアバターON時より低いこと

### 2. 条件分岐のレンダリングパフォーマンス
- `enableAvatar` の条件分岐による追加のレンダリングコストが無視できるレベルであること
- React DevToolsのProfilerで不要な再レンダリングが発生していないこと

## 確認方法
- Chrome DevToolsのPerformanceタブで会話画面の初期表示時間を計測
- React DevToolsのProfilerでコンポーネントのレンダリング回数を確認
- Chrome DevToolsのMemoryタブでアバターON/OFF時のメモリ使用量を比較

## 備考
本機能は既存のアバター表示を条件分岐で制御するのみであり、新たなパフォーマンスリスクは低い。アバターOFF時はむしろリソース節約が期待される。
