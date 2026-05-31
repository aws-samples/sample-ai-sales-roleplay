import { ReferenceCheckResult } from "../types/api";

/**
 * リファレンスチェックの状態
 */
export interface ReferenceCheckState {
  data: ReferenceCheckResult | null;
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string;
  issuesCount: number;
}

/**
 * リファレンスチェック用カスタムフック
 * Step Functionsで取得済みのリファレンスチェック結果を表示するためのフック
 * 
 * @param isVisible コンポーネントが表示されているかどうか
 * @param initialData Step Functionsで取得済みのリファレンスチェック結果
 * @returns リファレンスチェックの状態
 */
export const useReferenceCheck = (
  isVisible = true,
  initialData: ReferenceCheckResult | null = null,
): ReferenceCheckState => {
  /**
   * 問題があるメッセージの数を計算
   * 「問題あり (issue)」のみをカウントする。
   * 「対象外 (not_applicable)」（挨拶・一般的な進行など）は問題として扱わない。
   */
  const issuesCount = initialData?.messages
    ? initialData.messages.filter((msg) => msg.evaluation === "issue").length
    : 0;

  return {
    data: isVisible ? initialData : null,
    isLoading: false,
    isAnalyzing: false,
    error: "",
    issuesCount,
  };
};
