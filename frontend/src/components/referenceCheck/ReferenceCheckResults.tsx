import React from "react";
import {
  Box,
  Typography,
  Alert,
  AlertTitle,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { ReferenceCheckResult } from "../../types/api";
import MessageAccordion from "./MessageAccordion";

/**
 * 結果表示コンポーネントのプロパティ
 */
interface ReferenceCheckResultsProps {
  data: ReferenceCheckResult;
  issuesCount: number;
}

/**
 * 問題があるメッセージかどうかを判定
 * 「問題あり (issue)」のみを問題として扱う。
 * 「対象外 (not_applicable)」（挨拶・一般的な進行など）は問題としない。
 * @param msg メッセージオブジェクト
 * @returns 問題がある場合true
 */
const hasIssue = (msg: { evaluation: string }): boolean => {
  return msg.evaluation === "issue";
};

/**
 * リファレンスチェック結果表示コンポーネント
 */
const ReferenceCheckResults: React.FC<ReferenceCheckResultsProps> = ({
  data,
  issuesCount,
}) => {
  const { t } = useTranslation();

  return (
    <Box>
      {/* 問題がない場合の表示 */}
      {issuesCount === 0 ? (
        <Alert severity="success" sx={{ mb: 3 }}>
          <AlertTitle>
            {t("referenceCheck.noIssuesTitle", "問題なし")}
          </AlertTitle>
          {t(
            "referenceCheck.noIssues",
            "ドキュメントとの整合性に問題は見つかりませんでした。適切な情報提供ができています。",
          )}
        </Alert>
      ) : (
        <>
          {/* 問題がある場合の警告 */}
          <Alert severity="warning" sx={{ mb: 3 }}>
            <AlertTitle>
              {t("referenceCheck.issuesFoundTitle", "問題が発見されました")} (
              {issuesCount}件)
            </AlertTitle>
            {t(
              "referenceCheck.issuesFoundDescription",
              "ドキュメントとの整合性に問題が見つかりました。以下の詳細を確認してください。",
            )}
          </Alert>

          {/* 問題のあるメッセージ詳細 */}
          <Typography variant="h6" gutterBottom sx={{ mt: 3, mb: 2 }}>
            {t("referenceCheck.problemMessages", "問題のあるメッセージ")}
          </Typography>

          {data.messages &&
            data.messages
              .map((msg, originalIndex) => ({ ...msg, originalIndex }))
              .filter((msg) => hasIssue(msg))
              .map((msg) => (
                <MessageAccordion
                  key={`problem-${msg.originalIndex}`}
                  message={msg}
                  index={msg.originalIndex}
                />
              ))}
        </>
      )}

      {/* 全メッセージ詳細（折りたたみ式） */}
      {data.messages && data.messages.length > 0 && (
        <Accordion sx={{ mt: 4 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">
              {t("referenceCheck.allMessages", "全メッセージの詳細")} (
              {data.messages.length}件)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box>
              {data.messages.map((msg, index) => (
                <MessageAccordion
                  key={`all-${index}`}
                  message={msg}
                  index={index}
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* 説明セクション */}
      <Box sx={{ mt: 4, p: 3, bgcolor: "background.default", borderRadius: 2 }}>
        <Typography variant="subtitle1" gutterBottom fontWeight="medium">
          {t("referenceCheck.explanationTitle", "リファレンスチェックについて")}
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t(
            "referenceCheck.explanation1",
            "リファレンスチェックは、営業担当者の発言がシナリオに設定されたドキュメントの内容と整合性があるかを確認する機能です。",
          )}
        </Typography>
        <Typography variant="body2">
          {t(
            "referenceCheck.explanation2",
            "正確な情報提供により、顧客との信頼関係を構築し、営業効果を高めることができます。問題が発見された場合は、ドキュメントの内容を再確認し、正確な情報を提供するよう心がけましょう。",
          )}
        </Typography>
      </Box>
    </Box>
  );
};

export default ReferenceCheckResults;
