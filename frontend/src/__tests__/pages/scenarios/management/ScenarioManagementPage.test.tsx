import { render, screen} from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
// テスト用のi18n設定
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  lng: "ja",
  fallbackLng: "ja",
  debug: false,
  interpolation: {
    escapeValue: false,
  },
  resources: {
    ja: {
      translation: {
        "scenarios.management.title": "シナリオ管理",
        "scenarios.management.subtitle":
          "シナリオの編集、削除、インポート、エクスポートができます",
        "scenarios.management.importButton": "シナリオをインポート",
        "scenarios.management.scenarioTitle": "タイトル",
        "scenarios.management.difficulty": "難易度",
        "scenarios.management.category": "カテゴリ",
        "scenarios.management.language": "言語",
        "scenarios.management.actions": "アクション",
        "scenarios.beginner": "初級",
        "scenarios.intermediate": "中級",
        "scenarios.advanced": "上級",
        "common.processing": "処理中...",
      },
    },
  },
});
import ScenarioManagementPage from "../../../../pages/scenarios/management/ScenarioManagementPage";

// AWS Amplifyのモック
jest.mock("aws-amplify/auth", () => ({
  getCurrentUser: jest.fn().mockResolvedValue({
    userId: "test-user-id",
    username: "testuser",
  }),
}));

// ApiServiceのモック
jest.mock("../../../../services/ApiService", () => {
  return {
    ApiService: {
      getInstance: jest.fn().mockReturnValue({
        getScenarios: jest.fn().mockResolvedValue({
          scenarios: [
            {
              scenarioId: "test-scenario-1",
              title: "テストシナリオ1",
              difficulty: "beginner",
              category: "Technology",
              language: "ja",
              industry: "Technology",
              createdBy: "test-user-id",
            },
          ],
        }),
        exportScenario: jest.fn().mockResolvedValue({
          scenarios: [
            { scenarioId: "test-scenario-1", title: "テストシナリオ1" },
          ],
          npcs: [{ id: "npc-1", name: "NPC 1" }],
        }),
      }),
    },
  };
});

describe("ScenarioManagementPage Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders component with basic elements", () => {
    render(
      <BrowserRouter>
        <I18nextProvider i18n={i18n}>
          <ScenarioManagementPage />
        </I18nextProvider>
      </BrowserRouter>,
    );

    // 基本的な要素が表示されることを確認
    expect(screen.getByText(/シナリオ管理/i)).toBeInTheDocument();
  });
});
