import React from "react";
import { useReferenceCheck } from "../../hooks/useReferenceCheck";
import ReferenceCheckStatus from "./ReferenceCheckStatus";
import ReferenceCheckResults from "./ReferenceCheckResults";
import { ReferenceCheckResult } from "../../types/api";

interface ReferenceCheckProps {
  sessionId: string;
  language?: string;
  isVisible?: boolean;
  /** Step Functionsで取得済みのリファレンスチェック結果（渡された場合はAPIを呼び出さない） */
  initialData?: ReferenceCheckResult | null;
}

/**
 * リファレンスチェック結果表示コンポーネント
 */
const ReferenceCheck: React.FC<ReferenceCheckProps> = ({
  sessionId: _sessionId,
  language: _language = "ja",
  isVisible = true,
  initialData = null,
}) => {
  // sessionIdとlanguageは将来の拡張用に保持（現在はinitialDataを使用）
  void _sessionId;
  void _language;
  const { data, isLoading, isAnalyzing, error, issuesCount } =
    useReferenceCheck(isVisible, initialData);

  // コンポーネントが非表示の場合は何も表示しない
  if (!isVisible) {
    return null;
  }

  // ローディング、分析中、エラー、データなしの場合はステータスを表示
  if (isLoading || isAnalyzing || error || !data) {
    return (
      <ReferenceCheckStatus
        isLoading={isLoading}
        isAnalyzing={isAnalyzing}
        error={error}
        hasData={!!data}
      />
    );
  }

  // データがある場合は結果を表示
  return <ReferenceCheckResults data={data} issuesCount={issuesCount} />;
};

export default ReferenceCheck;
