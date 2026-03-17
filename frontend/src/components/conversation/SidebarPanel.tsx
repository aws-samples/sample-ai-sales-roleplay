import React, { useState } from "react";
import { Box, Tabs, Tab, IconButton, Tooltip } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import AudioSettingsPanel from "./AudioSettingsPanel";
import MetricsPanel from "./MetricsPanel";
import GoalsPanel from "./GoalsPanel";
import { Metrics, Goal, GoalStatus } from "../../types/index";
import { useTranslation } from "react-i18next";

interface SidebarPanelProps {
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  audioVolume: number;
  setAudioVolume: (volume: number) => void;
  speechRate: number;
  setSpeechRate: (rate: number) => void;
  currentMetrics: Metrics;
  prevMetrics: Metrics | null;
  metricsUpdating: boolean;

  goals: Goal[];
  goalStatuses: GoalStatus[];
}

/**
 * サイドバーパネルコンポーネント
 */
const SidebarPanel: React.FC<SidebarPanelProps> = ({
  audioEnabled,
  setAudioEnabled,
  audioVolume,
  setAudioVolume,
  speechRate,
  setSpeechRate,
  currentMetrics,
  prevMetrics,
  metricsUpdating,
  goals,
  goalStatuses,
}) => {
  const { t } = useTranslation();
  // タブ切り替え用の状態
  const [tabValue, setTabValue] = useState(0);
  // サイドバーの折りたたみ状態
  const [collapsed, setCollapsed] = useState(false);

  // タブ変更ハンドラー
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // 折りたたみ切り替えハンドラー
  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  return (
    <Box
      width={collapsed ? "50px" : "260px"}
      display="flex"
      flexDirection="column"
      sx={{
        minWidth: collapsed ? 50 : 260,
        maxWidth: collapsed ? 50 : 260,
        transition: "width 0.3s, min-width 0.3s, max-width 0.3s",
        writingMode: "horizontal-tb",
        "& *": {
          writingMode: "horizontal-tb !important",
        },
        "@media (max-width: 1200px)": {
          minWidth: collapsed ? 50 : 240,
          maxWidth: collapsed ? 50 : 240,
          width: collapsed ? "50px" : "240px",
        },
        "@media (max-width: 960px)": {
          minWidth: "100%",
          maxWidth: "100%",
          width: "100%",
        },
      }}
    >
      {/* 折りたたみボタン */}
      <Box
        display="flex"
        justifyContent="flex-end"
        alignItems="center"
        mb={1}
        sx={{
          "@media (max-width: 960px)": {
            display: "none",
          },
        }}
      >
        <Tooltip
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        >
          <IconButton onClick={toggleCollapse} size="small">
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        </Tooltip>
      </Box>

      {!collapsed ? (
        // 展開時の表示
        <>
          {/* タブ切り替え */}
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{ mb: 2 }}
            aria-label={t("sidebar.a11y.panelSwitcher")}
          >
            <Tab
              label={t("sidebar.tabs.evaluation")}
              id="metrics-tab"
              aria-controls="metrics-panel"
            />
            <Tab
              label={t("sidebar.tabs.goals")}
              id="goals-tab"
              aria-controls="goals-panel"
            />
          </Tabs>

          {/* タブパネル */}
          <Box
            hidden={tabValue !== 0}
            id="metrics-panel"
            aria-labelledby="metrics-tab"
          >
            <MetricsPanel
              currentMetrics={currentMetrics}
              prevMetrics={prevMetrics}
              metricsUpdating={metricsUpdating}
            />
          </Box>

          <Box
            hidden={tabValue !== 1}
            id="goals-panel"
            aria-labelledby="goals-tab"
          >
            <GoalsPanel goals={goals} goalStatuses={goalStatuses} />
          </Box>

          {/* 設定パネル - 常に表示 */}
          <Box mt={2}>
            <AudioSettingsPanel
              audioEnabled={audioEnabled}
              setAudioEnabled={setAudioEnabled}
              audioVolume={audioVolume}
              setAudioVolume={setAudioVolume}
              speechRate={speechRate}
              setSpeechRate={setSpeechRate}
            />
          </Box>
        </>
      ) : (
        // 折りたたみ時の表示（アイコンのみ）
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap={2}
          mt={2}
        >
          <Tooltip title={t("sidebar.tabs.evaluation")} placement="right">
            <IconButton
              onClick={() => {
                setTabValue(0);
                setCollapsed(false);
              }}
              color={tabValue === 0 ? "primary" : "default"}
            >
              📊
            </IconButton>
          </Tooltip>

          <Tooltip title={t("sidebar.tabs.goals")} placement="right">
            <IconButton
              onClick={() => {
                setTabValue(1);
                setCollapsed(false);
              }}
              color={tabValue === 1 ? "primary" : "default"}
            >
              🏆
            </IconButton>
          </Tooltip>

          <Tooltip title={t("sidebar.expandToShowSettings")} placement="right">
            <IconButton onClick={() => setCollapsed(false)} color="default">
              ⚙️
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
};

export default SidebarPanel;
