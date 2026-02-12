# Phase 3（拡張実装）要件確認質問

Phase 3のスコープを明確にするための質問です。各質問の[Answer]:タグの後に回答（A, B, C等）を記入してください。

---

## Question 1
Phase 3で「より豊かなアニメーション」として、どの機能を実装しますか？

A) ジェスチャーアニメーション（うなずき、首かしげ、手振り等のボディランゲージ）
B) 感情トランジションの高度化（感情変化時のアニメーション演出、表情の微細な変化）
C) アイドルモーションの多様化（待機中の姿勢変化、視線移動、体の揺れ）
D) A + B + C すべて
E) Other (please describe after [Answer]: tag below)

[Answer]: D（A+B+Cすべて。ただし手振りは除外。うなずき・首かしげのみ）

## Question 2
「アバターカスタマイズ機能」のスコープはどこまでですか？

A) シナリオ管理画面でのアバター選択UI改善のみ（サムネイル表示、プレビュー機能）
B) 管理者がVRMファイルをアップロードしてアバターを追加できる機能
C) ユーザーがアバターの外見（髪色、服装等）をパラメータで調整できる機能
D) A + B（選択UI改善 + アップロード機能）
E) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 3
モバイル対応のスコープはどこまでですか？

A) レスポンシブレイアウト対応のみ（3Dアバター表示サイズの自動調整）
B) モバイルブラウザでのWebGL最適化（低解像度レンダリング、LOD対応）
C) タッチ操作対応（ピンチズーム、スワイプでアバター回転等）
D) A + B + C すべて
E) Phase 3ではモバイル対応をスキップする
F) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4
アバターのジェスチャーアニメーション（Question 1でA選択時）の実装方式はどうしますか？

A) プロシージャルアニメーション（コードで生成、現在の瞬き・呼吸と同じ方式）
B) VRMアニメーションファイル（.vrma）を使用したプリセットアニメーション
C) AI応答のコンテキストに基づいて動的にジェスチャーを選択する方式
D) A + C（プロシージャル生成 + AI連動）
E) Other (please describe after [Answer]: tag below)

[Answer]: D（プロシージャル生成 + AI連動。うなずき・首かしげはAI駆動、視線移動・体の揺れ・姿勢変化はプロシージャル）

## Question 5
VRMファイルアップロード機能（Question 2でBまたはD選択時）のストレージはどうしますか？

A) 既存のS3バケットに保存し、CloudFront経由で配信
B) 現在のfrontend/public/models/avatars/に手動配置のまま（アップロード機能なし）
C) S3 + DynamoDBでアバターメタデータを管理
D) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 6
Phase 3の優先度が最も高い機能はどれですか？

A) ジェスチャーアニメーション（没入感向上）
B) アバターカスタマイズ/アップロード機能（運用性向上）
C) モバイル対応（アクセシビリティ向上）
D) 感情表現の高度化（表現力向上）
E) Other (please describe after [Answer]: tag below)

[Answer]: A,B,C
