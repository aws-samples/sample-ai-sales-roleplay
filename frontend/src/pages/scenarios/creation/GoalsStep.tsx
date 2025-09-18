import React, { useState } from "react";
import {
  Box,
  TextField,
  Typography,
  Slider,
  Paper,
  Stack,
  Button,
  IconButton,
  FormControlLabel,
  Switch,
  Divider,
  Card,
  CardContent,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { GoalsStepProps, GoalFormData } from "../../../types";

const GoalsStep: React.FC<GoalsStepProps> = ({ formData, updateFormData }) => {
  const { t } = useTranslation();

  // 新しいゴール編集用
  const [editingGoal, setEditingGoal] = useState<GoalFormData | null>(null);
  const [isCreatingNewGoal, setIsCreatingNewGoal] = useState(false);
  const [newGoalDescription, setNewGoalDescription] = useState("");
  const [newGoalRequired, setNewGoalRequired] = useState(true);
  const [newGoalPriority, setNewGoalPriority] = useState(3);
  const [newGoalCriteria, setNewGoalCriteria] = useState("");
  const [goalCriteriaList, setGoalCriteriaList] = useState<string[]>([]);

  // メトリクスの変更
  const handleMetricChange =
    (metric: keyof typeof formData.initialMetrics) =>
    (_event: Event, value: number | number[]) => {
      updateFormData({
        initialMetrics: {
          ...formData.initialMetrics,
          [metric]: value as number,
        },
      });
    };

  // ゴール編集モード開始
  const startEditGoal = (goal?: GoalFormData) => {
    if (goal) {
      // 既存ゴールの編集
      setEditingGoal(goal);
      setIsCreatingNewGoal(false);
      setNewGoalDescription(goal.description);
      setNewGoalRequired(goal.isRequired);
      setNewGoalPriority(goal.priority);
      setGoalCriteriaList([...goal.criteria]);
    } else {
      // 新規ゴールの作成
      setEditingGoal(null);
      setIsCreatingNewGoal(true);
      setNewGoalDescription("");
      setNewGoalRequired(true);
      setNewGoalPriority(3);
      setGoalCriteriaList([]);
    }
    setNewGoalCriteria("");
  };

  // 条件の追加
  const handleAddCriteria = () => {
    if (
      newGoalCriteria.trim() &&
      !goalCriteriaList.includes(newGoalCriteria.trim())
    ) {
      setGoalCriteriaList([...goalCriteriaList, newGoalCriteria.trim()]);
      setNewGoalCriteria("");
    }
  };

  // 条件の削除
  const handleDeleteCriteria = (index: number) => {
    const updatedCriteria = [...goalCriteriaList];
    updatedCriteria.splice(index, 1);
    setGoalCriteriaList(updatedCriteria);
  };

  // ゴールの保存
  const handleSaveGoal = () => {
    if (!newGoalDescription.trim() || goalCriteriaList.length === 0) {
      return; // バリデーションエラー
    }

    const goalToSave: GoalFormData = {
      id: editingGoal?.id || `goal-${Date.now()}`,
      description: newGoalDescription.trim(),
      isRequired: newGoalRequired,
      priority: newGoalPriority,
      criteria: goalCriteriaList,
    };

    let updatedGoals;
    if (editingGoal) {
      // 既存ゴールの更新
      updatedGoals = formData.goals.map((goal) =>
        goal.id === editingGoal.id ? goalToSave : goal,
      );
    } else {
      // 新規ゴールの追加
      updatedGoals = [...formData.goals, goalToSave];
    }

    updateFormData({ goals: updatedGoals });

    // フォームリセット
    setNewGoalDescription("");
    setNewGoalRequired(true);
    setNewGoalPriority(3);
    setGoalCriteriaList([]);
    setNewGoalCriteria("");
    setEditingGoal(null);
    setIsCreatingNewGoal(false);
  };

  // ゴールの削除
  const handleDeleteGoal = (id: string) => {
    updateFormData({
      goals: formData.goals.filter((goal) => goal.id !== id),
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {t("scenarios.create.steps.goals")}
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        {t("scenarios.create.goalsDescription")}
      </Typography>

      {/* 初期メトリクス設定 */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {t("scenarios.fields.initialMetrics")}
        </Typography>

        {/* 怒りメーター */}
        <Box sx={{ mt: 3 }}>
          <Typography id="anger-level-slider" gutterBottom>
            {t("metrics.angerLevel")}: {formData.initialMetrics.angerLevel}
          </Typography>
          <Slider
            value={formData.initialMetrics.angerLevel}
            onChange={handleMetricChange("angerLevel")}
            step={1}
            marks
            min={1}
            max={10}
            aria-labelledby="anger-level-slider"
            valueLabelDisplay="auto"
          />
          <Typography variant="caption" color="text.secondary">
            {t("scenarios.create.angerLevelHelp")}
          </Typography>
        </Box>

        {/* 信頼度 */}
        <Box sx={{ mt: 3 }}>
          <Typography id="trust-level-slider" gutterBottom>
            {t("metrics.trustLevel")}: {formData.initialMetrics.trustLevel}
          </Typography>
          <Slider
            value={formData.initialMetrics.trustLevel}
            onChange={handleMetricChange("trustLevel")}
            step={1}
            marks
            min={1}
            max={10}
            aria-labelledby="trust-level-slider"
            valueLabelDisplay="auto"
          />
          <Typography variant="caption" color="text.secondary">
            {t("scenarios.create.trustLevelHelp")}
          </Typography>
        </Box>

        {/* 進捗度 */}
        <Box sx={{ mt: 3 }}>
          <Typography id="progress-level-slider" gutterBottom>
            {t("metrics.progressLevel")}:{" "}
            {formData.initialMetrics.progressLevel}
          </Typography>
          <Slider
            value={formData.initialMetrics.progressLevel}
            onChange={handleMetricChange("progressLevel")}
            step={1}
            marks
            min={1}
            max={10}
            aria-labelledby="progress-level-slider"
            valueLabelDisplay="auto"
          />
          <Typography variant="caption" color="text.secondary">
            {t("scenarios.create.progressLevelHelp")}
          </Typography>
        </Box>
      </Paper>

      {/* ゴール設定 */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="subtitle1">
            {t("scenarios.fields.goals")}
          </Typography>
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            onClick={() => startEditGoal()}
            disabled={editingGoal !== null}
          >
            {t("scenarios.create.addGoal")}
          </Button>
        </Box>

        {/* ゴール編集フォーム */}
        {(editingGoal !== null ||
          isCreatingNewGoal ||
          newGoalDescription !== "" ||
          goalCriteriaList.length > 0) && (
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                {editingGoal
                  ? t("scenarios.create.editGoal")
                  : t("scenarios.create.newGoal")}
              </Typography>

              <TextField
                fullWidth
                required
                label={t("scenarios.fields.goalDescription")}
                value={newGoalDescription}
                onChange={(e) => setNewGoalDescription(e.target.value)}
                margin="normal"
              />

              <Box sx={{ mt: 2, mb: 1 }}>
                <Typography gutterBottom>
                  {t("scenarios.fields.goalPriority")}: {newGoalPriority} {newGoalPriority === 5 ? `(${t("scenarios.priority.highest")})` : 
                  newGoalPriority === 4 ? `(${t("scenarios.priority.high")})` : 
                  newGoalPriority === 3 ? `(${t("scenarios.priority.medium")})` : 
                  newGoalPriority === 2 ? `(${t("scenarios.priority.low")})` : 
                  `(${t("scenarios.priority.lowest")})`}
                </Typography>
                <Slider
                  value={newGoalPriority}
                  onChange={(_, value) => setNewGoalPriority(value as number)}
                  step={1}
                  marks
                  min={1}
                  max={5}
                  valueLabelDisplay="auto"
                />
              </Box>

              <FormControlLabel
                control={
                  <Switch
                    checked={newGoalRequired}
                    onChange={(e) => setNewGoalRequired(e.target.checked)}
                    color="primary"
                  />
                }
                label={t("scenarios.fields.requiredGoal")}
                sx={{ mt: 1 }}
              />

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" gutterBottom>
                {t("scenarios.fields.goalCriteria")}
              </Typography>

              <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                <TextField
                  fullWidth
                  label={t("scenarios.create.addCriteria")}
                  value={newGoalCriteria}
                  onChange={(e) => setNewGoalCriteria(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCriteria();
                    }
                  }}
                  margin="dense"
                />
                <Button
                  startIcon={<AddIcon />}
                  onClick={handleAddCriteria}
                  sx={{ ml: 1, height: "40px" }}
                >
                  {t("common.add")}
                </Button>
              </Box>

              {goalCriteriaList.length > 0 ? (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {goalCriteriaList.map((criteria, index) => (
                    <Box
                      key={index}
                      sx={{ display: "flex", alignItems: "center" }}
                    >
                      <Paper variant="outlined" sx={{ p: 1, flexGrow: 1 }}>
                        {criteria}
                      </Paper>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteCriteria(index)}
                        aria-label={t("common.delete")}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t("scenarios.create.noCriteriaAdded")}
                </Typography>
              )}

              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setEditingGoal(null);
                    setIsCreatingNewGoal(false);
                    setNewGoalDescription("");
                    setGoalCriteriaList([]);
                  }}
                  sx={{ mr: 1 }}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSaveGoal}
                  disabled={
                    !newGoalDescription.trim() || goalCriteriaList.length === 0
                  }
                >
                  {t("common.save")}
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* ゴール一覧 */}
        {formData.goals.length > 0 ? (
          <Stack spacing={2}>
            {formData.goals.map((goal) => (
              <Card variant="outlined" key={goal.id}>
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
                      {goal.description}
                    </Typography>
                    <Box>
                      <IconButton
                        size="small"
                        onClick={() => startEditGoal(goal)}
                        disabled={editingGoal !== null}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteGoal(goal.id)}
                        disabled={editingGoal !== null}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {t("scenarios.fields.priority")}: {goal.priority}/5 {goal.priority === 5 ? `(${t("scenarios.priority.highest")})` : 
                    goal.priority === 4 ? `(${t("scenarios.priority.high")})` : 
                    goal.priority === 3 ? `(${t("scenarios.priority.medium")})` : 
                    goal.priority === 2 ? `(${t("scenarios.priority.low")})` : 
                    `(${t("scenarios.priority.lowest")})`} •
                    {goal.isRequired
                      ? ` ${t("scenarios.fields.required")}`
                      : ` ${t("scenarios.fields.optional")}`}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ mt: 1, fontWeight: "medium" }}
                  >
                    {t("scenarios.fields.criteria")}:
                  </Typography>
                  <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px" }}>
                    {goal.criteria.map((criteria, idx) => (
                      <li key={idx}>
                        <Typography variant="body2">{criteria}</Typography>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </Stack>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ py: 2 }}
          >
            {t("scenarios.create.noGoalsAdded")}
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default GoalsStep;
