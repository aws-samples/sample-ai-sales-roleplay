# Unit Test Execution - アバター表示On/Off機能

## フロントエンドユニットテスト実行

### 1. 全テスト実行
```bash
cd frontend
npm run test
```

### 2. カバレッジ付きテスト
```bash
cd frontend
npm run test:coverage
```

### 3. 変更ファイルに関連するテスト
```bash
cd frontend
npx jest --testPathPattern="NPCInfoStep|ScenarioCreatePage|ScenarioEditPage|ConversationPage" --passWithNoTests
```

### 4. テスト結果の確認
- 既存テストが全てパスすること
- 新規追加コードによる既存テストの破壊がないこと

## テスト観点

### NPCInfoStep
- `enableAvatar` が `true` の場合、VRMアップロードUIが表示されること
- `enableAvatar` が `false` の場合、VRMアップロードUIが非表示になること
- トグルスイッチの切り替えで `onEnableAvatarChange` が呼ばれること

### ScenarioCreatePage
- `enableAvatar` のデフォルト値が `true` であること
- シナリオ作成APIリクエストに `enableAvatar` が含まれること

### ScenarioEditPage
- シナリオ読み込み時に `enableAvatar` が正しく復元されること
- `enableAvatar` 未設定のシナリオでは `false` として扱われること
- アバターOFF時にアバターファイル情報がクリアされること

### ConversationPage
- `enableAvatar` が `true` の場合、AvatarStageが表示されること
- `enableAvatar` が `false` の場合、AvatarStageが非表示になること
- アバター非表示時にチャットログのmaxHeight制限が解除されること
