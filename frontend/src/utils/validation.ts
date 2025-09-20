/**
 * シナリオフォーム用バリデーションユーティリティ
 */

import type { ScenarioFormData } from "../types";

export const validateBasicInfo = (
  title: string,
  description: string,
  category: string,
  language: string,
  scenarioId?: string,
  maxTurns?: number,
) => {
  const errors = {
    scenarioId: null as string | null,
    title: null as string | null,
    description: null as string | null,
    category: null as string | null,
    language: null as string | null,
    maxTurns: null as string | null,
  };

  // シナリオIDのバリデーション（任意フィールド）
  if (scenarioId && scenarioId.trim()) {
    const scenarioIdPattern = /^[a-zA-Z0-9-]+$/;
    if (!scenarioIdPattern.test(scenarioId.trim())) {
      errors.scenarioId = "scenarios.validation.scenarioIdInvalid";
    } else if (scenarioId.trim().length > 50) {
      errors.scenarioId = "scenarios.validation.scenarioIdTooLong";
    }
  }

  // タイトルのバリデーション
  if (!title.trim()) {
    errors.title = "scenarios.validation.titleRequired";
  } else if (title.trim().length < 3) {
    errors.title = "scenarios.validation.titleTooShort";
  } else if (title.trim().length > 100) {
    errors.title = "scenarios.validation.titleTooLong";
  }

  // 説明のバリデーション
  if (!description.trim()) {
    errors.description = "scenarios.validation.descriptionRequired";
  } else if (description.trim().length < 10) {
    errors.description = "scenarios.validation.descriptionTooShort";
  } else if (description.trim().length > 1000) {
    errors.description = "scenarios.validation.descriptionTooLong";
  }

  // カテゴリのバリデーション
  if (!category.trim()) {
    errors.category = "scenarios.validation.categoryRequired";
  }

  // 言語のバリデーション
  if (!language.trim()) {
    errors.language = "scenarios.validation.languageRequired";
  }

  // 最大ターン数のバリデーション（任意フィールド、1-100の範囲内であること）
  if (maxTurns !== undefined) {
    if (maxTurns <= 0) {
      errors.maxTurns = "scenarios.validation.maxTurnsPositive";
    } else if (maxTurns > 100) {
      errors.maxTurns = "scenarios.validation.maxTurnsTooLarge";
    }
  }

  return errors;
};

export const validateNpcInfo = (
  name: string,
  role: string,
  company: string,
) => {
  const errors = {
    name: null as string | null,
    role: null as string | null,
    company: null as string | null,
  };

  // 名前のバリデーション
  if (!name.trim()) {
    errors.name = "scenarios.validation.npcNameRequired";
  } else if (name.trim().length < 2) {
    errors.name = "scenarios.validation.npcNameTooShort";
  } else if (name.trim().length > 50) {
    errors.name = "scenarios.validation.npcNameTooLong";
  }

  // 役職のバリデーション
  if (!role.trim()) {
    errors.role = "scenarios.validation.npcRoleRequired";
  } else if (role.trim().length > 100) {
    errors.role = "scenarios.validation.npcRoleTooLong";
  }

  // 会社名のバリデーション
  if (!company.trim()) {
    errors.company = "scenarios.validation.npcCompanyRequired";
  } else if (company.trim().length > 100) {
    errors.company = "scenarios.validation.npcCompanyTooLong";
  }

  return errors;
};

export const validateGoals = (
  objectives: string[], // 互換性のために残すが使用しない
  goals: Array<{
    id: string;
    description: string;
    isRequired: boolean;
    priority: number;
    criteria: string[];
  }>,
) => {
  const errors = {
    goals: null as string | null,
  };

  // ゴールのバリデーション
  if (goals.length === 0) {
    errors.goals = "scenarios.validation.goalsRequired";
  } else {
    // 各ゴールの条件が設定されているかチェック
    const invalidGoals = goals.filter((goal) => goal.criteria.length === 0);
    if (invalidGoals.length > 0) {
      errors.goals = "scenarios.validation.goalsCriteriaRequired";
    }
  }

  return errors;
};

export const validateSharing = (
  visibility: "public" | "private" | "shared",
  sharedWithUsers: string[],
  guardrail: string,
) => {
  const errors = {
    sharedWithUsers: null as string | null,
    guardrail: null as string | null,
  };

  // 共有設定のバリデーション
  if (visibility === "shared" && sharedWithUsers.length === 0) {
    errors.sharedWithUsers = "scenarios.validation.sharedUsersRequired";
  }

  // Guardrailのバリデーション
  if (!guardrail.trim()) {
    errors.guardrail = "scenarios.validation.guardrailRequired";
  }

  return errors;
};

export const validateForm = (formData: ScenarioFormData) => {
  const basicInfoValidation = validateBasicInfo(
    formData.title,
    formData.description,
    formData.category,
    formData.language,
    formData.scenarioId,
  );

  const npcInfoValidation = validateNpcInfo(
    formData.npc.name,
    formData.npc.role,
    formData.npc.company,
  );

  const goalsValidation = validateGoals(formData.objectives, formData.goals);

  const sharingValidation = validateSharing(
    formData.visibility,
    formData.sharedWithUsers,
    formData.guardrail,
  );

  // すべてのエラーがnullかどうかをチェック
  const isBasicInfoValid = Object.values(basicInfoValidation).every(
    (error) => error === null,
  );
  const isNpcInfoValid = Object.values(npcInfoValidation).every(
    (error) => error === null,
  );
  const isGoalsValid = Object.values(goalsValidation).every(
    (error) => error === null,
  );
  const isSharingValid = Object.values(sharingValidation).every(
    (error) => error === null,
  );

  return {
    basicInfo: basicInfoValidation,
    npcInfo: npcInfoValidation,
    goals: goalsValidation,
    sharing: sharingValidation,
    isValid:
      isBasicInfoValid && isNpcInfoValid && isGoalsValid && isSharingValid,
  };
};
