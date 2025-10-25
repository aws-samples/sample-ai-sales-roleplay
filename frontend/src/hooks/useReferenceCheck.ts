import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ReferenceCheckResult } from "../types/api";
import { ApiService } from "../services/ApiService";
import { getErrorType } from "../utils/referenceCheckErrorHandling";

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
 * @param sessionId セッションID
 * @param language 言語設定 ("ja" または "en")
 * @param isVisible コンポーネントが表示されているかどうか
 * @returns リファレンスチェックの状態と操作関数
 */
export const useReferenceCheck = (
  sessionId: string,
  language: string = "ja",
  isVisible: boolean = true,
): ReferenceCheckState & {
  refetch: () => Promise<void>;
} => {
  const { t } = useTranslation();
  const [data, setData] = useState<ReferenceCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [shouldRetry, setShouldRetry] = useState<boolean>(false);

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const apiService = ApiService.getInstance();

  // ポーリング間隔（10秒）
  const POLLING_INTERVAL = 10000;

  /**
   * リトライ処理をクリアする
   */
  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setShouldRetry(false);
    setIsAnalyzing(false);
  }, []);

  /**
   * リファレンスチェック結果を取得する
   */
  const fetchReferenceCheck = useCallback(async () => {
    if (!sessionId || !isVisible) return;

    setIsLoading(true);
    setError("");

    try {
      const result = await apiService.getReferenceCheck(sessionId, language);

      if (result?.referenceCheck) {
        setData(result.referenceCheck);
        setShouldRetry(false);
        setIsAnalyzing(false);
      } else if (result && "messages" in result && "summary" in result) {
        // APIが直接ReferenceCheckResultを返す場合の対応
        setData(result as unknown as ReferenceCheckResult);
        setShouldRetry(false);
        setIsAnalyzing(false);
      } else {
        setData(null);
      }
    } catch (err: unknown) {
      console.error("リファレンスチェック取得エラー:", err);

      const errorType = getErrorType(err);

      switch (errorType) {
        case "in-progress":
        case "not-found":
        case "timeout":
          // 分析中として扱い、定期的にポーリング
          setData(null);
          setError("");
          setIsAnalyzing(true);
          setShouldRetry(true);
          break;
        default:
          // その他のエラーの場合はエラーメッセージを表示
          setData(null);
          setError(
            t(
              "referenceCheck.fetchError",
              "リファレンスチェック結果の取得に失敗しました",
            ),
          );
          setIsAnalyzing(false);
          setShouldRetry(false);
          break;
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, language, isVisible, apiService, t]);

  /**
   * 問題があるメッセージの数を計算
   */
  const issuesCount = data?.messages
    ? data.messages.filter((msg) => !msg.related).length
    : 0;

  // 初期データ取得
  useEffect(() => {
    if (isVisible && sessionId) {
      fetchReferenceCheck();
    }
  }, [sessionId, isVisible, fetchReferenceCheck]);

  // リトライ処理
  useEffect(() => {
    if (
      shouldRetry &&
      !data &&
      !isLoading &&
      !error &&
      isVisible &&
      sessionId
    ) {
      clearRetryTimeout();
      retryTimeoutRef.current = setTimeout(() => {
        fetchReferenceCheck();
      }, POLLING_INTERVAL);
    } else if (data || error) {
      clearRetryTimeout();
      setIsAnalyzing(false);
    }

    return () => clearRetryTimeout();
  }, [
    shouldRetry,
    data,
    isLoading,
    error,
    isVisible,
    sessionId,
    fetchReferenceCheck,
    clearRetryTimeout,
  ]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      clearRetryTimeout();
    };
  }, [clearRetryTimeout]);

  return {
    data,
    isLoading,
    isAnalyzing,
    error,
    issuesCount,
    refetch: fetchReferenceCheck,
  };
};
