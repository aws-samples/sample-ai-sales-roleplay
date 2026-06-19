/**
 * API関連の型定義
 *
 * 設計方針:
 * - フロントエンドの型は常にパース済みの値を表現する（number型に統一）
 * - DynamoDB由来の生データ（string型メトリクス等）はSessionCompleteDataResponseで表現し、
 *   APIサービス層でフロントエンド用の型（number型等）に変換する
 * - 共通の概念（ステータス、sender等）はtype aliasとして抽出し、重複を排除する
 * - MetricsInfoを基本型として全メトリクス関連フィールドで再利用する
 */

// ============================================================
// 共通type alias
// ============================================================

/** 難易度レベル */
export type DifficultyLevel = "easy" | "normal" | "hard" | "expert";

/** 公開設定 */
export type VisibilityType = "public" | "private" | "shared";

/** セッションステータス */
export type SessionStatus = "active" | "completed" | "archived" | "abandoned";

/** メッセージ送信者 */
export type SenderType = "user" | "npc" | "system";

/** コンプライアンス重大度 */
export type ComplianceSeverity = "high" | "medium" | "low";

/** ランキング期間 */
export type RankingPeriod = "daily" | "weekly" | "monthly";

/** 提案資料変換ステータス */
export type PresentationStatus = "uploading" | "converting" | "ready" | "error";

/** 許可されたファイルMIMEタイプ */
export type AllowedContentType =
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "image/webp";

// ============================================================
// 基本型
// ============================================================

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
  /** ゴール達成のためのヒント（複数） */
  hints?: string[];
  isRequired: boolean;
  priority: number;
  criteria: string[];
}

/**
 * メトリクス情報の基本型
 * 全メトリクス関連フィールドの基底型として使用する
 */
export interface MetricsInfo {
  /** 怒りレベル（0-10の範囲） */
  angerLevel: number;
  /** 信頼度（0-10の範囲） */
  trustLevel: number;
  /** 進捗度（0-10の範囲） */
  progressLevel: number;
}

/**
 * 分析テキスト付きメトリクス
 */
export interface MetricsWithAnalysis extends MetricsInfo {
  analysis?: string;
}

/**
 * Guardrail情報の基本型
 */
export interface GuardrailInfo {
  id: string;
  name: string;
  description: string;
}

// ============================================================
// コンプライアンス関連
// ============================================================

/**
 * コンプライアンス違反の型
 * フロントエンド型はcamelCaseに統一。
 * APIクライアント層でバックエンド（Python snake_case）からの変換を実施する。
 */
export interface ComplianceViolation {
  ruleId: string;
  ruleName: string;
  severity: ComplianceSeverity;
  message: string;
  /** @security ユーザー入力を含む。表示時はテキストノードとしてレンダリングし、innerHTML/href等への直接挿入を禁止 */
  context: string;
  confidence: number;
  // i18n翻訳キーサポート
  ruleNameKey?: string;
  ruleNameParams?: Record<string, string | number>;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
}

/**
 * コンプライアンスチェック結果の型
 */
export interface ComplianceCheck {
  score: number;
  passed?: boolean;
  violations: ComplianceViolation[];
  riskLevel?: ComplianceSeverity;
  analysis: string;
  recommendations?: string[];
  processingTimeMs?: number;
}

// ============================================================
// ゴール達成状況
// ============================================================

/**
 * APIレスポンス用ゴール達成状況
 * RealtimeMetric、SessionCompleteDataResponse等で共通使用
 */
export interface ApiGoalStatus {
  goalId: string;
  achieved: boolean;
  achievedAt?: string | null;
  progress: number;
}

// ============================================================
// リアルタイムメトリクス
// ============================================================

/**
 * リアルタイムメトリクス型
 * フロントエンドでは常にnumber型として扱う
 */
export interface RealtimeMetric extends MetricsWithAnalysis {
  goalStatuses?: ApiGoalStatus[];
  goalScore?: number;
  messageNumber?: number;
  timestamp?: string;
  userMessage?: string;
  compliance?: ComplianceCheck;
}

// ============================================================
// フィードバック分析
// ============================================================

/**
 * フィードバックスコア
 */
export interface FeedbackScores {
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
  goalAchievement: number;
}

/**
 * ゴールフィードバック
 */
export interface GoalFeedback {
  achievedGoals: string[];
  partiallyAchievedGoals: string[];
  missedGoals: string[];
  recommendations: string[];
}

/**
 * 詳細分析
 */
export interface DetailedAnalysis {
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
}

/**
 * フィードバック分析のレスポンス型
 */
export interface FeedbackAnalysisResult {
  scores: FeedbackScores;
  strengths: string[];
  improvements: string[];
  keyInsights: string[];
  nextSteps: string;
  videoAnalysis?: VideoAnalysisResult;
  videoAnalysisCreatedAt?: string;
  goalFeedback?: GoalFeedback;
  detailedAnalysis?: DetailedAnalysis;
}

// ============================================================
// セッション関連
// ============================================================

/**
 * セッション情報の型
 */
export interface SessionInfo {
  sessionId: string;
  userId: string;
  scenarioId: string;
  scenarioName?: string;
  title?: string;
  status: SessionStatus;
  createdAt?: string;
  updatedAt?: string;
  startTime?: string;
  endTime?: string;
  messageCount?: number;
  npcInfo?: {
    name: string;
    role: string;
    company: string;
    personality?: string[];
  };
  metrics?: MetricsInfo;
  scores?: {
    overall: number;
    communication: number;
    trustBuilding: number;
  };
  complianceViolations?: ComplianceViolation[];
  duration?: number;
  lastActivityTime?: string;
  expirationTime?: number;
}

// ============================================================
// メッセージ関連
// ============================================================

/**
 * メッセージ情報の型
 */
export interface MessageInfo {
  messageId: string;
  sessionId: string;
  userId?: string;
  timestamp: string;
  sender: SenderType;
  content: string;
  realtimeMetrics?: MetricsWithAnalysis;
  compliance?: ComplianceCheck;
  audioUrl?: string;
  expirationTime?: number;
}

// ============================================================
// ファイル関連
// ============================================================

/**
 * ファイル情報の基底型
 */
export interface FileInfo {
  key: string;
  fileName: string;
  contentType: AllowedContentType | string;
  size?: number;
}

/**
 * PDFファイル情報
 */
export type PdfFileInfo = FileInfo;

/**
 * スライド画像情報（PDF→画像変換後の各ページ）
 */
export interface SlideImageInfo {
  pageNumber: number;
  imageKey: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}

/**
 * 提案資料情報
 */
export interface PresentationFileInfo extends FileInfo {
  totalPages?: number;
  slides?: SlideImageInfo[];
  status?: PresentationStatus;
}

// ============================================================
// シナリオ関連
// ============================================================

/**
 * シナリオ情報の型
 */
export interface ScenarioInfo {
  scenarioId: string;
  title: string;
  description: string;
  difficulty: DifficultyLevel;
  category: string;
  initialMessage?: string;
  language?: string;
  estimatedDuration?: number;
  maxTurns?: number;
  goals?: GoalInfo[];
  /** NPC情報（作成・更新時に使用） */
  npc?: {
    name: string;
    role: string;
    company: string;
    personality?: string[];
    description?: string;
    voiceId?: string;
    avatar?: string;
    id?: string;
  };
  npcInfo?: NPCInfo;
  initialMetrics?: Partial<MetricsInfo>;
  objectives?: string[];
  tags?: string[];
  createdBy?: string;
  isCustom?: boolean;
  visibility?: VisibilityType;
  sharedWithUsers?: string[];
  guardrail?: string;
  createdAt?: string;
  updatedAt?: string;
  pdfFiles?: PdfFileInfo[];
  presentationFile?: PresentationFileInfo;
  avatarId?: string;
  enableAvatar?: boolean;
  /** サジェスト返答ボタンの有効/無効（未設定時はfalse） */
  suggestionEnabled?: boolean;
  /** 商談開始時に表示する初回サジェスト返答候補（ユーザー初回入力前用） */
  initialSuggestions?: string[];
}

// ============================================================
// リストレスポンス
// ============================================================

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

// ============================================================
// API共通レスポンス
// ============================================================

/**
 * API共通レスポンス型
 * ※ feedbackフィールドは後方互換性のため残存。新規APIではdataを使用すること
 */
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

// ============================================================
// ランキング関連
// ============================================================

/**
 * ランキング項目の型
 */
export interface RankingEntry {
  rank: number;
  username: string;
  userDisplayName?: string;
  sessionId: string;
  score: number;
  scenarioId: string;
  timestamp: string;
}

/**
 * ランキングAPIレスポンスの型
 */
export interface RankingResponse {
  scenarioId: string;
  period: RankingPeriod;
  rankings: RankingEntry[];
  totalCount: number;
}

// ============================================================
// 動画分析
// ============================================================

/**
 * 分析フィードバック項目（強み・改善点）
 */
export interface AnalysisFeedbackItem {
  title: string;
  description: string;
}

/**
 * ビデオ分析結果の型定義
 * strengths/improvementsは構造化された型に統一。
 * 旧形式（string[]）からの変換はAPIクライアント層で実施する。
 */
export interface VideoAnalysisResult {
  eyeContact: number;
  facialExpression: number;
  gesture: number;
  emotion: number;
  overallScore: number;
  strengths: AnalysisFeedbackItem[];
  improvements: AnalysisFeedbackItem[];
  analysis: string;
  videoUrl?: string;
}

// ============================================================
// リファレンスチェック
// ============================================================

/**
 * リファレンスチェックの評価区分
 * - "appropriate"    : 発言が参照資料の内容に沿っており、正確な情報提供ができている
 * - "issue"          : 発言が参照資料の内容と矛盾している、または誤った情報を含んでいる
 * - "not_applicable" : 挨拶・一般的な進行・意思表示など、参照資料の正誤を問えない発言
 */
export type ReferenceCheckEvaluation =
  | "appropriate"
  | "issue"
  | "not_applicable";

/**
 * リファレンスチェックのメッセージ情報
 */
export interface ReferenceCheckMessage {
  message: string;
  relatedDocument?: string;
  reviewComment?: string;
  /** 評価区分（3分類） */
  evaluation: ReferenceCheckEvaluation;
}

/**
 * リファレンスチェックのサマリー情報
 */
export interface ReferenceCheckSummary {
  totalMessages: number;
  checkedMessages: number;
  /** 適切な発言数 */
  appropriateCount?: number;
  /** 評価対象外の発言数 */
  notApplicableCount?: number;
  /** 問題ありの発言数 */
  issueCount?: number;
}

/**
 * リファレンスチェック結果の型
 */
export interface ReferenceCheckResult {
  messages: ReferenceCheckMessage[];
  summary: ReferenceCheckSummary;
}

// ============================================================
// エクスポート/インポート
// ============================================================

/**
 * シナリオエクスポート/インポート用の型定義
 */
export interface ScenarioExportData {
  npcs: NPCInfo[];
  scenarios: ScenarioInfo[];
  exportedAt?: string;
  exportedBy?: string;
  version?: string;
}

/**
 * インポート統計情報の型
 * フロントエンド型はcamelCaseに統一。
 * APIクライアント層でバックエンド（Python snake_case）からの変換を実施する。
 */
export interface ImportStats {
  importedScenarios: number;
  updatedScenarios: number;
  importedNpcs: number;
  updatedNpcs: number;
  errors: number;
}

/**
 * インポートレスポンスの型
 */
export interface ImportResponse {
  success: boolean;
  stats: ImportStats;
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

// ============================================================
// セッション完全データ（DynamoDB生データ対応）
// ============================================================

/**
 * DynamoDB生データ用メトリクス型（string版）
 * DynamoDBのNumber型がDecimal→JSON変換時にstringになる場合があるため定義
 */
export interface RawMetricsInfo {
  angerLevel: string;
  trustLevel: string;
  progressLevel: string;
}

/**
 * DynamoDB生データ用メトリクス型（分析テキスト付き）
 */
export interface RawMetricsWithAnalysis extends RawMetricsInfo {
  analysis: string;
}

/**
 * DynamoDB生データ用ゴール達成状況
 */
export interface RawGoalStatus {
  goalId: string;
  achieved: boolean;
  achievedAt: string | null;
  progress: string;
}

/**
 * セッション完全データのAPIレスポンス型定義
 *
 * DynamoDBから返される生データを表現する型。
 * メトリクス値はstring型で定義している。
 * フロントエンドで使用する際はsafeParseMetric()で安全に変換すること。
 */
export interface SessionCompleteDataResponse {
  success: boolean;
  sessionId: string;
  sessionInfo: {
    sessionId: string;
    userId: string;
    scenarioId: string;
    status: SessionStatus;
    createdAt: string;
    updatedAt: string;
    title?: string;
    npcInfo?: Pick<NPCInfo, "name" | "role" | "company"> & {
      personality: string[];
    };
  };
  messages: Array<{
    messageId: string;
    sessionId: string;
    userId: string;
    sender: SenderType;
    content: string;
    timestamp: string;
    realtimeMetrics?: RawMetricsInfo;
    presentedSlides?: number[];
  }>;
  realtimeMetrics: Array<{
    sessionId: string;
    messageNumber: string;
    dataType: string;
    userMessage: string;
    analysis: string;
    goalScore: string;
    goalStatuses: RawGoalStatus[];
    createdAt: string;
  } & RawMetricsInfo>;
  complianceViolations: ComplianceViolation[];
  videoAnalysis?: VideoAnalysisResult;
  videoAnalysisCreatedAt?: string;
  videoUrl?: string;
  createdAt?: string;
  feedback?: FeedbackAnalysisResult;
  finalMetrics?: RawMetricsWithAnalysis;
  feedbackCreatedAt?: string;
  goalResults?: {
    scenarioGoals: Array<{
      id: string;
      description: string;
      isRequired: boolean;
      priority: string;
      criteria: string[];
    }>;
    goalStatuses: RawGoalStatus[];
    goalScore: number;
  };
  referenceCheck?: ReferenceCheckResult;
  referenceCheckCreatedAt?: string;
}
