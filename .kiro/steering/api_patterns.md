# API実装パターン

## 概要
AI営業ロールプレイアプリケーションで使用されるAPI実装パターンとベストプラクティスを定義します。

## 認証パターン

### Cognito IDトークン認証
```typescript
// 認証ヘッダーの取得
private async getAuthHeaders(): Promise<Record<string, string>> {
  try {
    await getCurrentUser();
    const authSession = await fetchAuthSession();
    
    const authHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authSession.tokens?.idToken) {
      authHeaders["Authorization"] = authSession.tokens.idToken.toString();
    }

    return authHeaders;
  } catch (error) {
    throw new Error("ユーザーがログインしていません");
  }
}
```

## APIクライアントパターン

### 統一されたHTTPメソッド実装
- **GET**: `apiGet<T>(path: string, queryParams?: Record<string, string | number | undefined>)`
- **POST**: `apiPost<T, R>(path: string, requestBody: R)`
- **PUT**: `apiPut<T, R>(path: string, requestBody: R)`
- **DELETE**: `apiDelete<T>(path: string)`

### エラーハンドリングパターン
```typescript
try {
  const response = await this.apiGet<ResponseType>("/api/endpoint");
  return response;
} catch (error) {
  console.error("API呼び出しエラー:", error);
  
  if (error instanceof Error) {
    throw new Error(`操作に失敗しました: ${error.message}`);
  } else {
    throw new Error('操作に失敗しました');
  }
}
```

## レスポンス形式

### 成功レスポンス
```json
{
  "success": true,
  "message": "操作が正常に完了しました",
  "data": {
    // 実際のデータ
  }
}
```

### エラーレスポンス
```json
{
  "success": false,
  "message": "エラーの詳細メッセージ",
  "error": {
    "code": "ERROR_CODE",
    "details": "詳細なエラー情報"
  }
}
```

## ページネーションパターン

### リクエスト
```typescript
interface PaginationRequest {
  limit?: number;
  nextToken?: string;
}
```

### レスポンス
```typescript
interface PaginationResponse<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
  totalCount?: number;
}
```

## ファイルアップロードパターン

### 署名付きURL取得
```typescript
public async getFileUploadUrl(
  scenarioId: string,
  fileName: string,
  contentType: string
): Promise<{
  uploadUrl: string;
  key: string;
  fileName: string;
  contentType: string;
}> {
  return this.apiPost(`/scenarios/${scenarioId}/upload-url`, {
    fileName,
    contentType
  });
}
```

### ファイルアップロード実行
```typescript
public async uploadFile(
  uploadUrl: string,
  content: File | Blob,
  contentType: string
): Promise<void> {
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType
    },
    body: content
  });
}
```

## リアルタイム評価パターン

### 評価リクエスト
```typescript
interface RealtimeEvaluationRequest {
  message: string;
  previousMessages: Message[];
  sessionId?: string;
  goalStatuses?: GoalStatus[];
  goals?: Goal[];
  scenarioId?: string;
  language?: string;
}
```

### 評価レスポンス
```typescript
interface RealtimeEvaluationResponse {
  scores?: {
    angerLevel: number;
    trustLevel: number;
    progressLevel: number;
  };
  analysis?: string;
  goalStatuses?: GoalStatus[];
  compliance?: ComplianceCheck;
}
```

## セッション管理パターン

### セッション作成・更新
- セッションIDは自動生成
- メッセージIDは各メッセージごとに生成
- リアルタイムメトリクスは非同期で保存

### セッション完了処理
1. 最終メトリクスの計算
2. フィードバック分析の実行
3. ゴール達成状況の評価
4. セッション結果の保存

## コンプライアンスチェックパターン

### Guardrails統合
```typescript
interface ComplianceCheck {
  passed: boolean;
  violations?: ComplianceViolation[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations?: string[];
}
```

### 違反検出時の処理
1. ユーザーへの即座の通知
2. 違反内容の詳細記録
3. 改善提案の提供
4. セッション継続可否の判定

## パフォーマンス最適化

### キャッシュ戦略
- シナリオ情報: ブラウザキャッシュ（1時間）
- ユーザー情報: セッションキャッシュ
- 静的リソース: CDNキャッシュ

### 非同期処理
- リアルタイム評価: バックグラウンド処理
- ファイルアップロード: 並列処理
- フィードバック生成: 遅延実行

## WebSocket API統合パターン

### リアルタイム音声認識統合
- **WebSocket接続管理**: セッションIDとJWTトークンによる認証付き接続
- **音声データストリーミング**: PCM 16kHz音声データのBase64エンコード転送
- **Amazon Transcribe Streaming連携**: WebSocketからTranscribeへの音声データ転送
- **リアルタイム結果配信**: 認識結果の即座なクライアント通知

### 無音検出システム
- **音声レベル監視**: RMS値による音声アクティビティ検出
- **閾値ベース判定**: カスタマイズ可能な無音判定基準
- **自動発話終了**: 設定時間経過後の自動終了トリガー
- **連続検出防止**: 重複イベント防止機能

### WebSocket接続ライフサイクル
- **接続確立**: JWT認証とDynamoDB接続情報保存
- **セッション管理**: TTL付きセッション状態管理
- **切断処理**: リソース解放と接続情報削除
- **エラーハンドリング**: 接続失敗・切断時の適切な処理

### Lambda WebSocketハンドラーパターン
- **Connect Handler**: 認証とセッション初期化処理
- **Disconnect Handler**: リソース解放と状態クリーンアップ
- **Default Handler**: 音声データ処理とTranscribe連携
- **エラー通知**: クライアントへのエラー状態通知

## セキュリティ考慮事項

### WebSocket認証
- **JWT認証**: 接続時にクエリパラメータでJWTトークンを検証
- **接続管理**: DynamoDBでの認証済み接続情報管理
- **セッション分離**: セッションIDによる適切なデータ分離

### 入力検証
- フロントエンド: 基本的な形式チェック
- バックエンド: 厳密な検証とサニタイゼーション
- **音声データ検証**: Base64形式とデータサイズの検証

### データ保護
- 個人情報の暗号化
- セッションデータの適切な削除
- ログの機密情報マスキング
- **音声データ保護**: 音声データの一時的な処理と即座の削除
