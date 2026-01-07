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
  sessionId,
  language = "ja",
  isVisible = true,
  initialData = null,
}) => {
  const { data, isLoading, isAnalyzing, error, issuesCount } =
    useReferenceCheck(sessionId, language, isVisible, initialData);

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
