import React from "react";
import { Box, Typography } from "@mui/material";
import type { Scenario } from "../../types/index";
import { useTranslation } from "react-i18next";

interface PersonaPanelProps {
  npc: Scenario["npc"];
}

/**
 * ペルソナ情報パネルコンポーネント
 * NPC名、役職、アバターアイコン、ペルソナ説明文を表示する
 */
const PersonaPanel: React.FC<PersonaPanelProps> = ({ npc }) => {
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
      aria-label={t("rightPanels.personaTitle")}
    >
      <Typography
        sx={{
          fontSize: "0.8125rem",
          fontWeight: 700,
          mb: 1,
          color: "text.secondary",
        }}
      >
        {t("rightPanels.personaTitle")}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
        <Box
          sx={{
            fontSize: "1.25rem",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          👤
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>
            {npc.name}
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {t("conversation.npcRole", { role: npc.role })}
          </Typography>
        </Box>
      </Box>
      {npc.description && (
        <Typography
          sx={{
            fontSize: "0.8125rem",
            lineHeight: 1.6,
            color: "text.primary",
          }}
        >
          {npc.description}
        </Typography>
      )}
    </Box>
  );
};

export default PersonaPanel;
