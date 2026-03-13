/**
 * GoalResultsSection コンポーネントのテスト
 *
 * バグ再現: goalStatusesにachieved: trueのデータがあるのに
 * 結果画面で0/1（未達成）と表示される問題の回帰テスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import GoalResultsSection from "../components/conversation/GoalResultsSection";
import type { Goal, GoalStatus } from "../types/index";

// i18next モック
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback,
  }),
}));

describe("GoalResultsSection", () => {
  const baseGoal: Goal = {
    id: "goal-1770703368830",
    description: "挨拶をする",
    isRequired: true,
    priority: 3,
    criteria: ["挨拶をします"],
  };

  describe("ゴール達成状況の正しい表示", () => {
    test("achieved: trueのgoalStatusがある場合、達成ゴール数が正しく表示される", () => {
      const goals: Goal[] = [baseGoal];
      const goalStatuses: GoalStatus[] = [
        {
          goalId: "goal-1770703368830",
          achieved: true,
          progress: 100,
          achievedAt: new Date(1770706147346),
        },
      ];

      render(<GoalResultsSection goals={goals} goalStatuses={goalStatuses} />);

      // 達成ゴール数・必須ゴール達成の両方が1/1と表示されること
      const counts = screen.getAllByText("1 / 1");
      expect(counts).toHaveLength(2); // 達成ゴール数 + 必須ゴール達成
      // プログレスが100%と表示されること
      expect(screen.getByText("100%")).toBeTruthy();
      // チェックアイコンが表示されること
      expect(screen.getByTestId("CheckCircleIcon")).toBeTruthy();
    });

    test("achieved: falseのgoalStatusがある場合、未達成として表示される", () => {
      const goals: Goal[] = [baseGoal];
      const goalStatuses: GoalStatus[] = [
        {
          goalId: "goal-1770703368830",
          achieved: false,
          progress: 0,
        },
      ];

      render(<GoalResultsSection goals={goals} goalStatuses={goalStatuses} />);

      // 達成ゴール数・必須ゴール達成の両方が0/1と表示されること
      const counts = screen.getAllByText("0 / 1");
      expect(counts).toHaveLength(2);
      // キャンセルアイコンが表示されること
      expect(screen.getByTestId("CancelIcon")).toBeTruthy();
    });

    test("goalStatusesが空配列の場合、全て未達成として表示される（バグ再現シナリオ）", () => {
      // このテストケースが今回のバグの再現
      // バックエンドから goalResults が null で返ってきた場合、
      // フロントで goalStatuses が空配列になり、全て未達成として表示される
      const goals: Goal[] = [baseGoal];
      const goalStatuses: GoalStatus[] = [];

      render(<GoalResultsSection goals={goals} goalStatuses={goalStatuses} />);

      // 達成ゴール数が0/1と表示されること
      const counts = screen.getAllByText("0 / 1");
      expect(counts).toHaveLength(2);
      // プログレスが0%と表示されること
      expect(screen.getByText("0%")).toBeTruthy();
    });

    test("goalIdが一致しない場合、デフォルト値（未達成）が使われる", () => {
      const goals: Goal[] = [baseGoal];
      const goalStatuses: GoalStatus[] = [
        {
          goalId: "goal-different-id",
          achieved: true,
          progress: 100,
        },
      ];

      render(<GoalResultsSection goals={goals} goalStatuses={goalStatuses} />);

      // goalIdが一致しないため、必須ゴール達成は0/1
      // ただしgoalStatuses.filter(s => s.achieved)は1なので達成ゴール数は1/1
      expect(screen.getByText("0 / 1")).toBeTruthy(); // 必須ゴール達成
    });
  });

  describe("複数ゴールの達成状況", () => {
    test("複数ゴールで一部達成の場合、正しいカウントが表示される", () => {
      const goals: Goal[] = [
        baseGoal,
        {
          id: "goal-2",
          description: "自己紹介をする",
          isRequired: false,
          priority: 2,
          criteria: ["自己紹介をします"],
        },
      ];
      const goalStatuses: GoalStatus[] = [
        {
          goalId: "goal-1770703368830",
          achieved: true,
          progress: 100,
        },
        {
          goalId: "goal-2",
          achieved: false,
          progress: 30,
        },
      ];

      render(<GoalResultsSection goals={goals} goalStatuses={goalStatuses} />);

      // 達成ゴール数が1/2と表示されること
      expect(screen.getByText("1 / 2")).toBeTruthy();
      // プログレスバーの値が表示されること
      expect(screen.getByText("100%")).toBeTruthy();
      expect(screen.getByText("30%")).toBeTruthy();
    });
  });

  describe("必須ゴールの達成状況", () => {
    test("必須ゴールが達成された場合、必須ゴール達成数が正しく表示される", () => {
      const goals: Goal[] = [
        { ...baseGoal, isRequired: true },
        {
          id: "goal-2",
          description: "自己紹介をする",
          isRequired: false,
          priority: 2,
          criteria: [],
        },
      ];
      const goalStatuses: GoalStatus[] = [
        {
          goalId: "goal-1770703368830",
          achieved: true,
          progress: 100,
        },
        {
          goalId: "goal-2",
          achieved: true,
          progress: 100,
        },
      ];

      render(<GoalResultsSection goals={goals} goalStatuses={goalStatuses} />);

      // 達成ゴール数が2/2
      expect(screen.getByText("2 / 2")).toBeTruthy();
      // 必須ゴール達成が1/1
      expect(screen.getByText("1 / 1")).toBeTruthy();
    });
  });

  describe("goalsが空の場合", () => {
    test("goalsが空配列の場合、何も表示されない", () => {
      const { container } = render(
        <GoalResultsSection goals={[]} goalStatuses={[]} />,
      );
      expect(container.innerHTML).toBe("");
    });
  });
});
