import React, { useMemo } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress,
  Card,
  CardContent,
  Tooltip,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import type { Goal, GoalStatus } from "../../types/index";
import { useTranslation } from "react-i18next";

interface GoalsPanelProps {
  goals: Goal[];
  goalStatuses: GoalStatus[];
}

/**
 * ゴール表示パネルコンポーネント
 * 会話シナリオのゴールとその達成状況を表示する
 */
const GoalsPanel: React.FC<GoalsPanelProps> = ({ goals, goalStatuses }) => {
  const { t } = useTranslation();
  
  const currentTime = useMemo(() => {
    const now = new Date();
    return now.getTime();
  }, []);

  if (!goals || goals.length === 0) {
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t("conversation.negotiationGoal")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            このシナリオにはゴールが設定されていません。
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {t("conversation.negotiationGoal")}
        </Typography>
        <List dense>
          {goals.map((goal) => {
            const status = goalStatuses.find((s) => s.goalId === goal.id) || {
              goalId: goal.id,
              progress: 0,
              achieved: false,
            };

            return (
              <ListItem
                key={goal.id}
                sx={{
                  mb: 1,
                  bgcolor: status.achieved ? "success.50" : "transparent",
                  borderRadius: 1,
                  transition: "all 0.5s",
                  animation:
                    status.achieved &&
                    status.achievedAt &&
                    new Date(status.achievedAt).getTime() > currentTime - 5000
                      ? "pulse 1s ease-in-out 3"
                      : "none",
                  "@keyframes pulse": {
                    "0%": { boxShadow: "0 0 0 0 rgba(76, 175, 80, 0.7)" },
                    "70%": { boxShadow: "0 0 0 10px rgba(76, 175, 80, 0)" },
                    "100%": { boxShadow: "0 0 0 0 rgba(76, 175, 80, 0)" },
                  },
                }}
              >
                <ListItemIcon>
                  {status.achieved ? (
                    <CheckCircleIcon color="success" />
                  ) : (
                    <RadioButtonUncheckedIcon color="action" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: goal.isRequired ? "bold" : "normal",
                          color: status.achieved
                            ? "success.main"
                            : "text.primary",
                        }}
                      >
                        {goal.description}
                      </Typography>
                      {goal.isRequired && (
                        <Tooltip title="必須ゴール">
                          <PriorityHighIcon
                            color="primary"
                            fontSize="small"
                            sx={{ ml: 1, width: 16, height: 16 }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  }
                  secondary={
                    <Typography component="div">
                      <Box
                        sx={{ display: "flex", alignItems: "center", mt: 0.5 }}
                      >
                        <LinearProgress
                          variant="determinate"
                          value={status.progress}
                          sx={{
                            flexGrow: 1,
                            mr: 1,
                            height: 6,
                            borderRadius: 3,
                          }}
                          color={status.achieved ? "success" : "primary"}
                        />
                        <Typography
                          variant="caption"
                          color={
                            status.achieved ? "success.main" : "text.secondary"
                          }
                        >
                          {status.progress}%
                        </Typography>
                      </Box>
                    </Typography>
                  }
                />
              </ListItem>
            );
          })}
        </List>
      </CardContent>
    </Card>
  );
};

export default GoalsPanel;
