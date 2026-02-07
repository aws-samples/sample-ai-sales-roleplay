# Unit Test Execution - 3Dアバター機能 Phase 3（拡張実装）

## テスト実行

### 1. 全ユニットテスト実行
```bash
cd frontend
npm run test
```

### 2. Phase 3関連テストのみ実行
```bash
cd frontend
npx jest --testPathPattern="avatar|Avatar" --run
```

## Phase 3 テストケース

### AnimationController テスト
- `triggerNod()`: headボーンのX軸回転が発生すること
- `triggerHeadTilt()`: headボーンのZ軸回転が発生すること
- `triggerGesture('nod')`: nodジェスチャーが正しくトリガーされること
- `triggerGesture('headTilt')`: headTiltジェスチャーが正しくトリガーされること
- `triggerGesture('none')`: ジェスチャーがトリガーされないこと
- `setIsSpeaking(true)`: 発話中にアイドルモーションが抑制されること
- アイドルモーション: 視線移動（lookAt）と体の揺れ（spine）が動作すること

### ExpressionController テスト
- 感情間の中間状態トランジションが正しく適用されること
- 感情種類に応じたトランジション速度が異なること
- `angry` → `happy`のトランジションで中間状態を経由すること

### VRMAvatar / VRMAvatarContainer テスト
- `gesture`プロパティが正しくAnimationControllerに渡されること
- gestureが変更された時にtriggerGestureが呼ばれること

### ConversationPage テスト
- リアルタイム評価レスポンスからgestureが抽出されること
- gestureが1500ms後にリセットされること
- VRMAvatarContainerにgestureが渡されること

### AvatarService テスト
- `listAvatars()`: API呼び出しが正しいパスで行われること
- `createAvatar()`: リクエストボディが正しいこと
- `uploadVrmFile()`: FormDataが正しく構築されること
- `confirmUpload()`: PUTリクエストが正しいパスで行われること
- `deleteAvatar()`: DELETEリクエストが正しいパスで行われること

### AvatarUpload テスト
- .vrm以外のファイルが拒否されること
- 50MBを超えるファイルが拒否されること
- アップロードフロー（作成→アップロード→確認）が正しく動作すること
- エラー時にエラーメッセージが表示されること

### AvatarManagement テスト
- アバター一覧が正しく表示されること
- 削除確認ダイアログが表示されること
- 削除後にリストが更新されること
- アバター選択時にonSelectが呼ばれること

## テスト結果の確認
- **期待結果**: 全テスト通過
- **カバレッジ**: `npm run test:coverage`で確認
- **テストレポート**: コンソール出力
