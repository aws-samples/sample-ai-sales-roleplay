import React from "react";
import {
  Box,
  Typography,
  Chip,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  RemoveCircleOutline as RemoveCircleOutlineIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { ReferenceCheckEvaluation } from "../../types/api";

/**
 * メッセージの型定義
 */
interface Message {
  message: string;
  evaluation: ReferenceCheckEvaluation;
  relatedDocument?: string;
  reviewComment?: string;
}

/**
 * メッセージアコーディオンのプロパティ
 */
interface MessageAccordionProps {
  message: Message;
  index: number;
}

/**
 * メッセージの評価区分に応じたプロパティを取得
 * @param evaluation 評価区分（3分類）
 * @param t 翻訳関数
 * @returns メッセージプロパティ
 */
const getMessageProps = (
  evaluation: ReferenceCheckEvaluation,
  t: (key: string, defaultValue: string) => string,
) => {
  switch (evaluation) {
    case "appropriate":
      return {
        color: "success" as const,
        icon: <CheckCircleIcon />,
        label: t("referenceCheck.status.success", "適切"),
        commentBgColor: "#e8f5e8",
      };
    case "issue":
      return {
        color: "warning" as const,
        icon: <WarningIcon />,
        label: t("referenceCheck.status.issue", "問題あり"),
        commentBgColor: "#fff3e0",
      };
    case "not_applicable":
    default:
      return {
        color: "default" as const,
        icon: <RemoveCircleOutlineIcon />,
        label: t("referenceCheck.status.notApplicable", "対象外"),
        commentBgColor: "#f5f5f5",
      };
  }
};

/**
 * メッセージアコーディオンコンポーネント
 */
const MessageAccordion: React.FC<MessageAccordionProps> = ({
  message,
  index,
}) => {
  const { t } = useTranslation();
  const messageProps = getMessageProps(message.evaluation, t);

  return (
    <Accordion sx={{ mb: 2 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display="flex" alignItems="center" gap={2} sx={{ width: "100%" }}>
          <Box display="flex" alignItems="center" gap={1}>
            {messageProps.icon}
            <Typography variant="subtitle1">
              {t("referenceCheck.messageNumber", "メッセージ {{number}}", {
                number: index + 1,
              })}
            </Typography>
          </Box>
          <Chip
            label={messageProps.label}
            color={messageProps.color}
            size="small"
            variant="outlined"
          />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box>
          {/* ユーザーメッセージ */}
          <Paper sx={{ p: 2, mb: 2, bgcolor: "#e3f2fd" }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              {t("referenceCheck.userMessage", "ユーザーの発言")}
            </Typography>
            <Typography variant="body2">{message.message}</Typography>
          </Paper>

          {/* 関連ドキュメント */}
          <Paper sx={{ p: 2, mb: 2, bgcolor: "#f5f5f5" }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {t("referenceCheck.relatedDocument", "関連ドキュメント")}
            </Typography>
            <Typography variant="body2">
              {message.relatedDocument || "N/A"}
            </Typography>
          </Paper>

          {/* レビューコメント */}
          <Paper
            sx={{
              p: 2,
              bgcolor: messageProps.commentBgColor,
            }}
          >
            <Typography
              variant="subtitle2"
              color={
                messageProps.color === "default"
                  ? "text.secondary"
                  : messageProps.color
              }
              gutterBottom
            >
              {t("referenceCheck.reviewComment", "レビューコメント")}
            </Typography>
            <Typography variant="body2">
              {message.reviewComment || "N/A"}
            </Typography>
          </Paper>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default MessageAccordion;
