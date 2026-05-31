import { renderHook } from "@testing-library/react";
import { useReferenceCheck } from "../../hooks/useReferenceCheck";
import type { ReferenceCheckResult } from "../../types/api";

/**
 * useReferenceCheckフックのテスト
 *
 * 3分類評価（appropriate / not_applicable / issue）のうち、
 * 「問題あり (issue)」のみがissuesCountにカウントされることを検証する。
 */
describe("useReferenceCheck", () => {
  /**
   * テスト用のリファレンスチェック結果を生成するヘルパー
   */
  const createResult = (
    evaluations: ReferenceCheckResult["messages"][number]["evaluation"][],
  ): ReferenceCheckResult => ({
    messages: evaluations.map((evaluation, index) => ({
      message: `メッセージ${index + 1}`,
      relatedDocument: "",
      reviewComment: "",
      evaluation,
    })),
    summary: {
      totalMessages: evaluations.length,
      checkedMessages: evaluations.length,
    },
  });

  test("initialDataがnullの場合、issuesCountは0になる", () => {
    const { result } = renderHook(() => useReferenceCheck(true, null));

    expect(result.current.data).toBeNull();
    expect(result.current.issuesCount).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.error).toBe("");
  });

  test("issueの発言のみがissuesCountにカウントされる", () => {
    const data = createResult(["issue", "appropriate", "not_applicable"]);
    const { result } = renderHook(() => useReferenceCheck(true, data));

    expect(result.current.issuesCount).toBe(1);
  });

  test("not_applicable（対象外）は問題としてカウントされない", () => {
    // 挨拶や一般的な進行など、資料参照が不要な発言のみのケース
    const data = createResult(["not_applicable", "not_applicable"]);
    const { result } = renderHook(() => useReferenceCheck(true, data));

    expect(result.current.issuesCount).toBe(0);
  });

  test("appropriate（適切）のみの場合、issuesCountは0になる", () => {
    const data = createResult(["appropriate", "appropriate"]);
    const { result } = renderHook(() => useReferenceCheck(true, data));

    expect(result.current.issuesCount).toBe(0);
  });

  test("複数のissueがある場合、その件数がカウントされる", () => {
    const data = createResult([
      "issue",
      "issue",
      "appropriate",
      "not_applicable",
      "issue",
    ]);
    const { result } = renderHook(() => useReferenceCheck(true, data));

    expect(result.current.issuesCount).toBe(3);
  });

  test("isVisibleがfalseの場合、dataはnullになるがissuesCountは計算される", () => {
    const data = createResult(["issue", "appropriate"]);
    const { result } = renderHook(() => useReferenceCheck(false, data));

    expect(result.current.data).toBeNull();
    expect(result.current.issuesCount).toBe(1);
  });
});
