/**
 * API関連の型定義
 */

/**
 * 難易度レベルの型
 */
export type DifficultyLevel = "easy" | "normal" | "hard" | "expert";

/**
 * 公開設定の型
 */
export type VisibilityType = "public" | "private" | "shared";

/**
 * NPC情報の基本型
 */
export interface NPCInfo {
  id?: string;
  name: string;
  role: string;
  company: string;
  personality: string[];
  avatar?: string;
  description: string;
  voiceId?: string;
}

/**
 * ゴール情報の基本型
 */
export interface GoalInfo {
  id: string;
  description: string;
  hint?: string;
  isRequired: boolean;
  priority: number;
  criteria: string[];
}

/**
 * メトリクス情報の基本型
 */
export interface MetricsInfo {
  angerLevel: number;
  trustLevel: number;
  progressLevel: number;
}

/**
 * Guardrail情報の基本型
 */
export interface GuardrailInfo {
  arn: string;
  id: string;
  name: string;
  description: string;
}

/**
 * コンプライアンス違反の型
 */
export interface ComplianceViolation {
  rule_id: string;
  rule_name: string;
  severity: "high" | "medium" | "low";
  message: string;
  context: string;
  confidence: number;
  // Translation key support (added for i18n)
  rule_name_key?: string;
  rule_name_params?: Record<string, string | number>;
  message_key?: string;
  message_params?: Record<string, string | number>;
}

/**
 * コンプライアンスチェック結果の型
 */
export interface ComplianceCheck {
  score: number;
  violations: ComplianceViolation[];
  analysis: string;
  processingTimeMs?: number;
}

/**
 * リアルタイムメトリクス型
 */
export interface RealtimeMetric {
  angerLevel: string | number;
  trustLevel: string | number;
  progressLevel: string | number;
  analysis?: string;
  goalStatuses?: Array<{
    goalId: string;
    achieved: boolean;
    achievedAt?: string | null;
    progress: string | number;
  }>;
  goalScore?: string | number;
  messageNumber?: string | number;
  timestamp?: string;
  userMessage?: string;
  compliance?: ComplianceCheck; // コンプライアンスチェック結果
}

/**
 * フィードバック分析のレスポンス型
 */
export interface FeedbackAnalysisResult {
  scores: {
    overall: number;
    communication: number;
    needsAnalysis: number;
    proposalQuality: number;
    flexibility: number;
    trustBuilding: number;
    objectionHandling: number;
    closingSkill: number;
    listeningSkill: number;
    productKnowledge: number;
    customerFocus: number;
    goalAchievement: number; // ゴール達成度
  };
  strengths: string[];
  improvements: string[];
  keyInsights: string[];
  nextSteps: string;
  videoAnalysis?: VideoAnalysisResult; // 動画分析結果
  videoAnalysisCreatedAt?: string; // 動画分析実施日時
  goalFeedback?: {
    achievedGoals: string[];
    partiallyAchievedGoals: string[];
    missedGoals: string[];
    recommendations: string[];
  };
  detailedAnalysis?: {
    communicationPatterns: {
      questionFrequency: number;
      responseQuality: number;
      clarityOfExplanation: number;
    };
    customerInteraction: {
      empathyLevel: number;
      respectShown: number;
      engagementQuality: number;
    };
    salesTechniques: {
      valuePropositionClarity: number;
      needsAlignment: number;
      painPointIdentification: number;
    };
  };
}

/**
 * セッション情報の型
 */
export interface SessionInfo {
  sessionId: string;
  userId: string;
  scenarioId: string;
  scenarioName?: string; // シナリオ名
  title?: string;
  status: "active" | "completed" | "archived" | "abandoned";
  createdAt?: string;
  updatedAt?: string;
  startTime?: string; // 開始時刻（ISO形式文字列）
  endTime?: string; // 終了時刻（ISO形式文字列、終了していない場合は未定義）
  messageCount?: number; // メッセージ数
  npcInfo?: {
    name: string;
    role: string;
    company: string;
    personality?: string[];
  };
  metrics?: {
    angerLevel: number;
    trustLevel: number;
    progressLevel: number;
  };
  scores?: {
    // スコア情報（フィードバックがある場合）
    overall: number; // 総合スコア
    communication: number; // コミュニケーション
    trustBuilding: number; // 信頼構築
    // 他のスコアは省略
  };
  complianceViolations?: ComplianceViolation[]; // コンプライアンス違反のリスト
  duration?: number; // セッション時間（秒）
  lastActivityTime?: string; // 最終アクティビティ時間（ISO形式文字列）
  expirationTime?: number; // TTL有効期限（UNIXタイムスタンプ）
}

/**
 * メッセージ情報の型
 */
export interface MessageInfo {
  messageId: string;
  sessionId: string;
  userId?: string;
  timestamp: string;
  sender: "user" | "npc" | "system";
  content: string;
  realtimeMetrics?: {
    angerLevel: number;
    trustLevel: number;
    progressLevel: number;
    analysis?: string;
  };
  metrics?: {
    // メトリクス情報（オプション）
    angerLevel: number; // 怒りレベル
    trustLevel: number; // 信頼レベル
    progressLevel: number; // 進捗レベル
  };
  compliance?: ComplianceCheck; // コンプライアンスチェック結果
  audioUrl?: string;
  expirationTime?: number; // TTL有効期限（UNIXタイムスタンプ）
}

/**
 * シナリオ情報の型
 */
/**
 * PDFファイル情報
 */
export interface PdfFileInfo {
  key: string; // S3オブジェクトキー
  fileName: string; // ファイル名
  contentType: string; // MIMEタイプ（例: application/pdf）
  size?: number; // ファイルサイズ（バイト）
}

export interface ScenarioInfo {
  scenarioId: string;
  title: string;
  description: string;
  difficulty: DifficultyLevel;
  category: string;
  initialMessage?: string; // NPCの初期メッセージ
  language?: string; // シナリオの言語 (ja|en)
  estimatedDuration?: number; // 想定所要時間（分）
  maxTurns?: number; // 最大会話ターン数（指定しない場合はデフォルト値を使用）
  goals?: GoalInfo[];
  // npcInfoフィールド（旧APIとの互換性）
  npcInfo?: NPCInfo;
  // npcフィールド（DynamoDBから直接返される場合）
  npc?: NPCInfo;
  initialMetrics?: Partial<MetricsInfo>; // 初期メトリクス
  objectives?: string[]; // シナリオの目標
  tags?: string[];
  industry?: string; // categoryと同じ意味で使われる場合がある

  // 新規追加フィールド
  createdBy?: string; // 作成者のユーザーID
  isCustom?: boolean; // カスタムシナリオかどうか
  visibility?: VisibilityType; // 公開範囲設定
  sharedWithUsers?: string[]; // 共有先ユーザーID配列
  guardrail?: string; // 選択したGuardrailの名前
  createdAt?: number; // 作成日時（タイムスタンプ）
  updatedAt?: number; // 更新日時（タイムスタンプ）
  pdfFiles?: PdfFileInfo[]; // PDF資料情報
  avatarId?: string; // 使用するアバターのID（未指定時はデフォルトアバターを使用）
}

/**
 * セッション一覧のレスポンス型
 */
export interface SessionListResponse {
  sessions: SessionInfo[];
  nextToken?: string;
}

/**
 * メッセージ一覧のレスポンス型
 */
export interface MessageListResponse {
  messages: MessageInfo[];
  nextToken?: string;
}

/**
 * シナリオ一覧のレスポンス型
 */
export interface ScenarioListResponse {
  scenarios: ScenarioInfo[];
  nextToken?: string;
}

/**
 * API共通レスポンス型
 */
export interface ApiResponse<T> {
  success: boolean;
  error?: string;
  feedback?: T;
}

/**
 * ランキング項目の型
 */
export interface RankingEntry {
  rank: number; // ランキング順位
  username: string; // ユーザー名（preferred_username）
  userDisplayName?: string; // ユーザー表示名
  sessionId: string; // セッションID
  score: number; // 総合スコア
  scenarioId: string; // シナリオID
  timestamp: string; // 記録日時
}

/**
 * ランキングAPIレスポンスの型
 */
export interface RankingResponse {
  scenarioId: string; // シナリオID
  period: "daily" | "weekly" | "monthly"; // 期間
  rankings: RankingEntry[];
  totalCount: number; // 総参加者数
}

/**
 * ビデオ分析結果の型定義
 */
export interface VideoAnalysisResult {
  eyeContact: number; // 視線（1-10点）
  facialExpression: number; // 表情（1-10点）
  gesture: number; // 身振り（1-10点）
  emotion: number; // 感情表現（1-10点）
  overallScore: number; // 総合スコア（1-10点）
  strengths:
  | Array<{
    title: string; // 強みのタイトル
    description: string; // 強みの詳細説明
  }>
  | string[]; // 長所（自然言語） - 旧バージョンとの互換性のため両方の型をサポート
  improvements:
  | Array<{
    title: string; // 改善点のタイトル
    description: string; // 改善点の詳細説明
  }>
  | string[]; // 改善点（自然言語） - 旧バージョンとの互換性のため両方の型をサポート
  analysis: string; // 詳細分析
  videoUrl?: string; // 録画動画URL（オプション）
}

/**
 * リファレンスチェックのメッセージ情報
 */
export interface ReferenceCheckMessage {
  message: string; // ユーザーのメッセージ内容
  relatedDocument?: string; // 関連するドキュメント内容（オプショナル）
  reviewComment?: string; // レビューコメント（オプショナル）
  related: boolean; // ドキュメントと関連があるかどうか
}

/**
 * リファレンスチェックのサマリー情報
 */
export interface ReferenceCheckSummary {
  totalMessages: number; // 総メッセージ数
  checkedMessages: number; // チェック済みメッセージ数
}

/**
 * リファレンスチェック結果の型
 */
export interface ReferenceCheckResult {
  messages: ReferenceCheckMessage[]; // チェック結果のメッセージ一覧
  summary: ReferenceCheckSummary; // サマリー情報
}

/**
 * シナリオエクスポート/インポート用の型定義
 */
export interface ScenarioExportData {
  npcs: import("./index").NPC[];
  scenarios: import("./index").Scenario[];
  exportedAt?: string;
  exportedBy?: string;
  version?: string;
}

/**
 * インポート統計情報の型
 */
export interface ImportStats {
  imported_scenarios: number;
  updated_scenarios: number;
  imported_npcs: number;
  updated_npcs: number;
  errors: number;
}

/**
 * インポートレスポンスの型
 */
export interface ImportResponse {
  success: boolean;
  stats: ImportStats;
  imported?: number;
  skipped?: number;
  errors?: number;
  details?: {
    importedScenarios: Array<{
      originalId?: string;
      newId: string;
      title: string;
    }>;
    skippedScenarios: Array<{
      originalId?: string;
      title?: string;
      reason: string;
    }>;
    errors: Array<{
      scenario: string;
      error: string;
    }>;
  };
}


/**
 * リアルタイム評価APIのレスポンス型定義
 */
export interface MetricsUpdate {
  angerLevel: number; // 怒りレベル (1-10)
  trustLevel: number; // 信頼レベル (1-10)
  progressLevel: number; // 進捗レベル (1-10)
  analysis?: string; // 簡潔な分析テキスト
  goalStatuses?: import("./index").GoalStatus[]; // ゴール達成状況
  timestamp?: number; // タイムスタンプ（ミリ秒）
}

/**
 * セッション完全データのAPIレスポンス型定義
 */
export interface SessionCompleteDataResponse {
  success: boolean;
  sessionId: string;
  sessionInfo: {
    sessionId: string;
    userId: string;
    scenarioId: string;
    status: "active" | "completed" | "archived" | "abandoned";
    createdAt: string;
    updatedAt: string;
    expireAt: string;
    title?: string;
    npcInfo?: {
      name: string;
      role: string;
      company: string;
      personality: string[];
    };
  };
  messages: Array<{
    messageId: string;
    sessionId: string;
    userId: string;
    sender: "user" | "npc" | "system";
    content: string;
    timestamp: string;
    expireAt: string;
    realtimeMetrics?: {
      angerLevel: string;
      trustLevel: string;
      progressLevel: string;
    };
  }>;
  realtimeMetrics: Array<{
    sessionId: string;
    messageNumber: string;
    dataType: string;
    userMessage: string;
    angerLevel: string;
    trustLevel: string;
    progressLevel: string;
    analysis: string;
    goalScore: string;
    goalStatuses: Array<{
      goalId: string;
      achieved: boolean;
      achievedAt: string | null;
      progress: string;
    }>;
    createdAt: string;
    expireAt: string;
  }>;
  complianceViolations: ComplianceViolation[];
  videoAnalysis?: VideoAnalysisResult;
  videoAnalysisCreatedAt?: string;
  videoUrl?: string;
  createdAt?: string;
  feedback?: FeedbackAnalysisResult;
  finalMetrics?: {
    angerLevel: string;
    trustLevel: string;
    progressLevel: string;
    analysis: string;
  };
  feedbackCreatedAt?: string;
  goalResults?: {
    scenarioGoals: Array<{
      id: string;
      description: string;
      isRequired: boolean;
      priority: string;
      criteria: string[];
    }>;
    goalStatuses: Array<{
      goalId: string;
      achieved: boolean;
      achievedAt: string | null;
      progress: string;
    }>;
    goalScore: number;
  };
  referenceCheck?: ReferenceCheckResult;
  referenceCheckCreatedAt?: string;
}
