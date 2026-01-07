import React from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  LinearProgress,
  Grid,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import type { Goal, GoalStatus } from "../../types/index";
import { useTranslation } from "react-i18next";

interface GoalResultsSectionProps {
  goals: Goal[];
  goalStatuses: GoalStatus[];
}

/**
 * ゴール達成状況表示セクションコンポーネント
 * 結果画面でゴールの達成状況を表示する
 * i18n対応済み
 */
const GoalResultsSection: React.FC<GoalResultsSectionProps> = ({
  goals,
  goalStatuses,
}) => {
  const { t } = useTranslation();
  if (!goals || goals.length === 0) {
    return null;
  }

  // 達成したゴールの数
  const achievedGoalsCount = goalStatuses.filter(
    (status) => status.achieved,
  ).length;

  // 必須ゴールの達成状況
  const requiredGoals = goals.filter((goal) => goal.isRequired);
  const achievedRequiredGoalsCount = requiredGoals.filter((goal) => {
    const status = goalStatuses.find((s) => s.goalId === goal.id);
    return status && status.achieved;
  }).length;

  return (
    <Paper sx={{ p: 3 }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h6" fontWeight="bold">
          {t("results.goalAchievementStatus", "ゴール達成状況")}
        </Typography>
      </Box>

      <Box mb={3}>
        <Grid container spacing={2}>
          <Grid size={6}>
            <Typography variant="body2" color="text.secondary">
              {t("results.achievedGoalsCount", "達成ゴール数")}
            </Typography>
            <Typography variant="h6">
              {achievedGoalsCount} / {goals.length}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="body2" color="text.secondary">
              {t("results.requiredGoalsAchievement", "必須ゴール達成")}
            </Typography>
            <Typography variant="h6">
              {achievedRequiredGoalsCount} / {requiredGoals.length}
            </Typography>
          </Grid>
        </Grid>
      </Box>

      <Grid container spacing={2}>
        {goals.map((goal) => {
          const status = goalStatuses.find((s) => s.goalId === goal.id) || {
            goalId: goal.id,
            progress: 0,
            achieved: false,
          };

          return (
            <Grid size={12} key={goal.id}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  p: 2,
                  borderRadius: 1,
                  bgcolor: status.achieved
                    ? "success.50"
                    : "background.default",
                  border: "1px solid",
                  borderColor: status.achieved ? "success.light" : "divider",
                }}
              >
                <Box mr={2} mt={0.5}>
                  {status.achieved ? (
                    <CheckCircleIcon color="success" />
                  ) : (
                    <CancelIcon color="action" />
                  )}
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="center" mb={0.5}>
                    <Typography
                      variant="subtitle1"
                      fontWeight={goal.isRequired ? "bold" : "normal"}
                    >
                      {goal.description}
                    </Typography>
                    {goal.isRequired && (
                      <Chip
                        icon={<PriorityHighIcon />}
                        label={t("results.required", "必須")}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Box>

                  <Box display="flex" alignItems="center" mb={1}>
                    <LinearProgress
                      variant="determinate"
                      value={status.progress}
                      sx={{
                        flexGrow: 1,
                        mr: 1,
                        height: 8,
                        borderRadius: 4,
                      }}
                      color={status.achieved ? "success" : "primary"}
                    />
                    <Typography
                      variant="body2"
                      fontWeight="bold"
                      minWidth="40px"
                    >
                      {status.progress}%
                    </Typography>
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    {t("results.priority", "優先度")}: {goal.priority}/5
                  </Typography>
                </Box>
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Paper>
  );
};

export default GoalResultsSection;
