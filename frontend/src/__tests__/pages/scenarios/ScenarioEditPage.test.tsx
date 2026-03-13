import "@testing-library/jest-dom";

// モック
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja", changeLanguage: jest.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: jest.fn() },
}));

const mockApiService = {
  getGuardrails: jest.fn().mockResolvedValue([]),
  getScenarioDetail: jest.fn().mockResolvedValue({}),
  updateScenario: jest.fn().mockResolvedValue({}),
};

jest.mock("../../../services/ApiService", () => ({
  ApiService: { getInstance: jest.fn(() => mockApiService) },
}));

jest.mock("../../../services/AvatarService", () => ({
  AvatarService: {
    getInstance: jest.fn(() => ({
      createAvatar: jest.fn().mockResolvedValue({
        avatarId: "new-avatar-id-789",
        uploadUrl: "https://s3.example.com/upload",
        formData: {},
      }),
      uploadVrmFile: jest.fn().mockResolvedValue(undefined),
      confirmUpload: jest.fn().mockResolvedValue(undefined),
      deleteAvatar: jest.fn().mockResolvedValue(undefined),
      getAvatarDetail: jest.fn().mockResolvedValue(null),
    })),
  },
}));

describe("ScenarioEditPage - avatarId persistence in updateScenario", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("includes avatarId in updateScenario request when avatar exists", async () => {
    const scenarioData = {
      title: "テスト",
      npc: { name: "NPC", role: "役職", company: "会社", voiceId: "Takumi" },
      avatarId: "existing-avatar-id-456",
    };

    await mockApiService.updateScenario("test-scenario-1", scenarioData);

    expect(mockApiService.updateScenario).toHaveBeenCalledWith(
      "test-scenario-1",
      expect.objectContaining({ avatarId: "existing-avatar-id-456" }),
    );
  });

  it("includes new avatarId in updateScenario request when avatar is replaced", async () => {
    const scenarioData = {
      title: "テスト",
      npc: { name: "NPC", role: "役職", company: "会社", voiceId: "Takumi" },
      avatarId: "new-avatar-id-789",
    };

    await mockApiService.updateScenario("test-scenario-1", scenarioData);

    expect(mockApiService.updateScenario).toHaveBeenCalledWith(
      "test-scenario-1",
      expect.objectContaining({ avatarId: "new-avatar-id-789" }),
    );
  });

  it("does not include avatarId when scenario has no avatar", async () => {
    const scenarioData = {
      title: "テスト",
      npc: { name: "NPC", role: "役職", company: "会社", voiceId: "Takumi" },
    };

    await mockApiService.updateScenario("test-scenario-1", scenarioData);

    expect(mockApiService.updateScenario).toHaveBeenCalledWith(
      "test-scenario-1",
      expect.not.objectContaining({ avatarId: expect.anything() }),
    );
  });
});
