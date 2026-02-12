import React from "react";
import { Box, Typography } from "@mui/material";
import { Scenario } from "../../types/index";
import { useTranslation } from "react-i18next";

interface ScenarioPanelProps {
  scenario: Scenario;
}

/**
 * シナリオ説明パネルコンポーネント
 * 右側オーバーレイ内にシナリオの説明文を表示する
 */
const ScenarioPanel: React.FC<ScenarioPanelProps> = ({ scenario }) => {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        background: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(8px)",
        borderRadius: 3,
        p: "12px 16px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
      role="region"
      aria-label={t("rightPanels.scenarioTitle")}
    >
      <Typography
        sx={{
          fontSize: "0.8125rem",
          fontWeight: 700,
          mb: 0.75,
          color: "text.secondary",
        }}
      >
        {t("rightPanels.scenarioTitle")}
      </Typography>
      <Typography
        sx={{
          fontSize: "0.8125rem",
          lineHeight: 1.6,
          color: "text.primary",
        }}
      >
        {scenario.description}
      </Typography>
    </Box>
  );
};

export default ScenarioPanel;
