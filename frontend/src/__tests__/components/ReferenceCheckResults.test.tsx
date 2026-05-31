import React from "react";
import { render, screen } from "@testing-library/react";
import ReferenceCheckResults from "../../components/referenceCheck/ReferenceCheckResults";
import type { ReferenceCheckResult } from "../../types/api";

// i18nのモック（デフォルト値を返す）
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, _defaultValue?: unknown, options?: unknown) => {
      const translations: { [key: string]: string } = {
        "referenceCheck.noIssuesTitle": "問題なし",
        "referenceCheck.noIssues": "整合性に問題は見つかりませんでした。",
        "referenceCheck.issuesFoundTitle": "問題が発見されました",
        "referenceCheck.issuesFoundDescription": "問題が見つかりました。",
        "referenceCheck.problemMessages": "問題のあるメッセージ",
        "referenceCheck.allMessages": "全メッセージの詳細",
        "referenceCheck.status.success": "適切",
        "referenceCheck.status.issue": "問題あり",
        "referenceCheck.status.notApplicable": "対象外",
        "referenceCheck.userMessage": "ユーザーの発言",
        "referenceCheck.relatedDocument": "関連ドキュメント",
        "referenceCheck.reviewComment": "レビューコメント",
        "referenceCheck.explanationTitle": "リファレンスチェックについて",
        "referenceCheck.explanation1": "説明1",
        "referenceCheck.explanation2": "説明2",
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
 * ReferenceCheckResultsコンポーネントのテスト
 *
 * issuesCountに応じた表示分岐と、問題リストに「issue」のみが
 * 抽出されることを検証する。
 */
describe("ReferenceCheckResults", () => {
  const createData = (
    evaluations: ReferenceCheckResult["messages"][number]["evaluation"][],
  ): ReferenceCheckResult => ({
    messages: evaluations.map((evaluation, index) => ({
      message: `発言${index + 1}`,
      relatedDocument: "",
      reviewComment: "",
      evaluation,
    })),
    summary: {
      totalMessages: evaluations.length,
      checkedMessages: evaluations.length,
    },
  });

  test("issuesCountが0の場合「問題なし」が表示される", () => {
    const data = createData(["appropriate", "not_applicable"]);
    render(<ReferenceCheckResults data={data} issuesCount={0} />);

    expect(screen.getByText("問題なし")).toBeInTheDocument();
    expect(screen.queryByText("問題が発見されました")).not.toBeInTheDocument();
  });

  test("対象外のみの会話では「問題なし」が表示される", () => {
    // 挨拶や一般的な進行など資料参照が不要な発言のみのケース
    const data = createData(["not_applicable", "not_applicable"]);
    render(<ReferenceCheckResults data={data} issuesCount={0} />);

    expect(screen.getByText("問題なし")).toBeInTheDocument();
  });

  test("issuesCountが1以上の場合「問題が発見されました」が表示される", () => {
    const data = createData(["issue", "appropriate"]);
    render(<ReferenceCheckResults data={data} issuesCount={1} />);

    // AlertTitle内は件数表示で複数ノードに分割されるため部分一致で確認
    expect(
      screen.getByText((content) => content.includes("問題が発見されました")),
    ).toBeInTheDocument();
    expect(screen.queryByText("問題なし")).not.toBeInTheDocument();
  });

  test("問題のあるメッセージセクションにはissueのみが抽出される", () => {
    const data = createData(["issue", "appropriate", "not_applicable"]);
    render(<ReferenceCheckResults data={data} issuesCount={1} />);

    // 「問題のあるメッセージ」見出しが表示される
    expect(screen.getByText("問題のあるメッセージ")).toBeInTheDocument();

    // 問題ありセクション + 全メッセージ詳細で「問題あり」ラベルが表示される
    // issueは1件なので、問題セクションに1つ、全メッセージに1つ = 2箇所
    expect(screen.getAllByText("問題あり").length).toBe(2);
  });

  test("全メッセージ詳細セクションには全件数が表示される", () => {
    const data = createData(["issue", "appropriate", "not_applicable"]);
    render(<ReferenceCheckResults data={data} issuesCount={1} />);

    // 全メッセージ詳細セクションが存在する（件数表示で分割されるため部分一致）
    expect(
      screen.getByText((content) => content.includes("全メッセージの詳細")),
    ).toBeInTheDocument();
    // 対象外ラベルが全メッセージ詳細に表示される
    expect(screen.getByText("対象外")).toBeInTheDocument();
  });
});
