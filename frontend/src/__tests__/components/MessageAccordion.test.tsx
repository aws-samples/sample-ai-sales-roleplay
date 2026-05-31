import React from "react";
import { render, screen } from "@testing-library/react";
import MessageAccordion from "../../components/referenceCheck/MessageAccordion";
import type { ReferenceCheckEvaluation } from "../../types/api";

// i18nのモック（デフォルト値を返す）
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, _defaultValue?: unknown, options?: unknown) => {
      const translations: { [key: string]: string } = {
        "referenceCheck.status.success": "適切",
        "referenceCheck.status.issue": "問題あり",
        "referenceCheck.status.notApplicable": "対象外",
        "referenceCheck.userMessage": "ユーザーの発言",
        "referenceCheck.relatedDocument": "関連ドキュメント",
        "referenceCheck.reviewComment": "レビューコメント",
      };
      if (key === "referenceCheck.messageNumber") {
        const opts = options as { number: number } | undefined;
        return `メッセージ ${opts?.number ?? ""}`;
      }
      return translations[key] || key;
    },
  }),
}));

/**
 * MessageAccordionコンポーネントのテスト
 *
 * 3分類評価（appropriate / not_applicable / issue）に応じた
 * ステータスラベルが正しく表示されることを検証する。
 */
describe("MessageAccordion", () => {
  const renderAccordion = (evaluation: ReferenceCheckEvaluation) =>
    render(
      <MessageAccordion
        message={{
          message: "テストメッセージ",
          evaluation,
          relatedDocument: "テスト資料",
          reviewComment: "テストコメント",
        }}
        index={0}
      />,
    );

  test("appropriateの場合「適切」ラベルが表示される", () => {
    renderAccordion("appropriate");
    expect(screen.getByText("適切")).toBeInTheDocument();
  });

  test("issueの場合「問題あり」ラベルが表示される", () => {
    renderAccordion("issue");
    expect(screen.getByText("問題あり")).toBeInTheDocument();
  });

  test("not_applicableの場合「対象外」ラベルが表示される", () => {
    renderAccordion("not_applicable");
    expect(screen.getByText("対象外")).toBeInTheDocument();
  });

  test("メッセージ本文・関連ドキュメント・レビューコメントが表示される", () => {
    renderAccordion("issue");
    expect(screen.getByText("テストメッセージ")).toBeInTheDocument();
    expect(screen.getByText("テスト資料")).toBeInTheDocument();
    expect(screen.getByText("テストコメント")).toBeInTheDocument();
  });

  test("メッセージ番号が表示される", () => {
    renderAccordion("appropriate");
    expect(
      screen.getByText((content) => content.startsWith("メッセージ")),
    ).toBeInTheDocument();
  });
});
