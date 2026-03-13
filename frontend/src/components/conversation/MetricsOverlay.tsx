import React from "react";
import { Box, Typography, LinearProgress } from "@mui/material";
import { Metrics } from "../../types/index";
import { useTranslation } from "react-i18next";

interface MetricsOverlayProps {
  currentMetrics: Metrics;
  prevMetrics: Metrics | null;
  metricsUpdating: boolean;
  visible: boolean;
}

/**
 * メトリクスオーバーレイコンポーネント
 * 半透明背景 + blur で左上に表示するコンパクトなメトリクス表示
 */
const MetricsOverlay: React.FC<MetricsOverlayProps> = ({
  currentMetrics,
  visible,
}) => {
  const { t } = useTranslation();

  if (!visible) return null;

  const metrics = [
    {
      label: t("metrics.angerMeter"),
      value: currentMetrics.angerLevel,
      color: "#ef4444",
      ariaLabel: t("metrics.angerMeterTooltip"),
    },
    {
      label: t("metrics.trustLevel"),
      value: currentMetrics.trustLevel,
      color: "#3b82f6",
      ariaLabel: t("metrics.trustLevelTooltip"),
    },
    {
      label: t("metrics.progressLevel"),
      value: currentMetrics.progressLevel,
      color: "#10b981",
      ariaLabel: t("metrics.progressLevelTooltip"),
    },
  ];

  return (
    <Box
      sx={{
        position: "absolute",
        top: 12,
        left: 12,
        background: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(8px)",
        borderRadius: 3,
        p: 1.25,
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        minWidth: 160,
        transition: "opacity 0.2s",
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
        },
      }}
      role="region"
      aria-label={t("metrics.overlay.title")}
    >
      {metrics.map((metric) => (
        <Box
          key={metric.label}
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <Typography
            sx={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
              flexShrink: 0,
              color: metric.color,
            }}
            aria-hidden="true"
          >
            {metric.label}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={metric.value * 10}
            role="progressbar"
            aria-valuenow={metric.value}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-label={metric.label}
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: "rgba(0,0,0,0.06)",
              "& .MuiLinearProgress-bar": {
                backgroundColor: metric.color,
                borderRadius: 3,
                transition: "transform 0.5s ease",
                "@media (prefers-reduced-motion: reduce)": {
                  transition: "none",
                },
              },
            }}
          />
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 700,
              width: 16,
              textAlign: "right",
              color: "text.secondary",
            }}
          >
            {metric.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

export default MetricsOverlay;
