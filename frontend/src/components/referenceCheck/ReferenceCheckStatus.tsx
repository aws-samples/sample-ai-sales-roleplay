import React from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  AlertTitle,
} from "@mui/material";
import { useTranslation } from "react-i18next";

/**
 * ステータス表示コンポーネントのプロパティ
 */
interface ReferenceCheckStatusProps {
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string;
  hasData: boolean;
}

/**
 * リファレンスチェックのステータス表示コンポーネント
 */
const ReferenceCheckStatus: React.FC<ReferenceCheckStatusProps> = ({
  isLoading,
  isAnalyzing,
  error,
  hasData,
}) => {
  const { t } = useTranslation();

  // ローディング状態または分析中状態
  if (isLoading || isAnalyzing) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          py: 4,
        }}
      >
        <CircularProgress size={40} sx={{ mb: 2 }} />
        <Typography variant="body1" color="text.secondary">
          {t("referenceCheck.analyzing", "リファレンスチェックを実行中...")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t(
            "referenceCheck.analyzingDescription",
            "ドキュメントとの整合性を確認しています",
          )}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 2, fontStyle: "italic" }}
        >
          {t(
            "referenceCheck.analyzingNote",
            "※ 処理に時間がかかる場合があります。しばらくお待ちください。",
          )}
        </Typography>
      </Box>
    );
  }

  // エラー状態
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        <AlertTitle>{t("referenceCheck.errorTitle", "エラー")}</AlertTitle>
        {error}
      </Alert>
    );
  }

  // データがない場合（PDFがアップロードされていないなど）
  if (!hasData) {
    return (
      <Alert severity="info" sx={{ mb: 3 }}>
        <AlertTitle>
          {t("referenceCheck.noDataTitle", "リファレンスチェックデータなし")}
        </AlertTitle>
        <Typography variant="body2">
          {t(
            "referenceCheck.noData",
            "このセッションにはリファレンスチェックデータがありません。シナリオにPDF資料がアップロードされている場合のみ、リファレンスチェックが実行されます。",
          )}
        </Typography>
      </Alert>
    );
  }

  return null;
};

export default ReferenceCheckStatus;
