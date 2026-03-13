import type { Goal, GoalStatus, Scenario } from "../types/index";

/**
 * シナリオからゴールステータスの初期状態を生成する
 * @param scenario ゴールを含むシナリオ
 * @returns 初期化されたゴールステータスの配列
 */
export const initializeGoalStatuses = (scenario: Scenario): GoalStatus[] => {
  // goalsが空の場合は空配列を返す（objectivesはレガシーフィールド）
  const effectiveGoals =
    scenario.goals && scenario.goals.length > 0
      ? scenario.goals
      : ((scenario as Scenario & { objectives?: string[] }).objectives || []).map((obj: string, index: number) => ({
        id: `goal-${index}`,
        description: obj,
        priority: 3,
        criteria: [] as string[],
        isRequired: index === 0,
      }));

  if (!effectiveGoals || effectiveGoals.length === 0) {
    return [];
  }

  return effectiveGoals.map((goal) => ({
    goalId: goal.id,
    progress: 0,
    achieved: false,
  }));
};

/**
 * シナリオIDに基づいてゴールを取得する
 * @param scenarioId シナリオID
 * @param scenarios 全シナリオデータ
 * @returns 指定されたシナリオのゴール配列
 */
export const getGoalsByScenarioId = (
  scenarioId: string,
  scenarios: Scenario[],
): Goal[] => {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario || !scenario.goals) {
    return [];
  }
  return scenario.goals;
};

/**
 * ゴールスコアを計算する
 * @param goalStatuses ゴール達成状況
 * @param goals ゴール定義
 * @returns 0-100のスコア
 */
export const calculateGoalScore = (
  goalStatuses: GoalStatus[],
  goals: Goal[],
): number => {
  if (!goalStatuses.length || !goals.length) return 0;

  let totalWeight = 0;
  let weightedScore = 0;

  goals.forEach((goal) => {
    const status = goalStatuses.find((s) => s.goalId === goal.id);
    if (!status) return;

    const weight = goal.priority;
    totalWeight += weight;
    weightedScore += (status.progress / 100) * weight;
  });

  return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0;
};

/**
 * 必須ゴールがすべて達成されたかチェックする
 * @param goalStatuses ゴール達成状況
 * @param goals ゴール定義
 * @returns すべての必須ゴールが達成された場合true
 */
export const areAllRequiredGoalsAchieved = (
  goalStatuses: GoalStatus[],
  goals: Goal[],
): boolean => {
  const requiredGoals = goals.filter((g) => g.isRequired);
  if (requiredGoals.length === 0) return false;

  return requiredGoals.every((goal) => {
    const status = goalStatuses.find((s) => s.goalId === goal.id);
    return status && status.achieved;
  });
};
