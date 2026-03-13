# VRMアップロード + Polly音声モデル選択 - 要件確認質問

以下の質問に回答してください。各質問の[Answer]:タグの後に選択肢の文字を記入してください。
選択肢に合うものがない場合は、最後の選択肢（Other）を選び、[Answer]:タグの後に詳細を記述してください。

---

## Question 1
VRMアップロード機能のUI配置場所はどこにしますか？

A) シナリオ作成/編集画面のNPC設定ステップ内にアバター選択＋アップロードUIを配置
B) 独立したアバター管理画面（/avatars）を新規作成し、シナリオ作成画面からはアバター選択のみ
C) 両方（独立管理画面 + シナリオ作成画面からもアップロード可能）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2
Polly音声モデル選択のUI配置場所はどこにしますか？（ユーザー決定済み: シナリオのNPC設定に紐付け）

A) シナリオ作成/編集画面のNPC設定ステップにドロップダウンで音声モデルを選択
B) シナリオ作成/編集画面に「音声設定」という新しいステップを追加
C) NPC設定ステップ内に「音声プレビュー」ボタン付きで選択（選択時にサンプル音声を再生可能）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 3
音声モデル未選択時のデフォルト動作はどうしますか？

A) 現在と同じ動作を維持（日本語: Takumi、英語: Matthew）
B) シナリオの言語に応じて最初のneuralモデルを自動選択
C) 音声モデルの選択を必須にする（未選択ではシナリオ保存不可）
D) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 4
音声モデルのデータ保存先はどこにしますか？

A) シナリオテーブル（DynamoDB）のnpcInfoフィールドにvoiceIdを追加
B) シナリオテーブルにトップレベルのvoiceIdフィールドを追加
C) NPC情報を別テーブルに分離し、そこにvoiceIdを保存
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 5
VRMアップロード時のサムネイル画像はどうしますか？（Phase 3要件P3-FR-019参照）

A) サムネイル画像の手動アップロードのみ対応（VRMと一緒にアップロード）
B) サムネイルなし（アバター名のみで一覧表示）
C) デフォルトのプレースホルダー画像を使用し、将来的に自動生成を検討
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 6
VRMファイルの配信方法はどうしますか？

A) 既存のCloudFrontディストリビューションにS3オリジンを追加
B) 新規CloudFrontディストリビューションを作成
C) S3署名付きURLで直接配信（CloudFrontなし）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 7
アバター削除時の動作はどうしますか？

A) 物理削除（S3 + DynamoDBから完全削除）。使用中のシナリオがある場合はエラー
B) 物理削除。使用中のシナリオは自動的にデフォルトアバターにフォールバック
C) 論理削除（削除フラグ）。使用中のシナリオには影響なし
D) Other (please describe after [Answer]: tag below)

[Answer]: A. シナリオ間でアバターは共有しない前提とします。

---

## Question 8
音声モデルの選択UIで、エンジン種別（neural/generative）をどのように表示しますか？

A) エンジン種別でグループ分けして表示（例: 「Generative」セクション、「Neural」セクション）
B) フラットなリストで表示し、エンジン種別はバッジやラベルで表示
C) エンジン種別は非表示にし、音声名と性別のみ表示（バックエンドで適切なエンジンを自動選択）
D) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 9
現在のアプリケーションでは日本語と英語のみサポートしていますが、音声モデル選択で対応する言語範囲はどうしますか？

A) 現在サポートしている言語のみ（日本語 + 英語）のモデルを選択可能にする
B) Pollyが対応する全言語のモデルを選択可能にする（将来の多言語対応を見据えて）
C) 現在の言語 + 主要言語（中国語、韓国語、フランス語、ドイツ語、スペイン語等）を追加
D) Other (please describe after [Answer]: tag below)

[Answer]: A

