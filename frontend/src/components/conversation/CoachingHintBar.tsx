import React from "react";
import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface CoachingHintBarProps {
  hint: string | undefined;
}

/**
 * コーチングヒントバーコンポーネント
 * 💡アイコン + テキストのコンパクトなバー形式
 * 入力エリア上部に表示される
 */
const CoachingHintBar: React.FC<CoachingHintBarProps> = ({ hint }) => {
  const { t } = useTranslation();

  if (!hint) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 1,
        background: "#eef2ff",
        borderTop: "1px solid #c7d2fe",
        fontSize: "0.8125rem",
        lineHeight: 1.5,
        color: "#4f46e5",
        animation: "coachFadeIn 0.3s ease",
        "@keyframes coachFadeIn": {
          from: { opacity: 0, transform: "translateY(4px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          animation: "none",
        },
      }}
      role="status"
      aria-live="polite"
      aria-label={t("coachingHint.label")}
    >
      <Typography
        component="span"
        sx={{ flexShrink: 0, fontSize: "0.875rem" }}
        aria-hidden="true"
      >
        💡
      </Typography>
      <Typography
        component="span"
        sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}
      >
        {hint}
      </Typography>
    </Box>
  );
};

export default CoachingHintBar;
