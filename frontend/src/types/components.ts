/**
 * コンポーネント関連の型定義
 */

import { ReactNode } from "react";
import { EmotionState } from "./index";
import {
  NPCInfo,
  GoalInfo,
  MetricsInfo,
  GuardrailInfo,
  VisibilityType,
} from "./api";
import { ScenarioFormData } from "./forms";

/**
 * IME入力中の判定のためのキーボードイベント型
 */
export type CompositionEventType = React.KeyboardEvent & {
  nativeEvent: {
    isComposing: boolean;
  };
};

/**
 * 絵文字フィードバックコンポーネントのプロパティ
 */
export interface EmojiFeedbackProps {
  // 感情メトリクス
  angerLevel: number; // 怒りレベル（0-100）
  trustLevel: number; // 信頼度（0-100）
  progressLevel: number; // 進捗度（0-100）

  // 表示オプション
  size?: "small" | "medium" | "large";
  animationEnabled?: boolean;

  // アクセシビリティ
  announceStateChanges?: boolean;

  // イベントハンドラ
  onEmotionChange?: (emotion: EmotionState) => void;
}

/**
 * 感情状態の詳細情報
 */
export interface EmotionDetail {
  emoji: string;
  displayName: string;
  description: string;
  colorToken: string;
}

/**
 * ステップコンポーネントの共通プロパティ
 */
export interface StepComponentProps {
  children?: ReactNode;
  title?: string;
  description?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
}

/**
 * フォームフィールドの共通プロパティ
 */
export interface FormFieldProps {
  label: string;
  name: string;
  value: string | number;
  onChange: (value: string | number) => void;
  error?: string | null;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * セレクトオプション
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * ゴール設定ステップのプロパティ
 */
export interface GoalsStepProps {
  formData: {
    initialMetrics: MetricsInfo;
    goals: GoalInfo[];
  };
  updateFormData: (
    data: Partial<{
      objectives: string[];
      initialMetrics: MetricsInfo;
      goals: GoalInfo[];
    }>,
  ) => void;
  validationErrors?: Record<string, string | null>;
}

/**
 * NPC情報設定ステップのプロパティ
 */
export interface NPCInfoStepProps {
  formData: {
    npc: NPCInfo;
    initialMessage?: string;
  };
  updateFormData: (
    data: Partial<NPCInfo & { initialMessage?: string }>,
  ) => void;
  validationErrors?: Record<string, string | null>;
}

/**
 * プレビューステップのプロパティ
 */
export interface PreviewStepProps {
  formData: ScenarioFormData & {
    guardrail?: string;
  };
}

/**
 * 共有設定ステップのプロパティ
 */
export interface SharingStepProps {
  formData: {
    visibility: VisibilityType;
    sharedWithUsers: string[];
    guardrail?: string;
  };
  guardrailsList: GuardrailInfo[];
  updateFormData: (
    data: Partial<{
      visibility: VisibilityType;
      sharedWithUsers: string[];
      guardrail?: string;
    }>,
  ) => void;
  validationErrors?: Record<string, string | null>;
}

/**
 * 録画コンポーネント関連の型定義
 */
export interface VideoManagerRef {
  forceStopRecording: () => Promise<void>;
}

export interface VideoRecorderRef {
  forceStopRecording: () => Promise<void>;
}
