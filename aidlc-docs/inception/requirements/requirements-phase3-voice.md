# VRMアップロード + Polly音声モデル選択 - 要件定義書

## 1. 概要

### 1.1 Intent Analysis（意図分析）

| 項目 | 内容 |
|------|------|
| **ユーザーリクエスト** | VRMファイルアップロード機能とPolly音声モデル選択機能の追加 |
| **リクエストタイプ** | 機能強化（Enhancement） |
| **スコープ** | 複数コンポーネント（フロントエンド + バックエンド + インフラ） |
| **複雑度** | 中（既存インフラ拡張 + 新規UI + データモデル変更） |
| **前提条件** | Phase 3のアバターストレージ（S3 + DynamoDB + Lambda）実装済み |

### 1.2 背景

- Phase 3でアバターストレージインフラ（S3バケット、DynamoDBテーブル、Lambda CRUD API）は実装済み
- 現在のPolly音声はハードコード（日本語: Takumi、英語: Matthew）で固定
- VRMアバターは男性・女性があるため、音声も性別に合わせたい
- 音声モデルはシナリオのNPC設定に紐付ける（アバターではなく）

---

## 2. 機能要件

### 2.1 VRMファイルアップロード機能

| ID | 要件 | 優先度 |
|----|------|--------|
| VV-FR-001 | シナリオ作成/編集画面のNPC設定ステップ内にVRMファイルアップロードUIを配置する | 必須 |
| VV-FR-002 | VRMファイル（.vrm）のアップロードに対応する（最大50MB） | 必須 |
| VV-FR-003 | アップロードされたVRMファイルはS3に保存される（既存アバターストレージ使用） | 必須 |
| VV-FR-004 | アバターメタデータ（名前、S3キー等）はDynamoDBに保存される（既存テーブル使用） | 必須 |
| VV-FR-005 | シナリオ保存時にアバターIDをシナリオのavatarIdフィールドに紐付ける | 必須 |
| VV-FR-006 | シナリオ削除時に紐付いたアバター（S3 + DynamoDB）も削除する | 必須 |
| VV-FR-007 | サムネイルなし（アップロード済みファイル名を表示） | 必須 |
| VV-FR-008 | VRMファイルは既存CloudFrontディストリビューションにS3オリジンを追加して配信する | 必須 |
| VV-FR-009 | manifest.jsonベースのアバター管理を廃止し、すべてDynamoDB + S3管理に統一する | 必須 |
| VV-FR-010 | アバターはアップロードしたユーザーが所有するが、シナリオ共有時にはそのアバターも共有先ユーザーが使用可能とする | 必須 |
| VV-FR-011-a | シナリオ編集時にアバターを再アップロードすると、旧アバター（S3 + DynamoDB）は削除して新しいものに置き換える | 必須 |
| VV-FR-011-b | manifest.json、AvatarService内のmanifest取得ロジック、関連する未使用コードを削除する | 必須 |

#### 技術仕様
- 既存インフラ: `cdk/lib/constructs/storage/avatar-storage.ts`（S3 + DynamoDB）
- 既存API: `cdk/lambda/avatars/index.py`（CRUD Lambda）
- DynamoDBテーブル: PK=userId, SK=avatarId
- S3キー: `avatars/{userId}/{avatarId}/{fileName}`
- アップロード方式: S3署名付きURL（presigned POST）
- ファイルサイズ制限: 50MB以下
- 対応形式: `.vrm`のみ

#### アバターアクセス制御
- アバターのアップロード・削除はシナリオ所有者のみ
- VRMファイルのダウンロード（会話画面での表示）は、CloudFront経由で配信するため認証不要
- シナリオ共有時、共有先ユーザーもCloudFront URL経由でアバターを表示可能

#### アバターライフサイクル
- シナリオ作成時: VRMファイルをアップロード → S3保存 → DynamoDBメタデータ保存 → シナリオにavatarId紐付け
- シナリオ編集時: 新しいVRMをアップロード → 旧アバター削除 → 新アバター保存
- シナリオ削除時: 紐付いたアバター（S3 + DynamoDB）も削除
- アバター一覧APIは不要（毎回新規アップロード、既存アバターからの選択なし）

### 2.2 Polly音声モデル選択機能

| ID | 要件 | 優先度 |
|----|------|--------|
| VV-FR-011 | シナリオ作成/編集画面のNPC設定ステップにドロップダウンで音声モデルを選択できる | 必須 |
| VV-FR-012 | 音声モデルはシナリオのNPC設定（npcInfo）に紐付けて保存する | 必須 |
| VV-FR-013 | neural + generativeエンジンの全モデルを言語ごとに選択可能にする | 必須 |
| VV-FR-014 | 対応言語は現在サポートしている日本語（ja-JP）と英語（en-US）のみ | 必須 |
| VV-FR-015 | 音声モデルの選択は必須とする（未選択ではシナリオ保存不可） | 必須 |
| VV-FR-016 | エンジン種別（neural/generative）は非表示とし、音声名と性別のみ表示する | 必須 |
| VV-FR-017 | バックエンドで音声モデルに応じた適切なエンジンを自動選択する | 必須 |
| VV-FR-018 | 会話画面でシナリオのNPC設定から音声モデルを取得し、Polly APIに渡す | 必須 |
| VV-FR-019 | languageUtils.tsのハードコード音声マッピング（languageToVoiceMapping）を廃止し、シナリオ設定のvoiceIdを使用する | 必須 |
| VV-FR-020 | 技術的負債を解消し、未使用コード（manifest.json関連、ハードコード音声マッピング等）を削除する | 必須 |

#### 技術仕様

**対応音声モデル一覧:**

**日本語（ja-JP）- Neural:**
| Voice ID | 性別 | エンジン |
|----------|------|---------|
| Takumi | 男性 | neural |
| Kazuha | 女性 | neural |
| Tomoko | 女性 | neural |

※日本語にはGenerativeモデルなし

**英語（en-US）- Neural + Generative:**
| Voice ID | 性別 | Neural | Generative |
|----------|------|--------|------------|
| Danielle | 女性 | ✅ | ✅ |
| Gregory | 男性 | ✅ | ❌ |
| Ivy | 女性(child) | ✅ | ❌ |
| Joanna | 女性 | ✅ | ✅ |
| Kendra | 女性 | ✅ | ❌ |
| Kimberly | 女性 | ✅ | ❌ |
| Salli | 女性 | ✅ | ✅ |
| Joey | 男性 | ✅ | ❌ |
| Justin | 男性(child) | ✅ | ❌ |
| Kevin | 男性(child) | ✅ | ❌ |
| Matthew | 男性 | ✅ | ✅ |
| Ruth | 女性 | ✅ | ✅ |
| Stephen | 男性 | ✅ | ✅ |

**データモデル変更:**
- `NPCInfo`インターフェースに`voiceId`フィールドを追加
- `ScenarioFormData`のnpcフィールド経由で保存
- DynamoDBシナリオテーブルのnpcInfo内にvoiceIdを格納

**エンジン自動選択ロジック:**
- generative対応モデルの場合: generativeエンジンを優先使用
- neural対応のみのモデルの場合: neuralエンジンを使用
- フロントエンドではエンジン種別を意識しない

**会話画面での音声モデル使用フロー:**
1. シナリオ情報取得時にnpcInfo.voiceIdを取得
2. ConversationPageでvoiceIdをPollyService呼び出し時に渡す
3. PollyServiceは受け取ったvoiceIdでPolly APIを呼び出す
4. バックエンド（textToSpeech Lambda）でvoiceIdに応じたエンジンを自動選択

---

## 3. 非機能要件

| ID | 要件 | 基準 |
|----|------|------|
| VV-NFR-001 | VRMファイルアップロードは50MB以下のファイルに対応する | 必須 |
| VV-NFR-002 | アバター一覧APIのレスポンスは500ms以内 | 目標 |
| VV-NFR-003 | S3からのVRMファイル配信はCloudFrontキャッシュを活用する | 必須 |
| VV-NFR-004 | 音声モデル選択UIはシナリオの言語変更時に動的に更新される | 必須 |
| VV-NFR-005 | 既存のPolly音声合成パフォーマンスに影響を与えない | 必須 |

---

## 4. 変更影響範囲

### 4.1 バックエンド変更（既存拡張）
| ファイル | 変更内容 |
|----------|----------|
| `cdk/lambda/textToSpeech/app.ts` | voiceIdに応じたエンジン自動選択ロジック追加 |
| `cdk/lambda/scenarios/` | シナリオ保存時にnpcInfo.voiceIdのバリデーション追加 |
| `cdk/lib/constructs/api.ts` | CloudFrontにアバターS3オリジン追加 |

### 4.2 バックエンド変更（既存利用・変更なし）
| ファイル | 状態 |
|----------|------|
| `cdk/lambda/avatars/index.py` | 既存CRUD APIをそのまま使用 |
| `cdk/lib/constructs/storage/avatar-storage.ts` | 既存ストレージをそのまま使用 |
| `cdk/lib/constructs/api/avatar-lambda.ts` | 既存Lambdaをそのまま使用 |

### 4.3 フロントエンド変更（既存拡張）
| ファイル | 変更内容 |
|----------|----------|
| `frontend/src/types/api.ts` | NPCInfoにvoiceIdフィールド追加 |
| `frontend/src/services/PollyService.ts` | voiceIdに応じたエンジン選択ロジック |
| `frontend/src/i18n/utils/languageUtils.ts` | 音声モデル一覧データ追加 |
| `frontend/src/pages/ConversationPage.tsx` | シナリオからvoiceIdを取得してPollyに渡す |
| `frontend/src/services/AvatarService.ts` | 既存サービスの活用・拡張 |

### 4.4 フロントエンド変更（新規/大幅改修）
| ファイル | 変更内容 |
|----------|----------|
| シナリオ作成/編集画面のNPC設定ステップ | アバター選択UI + 音声モデル選択ドロップダウン追加 |
| `frontend/src/i18n/locales/ja.json` | 新規i18nキー追加 |
| `frontend/src/i18n/locales/en.json` | 新規i18nキー追加 |

### 4.5 削除対象（技術的負債解消）
| ファイル/リソース | 削除理由 |
|----------|----------|
| `frontend/public/models/avatars/manifest.json` | DynamoDB管理に統一 |
| `frontend/src/services/AvatarService.ts` 内のmanifest取得ロジック | DynamoDB API経由に統一 |
| `frontend/src/i18n/utils/languageUtils.ts` の `languageToVoiceMapping` | シナリオ設定のvoiceIdに統一 |
| `frontend/src/i18n/utils/languageUtils.ts` の `getPollySettingsForLanguage` のvoiceId部分 | シナリオ設定のvoiceIdに統一 |
| `cdk/lambda/avatars/index.py` の `GET /avatars`（一覧API） | 毎回新規アップロードのため不要 |
| `cdk/lambda/avatars/index.py` の `GET /avatars/{avatarId}/download-url` | CloudFront配信に統一 |
| その他manifest.json参照コード | 不要コード削除 |

### 4.6 変更不要
- 認証・セキュリティ（既存Cognito認証をそのまま使用）
- リップシンク（Phase 2のViseme実装をそのまま使用）
- 音声認識・録画・評価機能（既存機能に影響なし）
- アバター3D表示（VRMAvatar/VRMAvatarContainer変更なし）

---

## 5. 成功基準

1. シナリオ作成画面のNPC設定ステップでVRMファイルをアップロードできる
2. アップロードしたアバターをシナリオに紐付けて保存できる
3. シナリオ作成画面でPolly音声モデルを選択できる（言語に応じたモデル一覧表示）
4. 音声モデル選択が必須で、未選択時はシナリオ保存不可
5. 会話画面でシナリオに設定された音声モデルでNPCが発話する
6. manifest.jsonベースのアバター管理が完全に廃止され、DynamoDB + S3管理に統一されている
7. languageUtils.tsのハードコード音声マッピングが廃止され、シナリオ設定のvoiceIdが使用されている
8. 未使用コード（manifest.json関連、ハードコード音声マッピング等）が削除されている
9. 既存機能（音声認識、録画、評価、コンプライアンスチェック）が正常に動作する
