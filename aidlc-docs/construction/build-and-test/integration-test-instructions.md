# Integration Test Instructions - アバター表示On/Off機能

## 目的
フロントエンドとバックエンド間の `enableAvatar` フィールドの連携を検証する。

## テストシナリオ

### シナリオ1: シナリオ作成 → 会話画面（アバターON）
1. シナリオ作成画面でアバタートグルをONにする
2. VRMファイルをアップロードする
3. シナリオを保存する
4. 作成したシナリオの会話画面を開く
5. **期待結果**: AvatarStageが表示され、アップロードしたVRMアバターが表示される

### シナリオ2: シナリオ作成 → 会話画面（アバターOFF）
1. シナリオ作成画面でアバタートグルをOFFにする
2. シナリオを保存する
3. 作成したシナリオの会話画面を開く
4. **期待結果**: AvatarStageが非表示、チャットログが全画面に拡張される

### シナリオ3: シナリオ編集でアバターON→OFF切り替え
1. アバターONのシナリオを編集画面で開く
2. アバタートグルをOFFに切り替える
3. **期待結果**: VRMアップロードUIが非表示になり、アバターファイル情報がクリアされる
4. シナリオを保存する
5. 会話画面を開く
6. **期待結果**: AvatarStageが非表示

### シナリオ4: 既存シナリオ（enableAvatar未設定）の後方互換性
1. `enableAvatar` フィールドが未設定の既存シナリオを会話画面で開く
2. **期待結果**: アバターが非表示（`false` として扱われる）
3. 同シナリオを編集画面で開く
4. **期待結果**: アバタートグルがOFF状態で表示される

## API連携テスト

### DynamoDB保存確認
```bash
# シナリオ作成後にDynamoDBのenableAvatarフィールドを確認
aws dynamodb get-item --table-name [テーブル名] --key '{"scenarioId": {"S": "[シナリオID]"}}' --query 'Item.enableAvatar'
```

### API レスポンス確認
- GET `/scenarios/{id}` のレスポンスに `enableAvatar` フィールドが含まれること
- POST `/scenarios` のリクエストボディに `enableAvatar` が正しく送信されること
- PUT `/scenarios/{id}` のリクエストボディに `enableAvatar` が正しく送信されること
