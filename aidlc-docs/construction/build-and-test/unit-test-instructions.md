# ユニットテスト実行手順

## テスト実行

### 1. 全ユニットテスト実行
```bash
cd frontend
npm run test
```

### 2. 変更ファイルに関連するテストのみ実行
```bash
cd frontend
npx jest --testPathPattern="ConversationPage|ConversationHeader|ComplianceAlert|MetricsOverlay|CoachingHintBar|AvatarStage|RightPanelContainer|ScenarioPanel|PersonaPanel"
```

### 3. カバレッジ付きテスト
```bash
cd frontend
npm run test:coverage
```

## テスト対象コンポーネント

### 新規コンポーネント（テスト追加推奨）
| コンポーネント | テストファイル | テスト内容 |
|---|---|---|
| MetricsOverlay | MetricsOverlay.test.tsx | visible制御、メトリクス表示、aria属性 |
| ScenarioPanel | ScenarioPanel.test.tsx | シナリオ情報表示 |
| PersonaPanel | PersonaPanel.test.tsx | NPC情報表示 |
| RightPanelContainer | RightPanelContainer.test.tsx | visible制御、子コンポーネント配置 |
| CoachingHintBar | CoachingHintBar.test.tsx | hint表示/非表示、aria-live |
| AvatarStage | AvatarStage.test.tsx | NPC名表示、発話インジケーター |

### 改修コンポーネント（既存テスト更新推奨）
| コンポーネント | テスト内容 |
|---|---|
| ConversationHeader | 新規アクションボタン（📋📊🔊）のレンダリング・クリック |
| ComplianceAlert | Collapse表示、重大度別スタイル |
| ConversationPage | 新レイアウト構造、state制御 |

## テスト結果の確認
- テストレポート: コンソール出力
- カバレッジレポート: `frontend/coverage/` ディレクトリ
- 全テストがパスすることを確認

## テスト失敗時の対応
1. 失敗したテストのエラーメッセージを確認
2. コンポーネントのProps変更に起因する場合はテストを更新
3. レイアウト変更に起因する場合はセレクターを更新
4. 修正後に再実行して全テストパスを確認
