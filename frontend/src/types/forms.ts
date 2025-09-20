/**
 * フォーム関連の型定義
 */

import {
  DifficultyLevel,
  VisibilityType,
  NPCInfo,
  GoalInfo,
  MetricsInfo,
} from "./api";

/**
 * シナリオ作成フォームの基本情報
 */
export interface ScenarioBasicInfo {
  scenarioId?: string;
  title: string;
  description: string;
  difficulty: DifficultyLevel;
  category: string;
  language: string;
  maxTurns?: number;
}

/**
 * 設定フォームデータ
 */
export interface SharingFormData {
  visibility: VisibilityType;
  sharedWithUsers: string[];
  guardrail: string;
}

/**
 * シナリオ作成フォーム全体のデータ
 */
export interface ScenarioFormData {
  scenarioId?: string;
  title: string;
  description: string;
  difficulty: DifficultyLevel;
  category: string;
  language: string;
  initialMessage?: string;
  maxTurns?: number;
  npc: NPCInfo;
  initialMetrics: MetricsInfo;
  goals: GoalInfo[];
  visibility: VisibilityType;
  sharedWithUsers: string[];
  guardrail: string;
}

// 後方互換性のためのエイリアス
export type NpcFormData = NPCInfo;
export type GoalFormData = GoalInfo;
export type InitialMetrics = MetricsInfo;
