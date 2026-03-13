# コード生成プラン - VRMアップロード + Polly音声モデル選択

## 概要
- **機能**: VRMファイルアップロード + Polly音声モデル選択
- **要件定義書**: `aidlc-docs/inception/requirements/requirements-phase3-voice.md`
- **実行計画書**: `aidlc-docs/inception/plans/execution-plan-phase3-voice.md`

## 実装ステップ

### Step 1: 型定義・データモデル更新
- [x] `frontend/src/types/api.ts` - NPCInfoインターフェースに`voiceId`フィールド追加
- [x] `frontend/src/types/avatar.ts` - AvatarInfo/AvatarManifest型をDynamoDB管理用に更新（manifest関連型を削除/簡素化）

### Step 2: 音声モデルデータ定義
- [x] `frontend/src/i18n/utils/languageUtils.ts` - `languageToVoiceMapping`を削除
- [x] `frontend/src/i18n/utils/languageUtils.ts` - `getPollySettingsForLanguage`からvoiceId部分を削除（languageCodeのみ返す）
- [x] `frontend/src/config/pollyVoices.ts`（新規作成）- 言語別Polly音声モデル一覧定義（voiceId, 表示名, 性別, 対応エンジン）

### Step 3: バックエンド - textToSpeech Lambdaエンジン自動選択
- [x] `cdk/lambda/textToSpeech/app.ts` - voiceIdに応じたエンジン自動選択ロジック追加（generative優先）
- [x] generative対応モデルリスト定義（Danielle, Joanna, Salli, Matthew, Ruth, Stephen）
- [x] リクエストのengineパラメータを無視し、voiceIdから自動判定する方式に変更

### Step 4: バックエンド - Avatar Lambda API整理
- [x] `cdk/lambda/avatars/index.py` - `GET /avatars`（一覧API）を削除
- [x] `cdk/lambda/avatars/index.py` - `GET /avatars/{avatarId}/download-url`（ダウンロードURL API）を削除
- [x] 残すAPI: `POST /avatars`, `GET /avatars/{avatarId}`, `DELETE /avatars/{avatarId}`, `PUT /avatars/{avatarId}/confirm`

### Step 5: CDK - CloudFrontにアバターS3オリジン追加
- [x] `cdk/lib/constructs/web.ts` - アバターS3バケットをCloudFrontディストリビューションの追加オリジンとして設定
- [x] `/avatars/*` パスパターンでアバターS3バケットにルーティング
- [x] WebコンストラクトのpropsにavatarBucketを追加
- [x] CloudFront URLをフロントエンドの環境変数（VITE_AVATAR_CDN_URL）として渡す

### Step 6: フロントエンド - AvatarService整理
- [x] `frontend/src/services/AvatarService.ts` - `listAvatars()`メソッドを削除
- [x] `frontend/src/services/AvatarService.ts` - `getDownloadUrl()`メソッドを削除
- [x] 残すメソッド: `createAvatar()`, `uploadVrmFile()`, `confirmUpload()`, `deleteAvatar()`

### Step 7: フロントエンド - PollyService更新
- [x] `frontend/src/services/PollyService.ts` - `synthesizeSpeechWithSSML`のデフォルトvoiceIdフォールバックを削除（voiceId必須化）
- [x] `frontend/src/services/PollyService.ts` - `engine: "neural"`ハードコードを削除（バックエンドで自動選択）
- [x] `frontend/src/services/AudioService.ts` - `synthesizeAndQueueAudio`にvoiceIdパラメータを追加し、PollyServiceに渡す

### Step 8: フロントエンド - NPCInfoStep.tsx（VRMアップロード + 音声選択UI）
- [x] VRMファイルアップロードUI追加（ファイル選択ボタン + アップロード済みファイル名表示）
- [x] Polly音声モデル選択ドロップダウン追加（言語に応じた動的フィルタリング）
- [x] voiceId必須バリデーション追加
- [x] propsにvoiceId, avatarFile, avatarFileName等を追加

### Step 9: フロントエンド - ScenarioCreatePage.tsx更新
- [x] formDataにvoiceIdフィールド追加
- [x] NPC情報バリデーションにvoiceId必須チェック追加
- [x] handleSubmitにアバターアップロードフロー追加（createAvatar → uploadVrmFile → confirmUpload → scenarioData.avatarId設定）
- [x] NPCInfoStepにvoiceId/avatarFile関連propsを渡す

### Step 10: フロントエンド - ScenarioEditPage.tsx更新
- [x] formDataにvoiceIdフィールド追加
- [x] 既存シナリオ読み込み時にvoiceIdとavatarIdを復元
- [x] handleSubmitにアバター置き換えフロー追加（旧アバター削除 → 新アバターアップロード）
- [x] NPCInfoStepにvoiceId/avatarFile関連propsを渡す

### Step 11: フロントエンド - ConversationPage.tsx更新
- [x] シナリオ情報からvoiceIdを取得
- [x] AudioService.synthesizeAndQueueAudioにvoiceIdを渡す
- [x] PollyService.setSpeechRateの呼び出しは維持

### Step 12: フロントエンド - AvatarContext.tsx リファクタリング
- [x] manifest.json依存を完全削除
- [x] CloudFront URL + S3キーベースのアバターURL生成に変更
- [x] `loadAvatar`をavatarId + s3Keyベースに変更（DynamoDB APIまたはCloudFront直接参照）
- [x] `getAvatarList`, `getDefaultAvatarId`を削除

### Step 13: 不要ファイル・コード削除
- [x] `frontend/public/models/avatars/manifest.json` - 削除
- [x] `frontend/src/components/avatar/AvatarSelector.tsx` - 削除（manifest.json依存、使用箇所なし）
- [x] `frontend/src/components/avatar/AvatarThumbnail.tsx` - 削除（AvatarSelectorの依存コンポーネント）
- [x] `frontend/src/pages/AvatarTestPage.tsx` - manifest.json参照を更新

### Step 14: i18nキー追加
- [x] `frontend/src/i18n/locales/ja.json` - VRMアップロード・音声選択関連の日本語キー追加
- [x] `frontend/src/i18n/locales/en.json` - VRMアップロード・音声選択関連の英語キー追加

### Step 15: リント・型チェック
- [x] getDiagnosticsで全変更ファイルの型エラーチェック
- [x] `cd frontend && npm run lint` でリントエラーチェック
- [x] エラーがあれば修正

## 変更ファイル一覧

### 新規作成
| ファイル | 内容 |
|----------|------|
| `frontend/src/config/pollyVoices.ts` | 言語別Polly音声モデル一覧 |

### 変更
| ファイル | 変更内容 |
|----------|----------|
| `frontend/src/types/api.ts` | NPCInfo.voiceId追加 |
| `frontend/src/types/avatar.ts` | manifest関連型の簡素化 |
| `frontend/src/i18n/utils/languageUtils.ts` | ハードコード音声マッピング削除 |
| `frontend/src/services/PollyService.ts` | voiceId必須化、engineハードコード削除 |
| `frontend/src/services/AudioService.ts` | voiceIdパラメータ追加 |
| `frontend/src/services/AvatarService.ts` | listAvatars/getDownloadUrl削除 |
| `frontend/src/pages/scenarios/creation/NPCInfoStep.tsx` | VRMアップロード + 音声選択UI |
| `frontend/src/pages/scenarios/ScenarioCreatePage.tsx` | voiceId + アバターアップロードフロー |
| `frontend/src/pages/scenarios/ScenarioEditPage.tsx` | voiceId + アバター置き換えフロー |
| `frontend/src/pages/ConversationPage.tsx` | voiceIdパススルー |
| `frontend/src/components/avatar/AvatarContext.tsx` | manifest.json → CloudFront URL |
| `frontend/src/pages/AvatarTestPage.tsx` | manifest.json参照更新 |
| `cdk/lambda/textToSpeech/app.ts` | エンジン自動選択 |
| `cdk/lambda/avatars/index.py` | 不要API削除 |
| `cdk/lib/constructs/web.ts` | CloudFrontアバターS3オリジン追加 |
| `frontend/src/i18n/locales/ja.json` | 新規i18nキー |
| `frontend/src/i18n/locales/en.json` | 新規i18nキー |

### 削除
| ファイル | 削除理由 |
|----------|----------|
| `frontend/public/models/avatars/manifest.json` | DynamoDB + S3管理に統一 |
| `frontend/src/components/avatar/AvatarSelector.tsx` | manifest.json依存、不要 |
| `frontend/src/components/avatar/AvatarThumbnail.tsx` | AvatarSelector依存、不要 |

## 依存関係
```
Step 1 (型定義) → Step 2 (音声データ) → Step 3 (バックエンド) → Step 4 (Lambda整理)
                                        → Step 5 (CDK CloudFront)
Step 6 (AvatarService整理) → Step 7 (PollyService更新)
Step 8 (NPCInfoStep UI) → Step 9 (CreatePage) → Step 10 (EditPage)
Step 11 (ConversationPage) → Step 12 (AvatarContext)
Step 13 (削除) → Step 14 (i18n) → Step 15 (リント)
```

## 推定ステップ数: 15
## 推定所要時間: 2-3時間
