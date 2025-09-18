// API型定義の再エクスポート
export * from "./api";

// 新しい型定義のエクスポート
export * from "./forms";
export * from "./components";

// 明示的なimport（循環参照回避のため）
import type {
  DifficultyLevel,
  ComplianceViolation,
  NPCInfo,
  GoalInfo,
  MetricsInfo,
} from "./api";

// シナリオ情報（フロントエンド用）
export interface Scenario {
  id: string;
  title: string;
  description: string;
  difficulty: DifficultyLevel;
  industry: string;
  initialMessage?: string; // シナリオごとの初期メッセージ
  language?: string; // シナリオの言語 (ja|en)
  npc: NPCInfo;
  initialMetrics: ExtendedMetrics;
  goals: GoalInfo[]; // シナリオのゴール一覧
  maxTurns?: number; // 最大会話ターン数（指定しない場合はデフォルト値を使用）
}

// 拡張メトリクス（詳細スコア付き）
export interface ExtendedMetrics extends MetricsInfo {
  angerChange?: number; // 変化量
  trustChange?: number; // 変化量
  progressChange?: number; // 変化量

  // 詳細スコア
  communicationScore?: number; // コミュニケーションスキル (1-10)
  needsAnalysisScore?: number; // ニーズ分析力 (1-10)
  proposalQualityScore?: number; // 提案品質 (1-10)
  flexibilityScore?: number; // 柔軟性 (1-10)
  trustBuildingScore?: number; // 信頼構築 (1-10)
  objectionHandlingScore?: number; // 異議対応力 (1-10)
  closingSkillScore?: number; // クロージングスキル (1-10)
  listeningSkillScore?: number; // 傾聴スキル (1-10)
  productKnowledgeScore?: number; // 製品知識 (1-10)
  customerFocusScore?: number; // 顧客中心思考 (1-10)
  analysis?: string; // 簡潔な分析テキスト
}

// メッセージ
export interface Message {
  id: string;
  sender: "user" | "npc";
  content: string;
  timestamp: Date;
  metrics?: ExtendedMetrics;
  compliance?: {
    violations?: {
      rule_id: string;
      rule_name: string;
      severity: "high" | "medium" | "low";
      message: string;
      context: string;
      confidence: number;
    }[];
    score: number;
    analysis: string;
  };
}

// セッション情報
export interface Session {
  id: string;
  scenarioId: string;
  startTime: Date;
  endTime?: Date;
  messages: Message[];
  finalMetrics: ExtendedMetrics;
  finalScore: number;
  feedback: string[];
  goalStatuses: GoalStatus[]; // ゴール達成状況
  goalScore: number; // ゴールスコア（0-100）
  complianceViolations?: ComplianceViolation[]; // コンプライアンス違反リスト
  endReason?: string; // セッション終了理由
}

// 対話応答パターン
export interface ResponsePattern {
  keywords: string[];
  responses: string[];
  metricsChange: Partial<ExtendedMetrics>;
  conditions?: {
    minTrust?: number;
    maxAnger?: number;
    minProgress?: number;
  };
}

// 対話ルール
export interface DialogueRule {
  trigger: string[];
  response: string;
  metricsChange: Partial<ExtendedMetrics>;
  priority: number;
}

// ゴール達成状況
export interface GoalStatus {
  goalId: string; // ゴールID
  progress: number; // 進捗度（0-100%）
  achieved: boolean; // 達成済みかどうか
  achievedAt?: Date; // 達成日時
}

// 感情状態
export type EmotionState =
  | "angry"
  | "annoyed"
  | "neutral"
  | "satisfied"
  | "happy";

// 感情状態計算のためのパラメータ
export interface EmotionCalculationParams {
  angerLevel: number;
  trustLevel: number;
  progressLevel: number;
  previousEmotion?: EmotionState;
}

// 後方互換性のためのエイリアス
export type NPC = NPCInfo;
export type Goal = GoalInfo;
export type Metrics = ExtendedMetrics;
