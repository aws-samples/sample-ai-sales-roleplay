import {
  validateBasicInfo,
  validateNpcInfo,
  validateGoals,
  validateSharing,
  validateForm,
} from "../../utils/validation";
import { DifficultyLevel } from "../../types/api";

describe("validateBasicInfo", () => {
  it("should return no errors for valid basic info", () => {
    const result = validateBasicInfo(
      "Valid Title",
      "This is a valid description that is long enough.",
      "general",
      "ja",
    );

    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.category).toBeNull();
    expect(result.language).toBeNull();
  });

  it("should validate title is required", () => {
    const result = validateBasicInfo("", "Valid description", "general", "ja");

    expect(result.title).toBe("scenarios.validation.titleRequired");
    expect(result.description).toBeNull();
    expect(result.category).toBeNull();
    expect(result.language).toBeNull();
  });

  it("should validate title minimum length", () => {
    const result = validateBasicInfo(
      "Ab",
      "Valid description",
      "general",
      "ja",
    );

    expect(result.title).toBe("scenarios.validation.titleTooShort");
  });

  it("should validate title maximum length", () => {
    const longTitle = "A".repeat(101);
    const result = validateBasicInfo(
      longTitle,
      "Valid description",
      "general",
      "ja",
    );

    expect(result.title).toBe("scenarios.validation.titleTooLong");
  });

  it("should validate description is required", () => {
    const result = validateBasicInfo("Valid Title", "", "general", "ja");

    expect(result.title).toBeNull();
    expect(result.description).toBe("scenarios.validation.descriptionRequired");
    expect(result.category).toBeNull();
    expect(result.language).toBeNull();
  });

  it("should validate description minimum length", () => {
    const result = validateBasicInfo(
      "Valid Title",
      "Too short",
      "general",
      "ja",
    );

    expect(result.description).toBe("scenarios.validation.descriptionTooShort");
  });

  it("should validate description maximum length", () => {
    const longDescription = "A".repeat(1001);
    const result = validateBasicInfo(
      "Valid Title",
      longDescription,
      "general",
      "ja",
    );

    expect(result.description).toBe("scenarios.validation.descriptionTooLong");
  });

  it("should validate category is required", () => {
    const result = validateBasicInfo(
      "Valid Title",
      "Valid description",
      "",
      "ja",
    );

    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.category).toBe("scenarios.validation.categoryRequired");
    expect(result.language).toBeNull();
  });
});

describe("validateNpcInfo", () => {
  it("should return no errors for valid NPC info", () => {
    const result = validateNpcInfo("John Doe", "CEO", "ACME Corp");

    expect(result.name).toBeNull();
    expect(result.role).toBeNull();
    expect(result.company).toBeNull();
  });

  it("should validate name is required", () => {
    const result = validateNpcInfo("", "CEO", "ACME Corp");

    expect(result.name).toBe("scenarios.validation.npcNameRequired");
  });

  it("should validate name minimum length", () => {
    const result = validateNpcInfo("A", "CEO", "ACME Corp");

    expect(result.name).toBe("scenarios.validation.npcNameTooShort");
  });

  it("should validate name maximum length", () => {
    const longName = "A".repeat(51);
    const result = validateNpcInfo(longName, "CEO", "ACME Corp");

    expect(result.name).toBe("scenarios.validation.npcNameTooLong");
  });

  it("should validate role is required", () => {
    const result = validateNpcInfo("John Doe", "", "ACME Corp");

    expect(result.role).toBe("scenarios.validation.npcRoleRequired");
  });

  it("should validate role maximum length", () => {
    const longRole = "A".repeat(101);
    const result = validateNpcInfo("John Doe", longRole, "ACME Corp");

    expect(result.role).toBe("scenarios.validation.npcRoleTooLong");
  });

  it("should validate company is required", () => {
    const result = validateNpcInfo("John Doe", "CEO", "");

    expect(result.company).toBe("scenarios.validation.npcCompanyRequired");
  });

  it("should validate company maximum length", () => {
    const longCompany = "A".repeat(101);
    const result = validateNpcInfo("John Doe", "CEO", longCompany);

    expect(result.company).toBe("scenarios.validation.npcCompanyTooLong");
  });
});

describe("validateGoals", () => {
  it("should return no errors for valid goals", () => {
    const objectives = ["Objective 1", "Objective 2"]; // 互換性のために残す
    const goals = [
      {
        id: "1",
        description: "Goal 1",
        isRequired: true,
        priority: 3,
        criteria: ["Criteria 1", "Criteria 2"],
      },
    ];

    const result = validateGoals(objectives, goals);

    // objectivesのチェックは削除されたので、テストからも削除
    expect(result.goals).toBeNull();
  });

  // objectivesのバリデーションが削除されたため、このテストケースは削除
  // it("should validate objectives are required", () => {
  //   const objectives: string[] = [];
  //   const goals = [
  //     {
  //       id: "1",
  //       description: "Goal 1",
  //       isRequired: true,
  //       priority: 3,
  //       criteria: ["Criteria 1"],
  //     },
  //   ];

  //   const result = validateGoals(objectives, goals);

  //   expect(result.objectives).toBe("scenarios.validation.objectivesRequired");
  //   expect(result.goals).toBeNull();
  // });

  it("should validate goals are required", () => {
    const objectives = ["Objective 1"]; // 互換性のために残す
    const goals: Array<{
      id: string;
      description: string;
      isRequired: boolean;
      priority: number;
      criteria: string[];
    }> = [];

    const result = validateGoals(objectives, goals);

    // objectivesのチェックは削除されたので、テストからも削除
    expect(result.goals).toBe("scenarios.validation.goalsRequired");
  });

  it("should validate goals criteria are required", () => {
    const objectives = ["Objective 1"]; // 互換性のために残す
    const goals = [
      {
        id: "1",
        description: "Goal 1",
        isRequired: true,
        priority: 3,
        criteria: [],
      },
    ];

    const result = validateGoals(objectives, goals);

    expect(result.goals).toBe("scenarios.validation.goalsCriteriaRequired");
  });
});

describe("validateSharing", () => {
  it("should return no errors for valid public sharing", () => {
    const result = validateSharing("public", [], "GeneralCompliance");

    expect(result.sharedWithUsers).toBeNull();
    expect(result.guardrail).toBeNull();
  });

  it("should return no errors for valid private sharing", () => {
    const result = validateSharing("private", [], "GeneralCompliance");

    expect(result.sharedWithUsers).toBeNull();
    expect(result.guardrail).toBeNull();
  });

  it("should return no errors for valid shared with users", () => {
    const result = validateSharing(
      "shared",
      ["user1", "user2"],
      "GeneralCompliance",
    );

    expect(result.sharedWithUsers).toBeNull();
    expect(result.guardrail).toBeNull();
  });

  it("should validate shared users are required for shared visibility", () => {
    const result = validateSharing("shared", [], "GeneralCompliance");

    expect(result.sharedWithUsers).toBe(
      "scenarios.validation.sharedUsersRequired",
    );
  });

  it("should validate guardrail type is required", () => {
    const result = validateSharing("private", [], "");

    expect(result.guardrail).toBe("scenarios.validation.guardrailRequired");
  });
});

describe("validateForm", () => {
  it("should validate entire form and return isValid=true when all valid", () => {
    const formData = {
      title: "Valid Title",
      description: "This is a valid description that is long enough.",
      difficulty: "normal" as DifficultyLevel,
      category: "general",
      language: "ja",
      npc: {
        name: "John Doe",
        role: "CEO",
        company: "ACME Corp",
        personality: ["Friendly", "Professional"],
        description: "NPC Description",
      },
      objectives: ["Objective 1", "Objective 2"],
      initialMetrics: {
        angerLevel: 1,
        trustLevel: 3,
        progressLevel: 2,
      },
      goals: [
        {
          id: "1",
          description: "Goal 1",
          isRequired: true,
          priority: 3,
          criteria: ["Criteria 1", "Criteria 2"],
        },
      ],
      visibility: "private" as "public" | "private" | "shared",
      sharedWithUsers: [],
      guardrail: "GeneralCompliance",
    };

    const result = validateForm(formData);

    expect(result.isValid).toBe(true);
    expect(
      Object.values(result.basicInfo).every((error) => error === null),
    ).toBe(true);
    expect(Object.values(result.npcInfo).every((error) => error === null)).toBe(
      true,
    );
    // goals オブジェクトのプロパティは変更されたため、一つずつチェックする代わりに
    // goals のプロパティがすべてnullであることを確認
    expect(Object.values(result.goals).every((error) => error === null)).toBe(
      true,
    );
    expect(Object.values(result.sharing).every((error) => error === null)).toBe(
      true,
    );
  });

  it("should validate entire form and return isValid=false when any section invalid", () => {
    const formData = {
      title: "", // Invalid - required
      description: "This is a valid description that is long enough.",
      difficulty: "normal" as DifficultyLevel,
      category: "general",
      npc: {
        name: "John Doe",
        role: "CEO",
        company: "ACME Corp",
        personality: ["Friendly", "Professional"],
        description: "NPC Description",
      },
      objectives: ["Objective 1", "Objective 2"],
      initialMetrics: {
        angerLevel: 1,
        trustLevel: 3,
        progressLevel: 2,
      },
      goals: [
        {
          id: "1",
          description: "Goal 1",
          isRequired: true,
          priority: 3,
          criteria: ["Criteria 1", "Criteria 2"],
        },
      ],
      language: "ja",
      visibility: "private" as "public" | "private" | "shared",
      sharedWithUsers: [],
      guardrail: "GeneralCompliance",
    };

    const result = validateForm(formData);

    expect(result.isValid).toBe(false);
    expect(result.basicInfo.title).toBe("scenarios.validation.titleRequired");
  });
});
