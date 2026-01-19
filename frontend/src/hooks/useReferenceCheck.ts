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
   */
  const issuesCount = initialData?.messages
    ? initialData.messages.filter((msg) => !msg.related).length
    : 0;

  return {
    data: isVisible ? initialData : null,
    isLoading: false,
    isAnalyzing: false,
    error: "",
    issuesCount,
  };
};
