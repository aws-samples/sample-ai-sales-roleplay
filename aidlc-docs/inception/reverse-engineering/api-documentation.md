# API Documentation

## REST APIs

### Bedrock API

#### POST /bedrock/conversation
NPCとの会話を処理し、AI応答を生成

**Request:**
```json
{
  "message": "string",           // ユーザーメッセージ
  "npcInfo": {                   // NPC情報
    "name": "string",
    "role": "string",
    "company": "string",
    "personality": ["string"],
    "description": "string"
  },
  "previousMessages": [          // 過去のメッセージ履歴
    {
      "sender": "user" | "npc",
      "content": "string",
      "timestamp": "string"
    }
  ],
  "sessionId": "string",         // セッションID（オプション）
  "scenarioId": "string",        // シナリオID（オプション）
  "emotionParams": {             // 感情パラメータ（オプション）
    "angerLevel": number,
    "trustLevel": number,
    "progressLevel": number
  },
  "language": "string"           // 言語設定（オプション、デフォルト: "ja"）
}
```

**Response:**
```json
{
  "message": "string",           // NPCの応答
  "sessionId": "string",         // セッションID
  "messageId": "string"          // メッセージID
}
```

---

### Scoring API

#### POST /scoring/realtime
ユーザーの発言をリアルタイムで評価

**Request:**
```json
{
  "message": "string",           // ユーザーメッセージ
  "previousMessages": [...],     // 過去のメッセージ履歴
  "sessionId": "string",         // セッションID（必須）
  "goals": [...],                // シナリオのゴール定義（オプション）
  "goalStatuses": [...],         // 現在のゴール達成状況（オプション）
  "scenarioId": "string",        // シナリオID（コンプライアンスチェック用）
  "language": "string"           // 言語設定（オプション）
}
```

**Response:**
```json
{
  "success": true,
  "scores": {
    "angerLevel": number,        // 怒りレベル (0-100)
    "trustLevel": number,        // 信頼度 (0-100)
    "progressLevel": number      // 進捗度 (0-100)
  },
  "goal": {
    "statuses": [...]            // 更新されたゴール達成状況
  },
  "compliance": {                // コンプライアンスチェック結果
    "score": number,
    "violations": [...],
    "analysis": "string"
  },
  "processingTimeMs": number
}
```

---

### Sessions API

#### GET /sessions
セッション一覧を取得

**Query Parameters:**
- `limit`: number (デフォルト: 20)
- `nextToken`: string
- `scenarioId`: string

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "string",
      "userId": "string",
      "scenarioId": "string",
      "title": "string",
      "status": "string",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "nextToken": "string"
}
```

#### GET /sessions/{sessionId}
セッション詳細を取得

**Response:**
```json
{
  "sessionId": "string",
  "userId": "string",
  "scenarioId": "string",
  "title": "string",
  "status": "string",
  "npcInfo": {...},
  "createdAt": "string",
  "updatedAt": "string"
}
```

#### GET /sessions/{sessionId}/messages
セッションのメッセージ履歴を取得

**Query Parameters:**
- `limit`: number
- `nextToken`: string

**Response:**
```json
{
  "messages": [
    {
      "messageId": "string",
      "sessionId": "string",
      "sender": "user" | "npc",
      "content": "string",
      "timestamp": number,
      "realtimeMetrics": {...}
    }
  ],
  "nextToken": "string"
}
```

#### GET /sessions/{sessionId}/feedback
セッションのフィードバックを取得

**Response:**
```json
{
  "success": true,
  "sessionId": "string",
  "feedback": {
    "scores": {...},
    "strengths": [...],
    "improvements": [...],
    "summary": "string"
  },
  "finalMetrics": {...},
  "messageCount": number,
  "goalResults": {...}
}
```

#### POST /sessions/{sessionId}/analysis/start
セッション分析を開始（Step Functions）

**Request:**
```json
{
  "language": "string"           // 言語設定（オプション）
}
```

**Response:**
```json
{
  "success": true,
  "executionArn": "string",
  "message": "string"
}
```

---

### Scenarios API

#### GET /scenarios
シナリオ一覧を取得

**Query Parameters:**
- `category`: string
- `difficulty`: string
- `limit`: number (デフォルト: 20)
- `nextToken`: string
- `visibility`: "public" | "private" | "shared" | "all"
- `includeShared`: boolean

**Response:**
```json
{
  "scenarios": [
    {
      "scenarioId": "string",
      "title": "string",
      "description": "string",
      "difficulty": "string",
      "category": "string",
      "npcInfo": {...},
      "goals": [...],
      "visibility": "string",
      "createdBy": "string",
      "isCustom": boolean
    }
  ],
  "nextToken": "string"
}
```

#### GET /scenarios/{scenarioId}
シナリオ詳細を取得

**Response:**
```json
{
  "scenarioId": "string",
  "title": "string",
  "description": "string",
  "difficulty": "string",
  "category": "string",
  "npc": {...},
  "goals": [...],
  "objectives": [...],
  "initialMetrics": {...},
  "initialMessage": "string",
  "language": "string",
  "guardrail": "string",
  "pdfFiles": [...],
  "visibility": "string",
  "createdBy": "string"
}
```

#### POST /scenarios
シナリオを作成

**Request:**
```json
{
  "scenarioId": "string",        // カスタムID（オプション）
  "title": "string",             // 必須
  "description": "string",       // 必須
  "difficulty": "string",        // 必須
  "category": "string",          // 必須
  "npc": {...},                  // 必須
  "guardrail": "string",         // 必須
  "language": "string",          // 必須
  "initialMessage": "string",    // 必須
  "goals": [...],                // オプション
  "initialMetrics": {...},       // オプション
  "visibility": "string",        // オプション（デフォルト: "private"）
  "pdfFiles": [...]              // オプション
}
```

**Response:**
```json
{
  "message": "string",
  "scenarioId": "string",
  "scenario": {...}
}
```

#### PUT /scenarios/{scenarioId}
シナリオを更新

**Request:** (POST /scenariosと同様)

**Response:**
```json
{
  "message": "string",
  "scenario": {...}
}
```

#### DELETE /scenarios/{scenarioId}
シナリオを削除

**Response:**
```json
{
  "message": "string",
  "scenarioId": "string"
}
```

#### POST /scenarios/{scenarioId}/pdf-upload-url
PDF資料アップロード用の署名付きURLを取得

**Request:**
```json
{
  "fileName": "string",
  "contentType": "string"
}
```

**Response:**
```json
{
  "uploadUrl": "string",
  "formData": {...},
  "key": "string",
  "fileName": "string",
  "contentType": "string"
}
```

---

### Videos API

#### POST /videos/upload-url
動画アップロード用の署名付きURLを取得

**Request:**
```json
{
  "sessionId": "string",
  "fileName": "string",
  "contentType": "string"
}
```

**Response:**
```json
{
  "uploadUrl": "string",
  "key": "string"
}
```

#### POST /videos/{sessionId}/analyze
動画分析を開始

**Response:**
```json
{
  "success": true,
  "message": "string"
}
```

---

### Rankings API

#### GET /rankings
ランキング一覧を取得

**Query Parameters:**
- `limit`: number
- `period`: "daily" | "weekly" | "monthly" | "all"

**Response:**
```json
{
  "rankings": [
    {
      "rank": number,
      "userId": "string",
      "username": "string",
      "score": number,
      "sessionCount": number
    }
  ]
}
```

---

### Guardrails API

#### GET /guardrails
利用可能なGuardrails一覧を取得

**Response:**
```json
{
  "guardrails": [
    {
      "arn": "string",
      "id": "string",
      "name": "string",
      "description": "string"
    }
  ]
}
```

---

## WebSocket API

### Transcribe WebSocket

#### Connection
```
wss://{api-id}.execute-api.{region}.amazonaws.com/prod?token={jwt}&sessionId={sessionId}&language={language}
```

#### Messages

**Client → Server (Audio Data):**
```json
{
  "action": "audio",
  "data": "base64-encoded-pcm-audio"
}
```

**Server → Client (Transcript):**
```json
{
  "type": "transcript",
  "transcript": "string",
  "isPartial": boolean
}
```

**Server → Client (Error):**
```json
{
  "type": "error",
  "message": "string"
}
```

---

## Data Models

### Session
```typescript
interface Session {
  sessionId: string;
  userId: string;
  scenarioId: string;
  title: string;
  status: "active" | "completed" | "abandoned";
  npcInfo?: NPC;
  createdAt: string;
  updatedAt: string;
  expireAt: number;  // TTL
}
```

### Message
```typescript
interface Message {
  sessionId: string;
  messageId: string;
  userId: string;
  timestamp: number;
  sender: "user" | "npc";
  content: string;
  realtimeMetrics?: Metrics;
  expireAt: number;  // TTL
}
```

### Scenario
```typescript
interface Scenario {
  scenarioId: string;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  npc: NPC;
  goals?: Goal[];
  objectives?: string[];
  initialMetrics?: Metrics;
  initialMessage?: string;
  language?: string;
  guardrail?: string;
  pdfFiles?: PdfFile[];
  visibility: "public" | "private" | "shared";
  sharedWithUsers?: string[];
  createdBy?: string;
  isCustom?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Metrics
```typescript
interface Metrics {
  angerLevel: number;      // 0-100
  trustLevel: number;      // 0-100
  progressLevel: number;   // 0-100
  analysis?: string;
}
```

### Goal
```typescript
interface Goal {
  id: string;
  description: string;
  priority: number;        // 1-5
  criteria: string[];
  isRequired: boolean;
}
```

### GoalStatus
```typescript
interface GoalStatus {
  goalId: string;
  achieved: boolean;
  progress: number;        // 0-100
  achievedAt?: string;
}
```

### ComplianceViolation
```typescript
interface ComplianceViolation {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  suggestion?: string;
  confidence?: number;
}
```
