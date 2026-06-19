import React from "react";
import { Box } from "@mui/material";
import GoalsPanel from "./GoalsPanel";
import ScenarioPanel from "./ScenarioPanel";
import PersonaPanel from "./PersonaPanel";
import type { Goal, GoalStatus, Scenario } from "../../types/index";

interface RightPanelContainerProps {
  visible: boolean;
  goals: Goal[];
  goalStatuses: GoalStatus[];
  scenario: Scenario;
}

/**
 * 右側パネルコンテナコンポーネント
 * GoalsPanel + ScenarioPanel + PersonaPanel を縦並びで配置
 * 📋ボタンで一括表示/非表示を制御
 */
const RightPanelContainer: React.FC<RightPanelContainerProps> = ({
  visible,
  goals,
  goalStatuses,
  scenario,
}) => {
  if (!visible) return null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        height: "100%",
        overflowY: "auto",
        p: 1.5,
        // スクロールバーをコンパクトに
        "&::-webkit-scrollbar": { width: 4 },
        "&::-webkit-scrollbar-thumb": {
          backgroundColor: "rgba(0,0,0,0.15)",
          borderRadius: 2,
        },
      }}
    >
      {/* ゴールパネル - 既存GoalsPanelをオーバーレイスタイルでラップ */}
      <Box
        sx={{
          background: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(8px)",
          borderRadius: 3,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          // GoalsPanelのCardスタイルをオーバーライド
          "& .MuiCard-root": {
            boxShadow: "none",
            background: "transparent",
            mt: 0,
          },
          "& .MuiCardContent-root": {
            p: "12px 16px !important",
          },
        }}
      >
        <GoalsPanel goals={goals} goalStatuses={goalStatuses} />
      </Box>

      <ScenarioPanel scenario={scenario} />
      <PersonaPanel npc={scenario.npc} />
    </Box>
  );
};

export default RightPanelContainer;
