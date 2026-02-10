import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  Rating,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { PreviewStepProps } from "../../../types";

const PreviewStep: React.FC<PreviewStepProps> = ({ formData }) => {
  const { t } = useTranslation();

  // ラベル変換をメモ化してパフォーマンスを向上
  const difficultyLabels = useMemo(
    () => ({
      easy: t("scenarios.difficulty.easy"),
      normal: t("scenarios.difficulty.normal"),
      hard: t("scenarios.difficulty.hard"),
      expert: t("scenarios.difficulty.expert"),
    }),
    [t],
  );

  const categoryLabels = useMemo(
    () => ({
      general: t("scenarios.category.general"),
      it: t("scenarios.category.it"),
      finance: t("scenarios.category.finance"),
      medical: t("scenarios.category.medical"),
      retail: t("scenarios.category.retail"),
      manufacturing: t("scenarios.category.manufacturing"),
    }),
    [t],
  );

  const visibilityLabels = useMemo(
    () => ({
      public: t("scenarios.visibility.public"),
      private: t("scenarios.visibility.private"),
      shared: t("scenarios.visibility.shared"),
    }),
    [t],
  );

  // Guardrail情報をメモ化
  const guardrailInfo = useMemo(() => {
    if (!formData.guardrail) {
      return { label: t("common.none"), description: "" };
    }
    return {
      label: formData.guardrail,
    };
  }, [formData.guardrail, t]);

  // 難易度の表示用ラベル
  const getDifficultyLabel = (difficulty: string): string => {
    return (
      difficultyLabels[difficulty as keyof typeof difficultyLabels] ||
      difficulty
    );
  };

  // カテゴリの表示用ラベル
  const getCategoryLabel = (category: string): string => {
    return categoryLabels[category as keyof typeof categoryLabels] || category;
  };

  // 公開設定の表示用ラベル
  const getVisibilityLabel = (
    visibility: "public" | "private" | "shared",
  ): string => {
    return visibilityLabels[visibility] || visibility;
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {t("scenarios.create.steps.preview")}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        {t("scenarios.create.previewDescription")}
      </Typography>

      {/* 基本情報 */}
      <Paper
        sx={{ p: 3, mt: 3 }}
        role="region"
        aria-labelledby="basic-info-title"
      >
        <Typography
          variant="h5"
          gutterBottom
          sx={{ mb: 2 }}
          id="basic-info-title"
        >
          {formData.title}
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            mb: 2,
          }}
          role="group"
          aria-label={t("scenarios.fields.tags")}
        >
          <Chip
            label={getDifficultyLabel(formData.difficulty)}
            color="primary"
            variant="outlined"
            aria-label={`${t("scenarios.fields.difficulty")}: ${getDifficultyLabel(formData.difficulty)}`}
          />
          <Chip
            label={getCategoryLabel(formData.category)}
            color="secondary"
            variant="outlined"
            aria-label={`${t("scenarios.fields.category")}: ${getCategoryLabel(formData.category)}`}
          />
          <Chip
            label={getVisibilityLabel(formData.visibility)}
            variant="outlined"
            aria-label={`${t("scenarios.fields.visibility")}: ${getVisibilityLabel(formData.visibility)}`}
          />
        </Box>

        <Typography variant="body1" sx={{ mb: 2 }}>
          {formData.description || t("common.noDescription")}
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* NPC情報 */}
        <Typography variant="subtitle1" gutterBottom id="npc-info-title">
          {t("scenarios.fields.npcInfo")}
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 2,
          }}
          role="group"
          aria-labelledby="npc-info-title"
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2">
              <strong>{t("scenarios.fields.npcName")}:</strong>{" "}
              {formData.npc.name || t("common.notSet")}
            </Typography>
            <Typography variant="body2">
              <strong>{t("scenarios.fields.npcRole")}:</strong>{" "}
              {formData.npc.role || t("common.notSet")}
            </Typography>
            <Typography variant="body2">
              <strong>{t("scenarios.fields.npcCompany")}:</strong>{" "}
              {formData.npc.company || t("common.notSet")}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" gutterBottom>
              <strong>{t("scenarios.fields.npcPersonality")}:</strong>
            </Typography>
            <Box
              sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}
              role="group"
              aria-label={t("scenarios.fields.npcPersonality")}
            >
              {formData.npc.personality &&
                formData.npc.personality.length > 0 ? (
                formData.npc.personality.map((trait, index) => (
                  <Chip key={index} label={trait} size="small" />
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t("common.notSet")}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
        {formData.npc.description && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>{t("scenarios.fields.npcDescription")}:</strong>{" "}
              {formData.npc.description}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* 初期メトリクスとゴール */}
      <Paper
        sx={{ p: 3, mt: 3 }}
        role="region"
        aria-labelledby="metrics-objectives-title"
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: 3,
          }}
        >
          {/* 初期メトリクス */}
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="subtitle1"
              gutterBottom
              id="initial-metrics-title"
            >
              {t("scenarios.fields.initialMetrics")}
            </Typography>

            <Box
              sx={{ mb: 2 }}
              role="group"
              aria-labelledby="initial-metrics-title"
            >
              <Typography variant="body2" gutterBottom id="anger-level-label">
                {t("metrics.angerLevel")}:
              </Typography>
              <Rating
                name="anger-level"
                value={formData.initialMetrics.angerLevel / 2} // 10段階を5段階に変換
                precision={0.5}
                readOnly
                aria-labelledby="anger-level-label"
                aria-describedby="anger-level-value"
              />
              <Typography
                variant="caption"
                display="block"
                id="anger-level-value"
              >
                {formData.initialMetrics.angerLevel}/10
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom id="trust-level-label">
                {t("metrics.trustLevel")}:
              </Typography>
              <Rating
                name="trust-level"
                value={formData.initialMetrics.trustLevel / 2} // 10段階を5段階に変換
                precision={0.5}
                readOnly
                aria-labelledby="trust-level-label"
                aria-describedby="trust-level-value"
              />
              <Typography
                variant="caption"
                display="block"
                id="trust-level-value"
              >
                {formData.initialMetrics.trustLevel}/10
              </Typography>
            </Box>

            <Box>
              <Typography
                variant="body2"
                gutterBottom
                id="progress-level-label"
              >
                {t("metrics.progressLevel")}:
              </Typography>
              <Rating
                name="progress-level"
                value={formData.initialMetrics.progressLevel / 2} // 10段階を5段階に変換
                precision={0.5}
                readOnly
                aria-labelledby="progress-level-label"
                aria-describedby="progress-level-value"
              />
              <Typography
                variant="caption"
                display="block"
                id="progress-level-value"
              >
                {formData.initialMetrics.progressLevel}/10
              </Typography>
            </Box>
          </Box>

          {/* ゴール（目標セクションはgoalsに統合済み） */}
        </Box>
      </Paper>

      {/* ゴール */}
      <Paper sx={{ p: 3, mt: 3 }} role="region" aria-labelledby="goals-title">
        <Typography variant="subtitle1" gutterBottom id="goals-title">
          {t("scenarios.fields.goals")}
        </Typography>

        {formData.goals && formData.goals.length > 0 ? (
          <List
            role="list"
            aria-labelledby="goals-title"
            subheader={
              <ListSubheader component="div" sx={{ bgcolor: "transparent" }}>
                {t("scenarios.create.goalsList")}
              </ListSubheader>
            }
          >
            {formData.goals.map((goal, index) => (
              <React.Fragment key={goal.id}>
                <ListItem
                  role="listitem"
                  alignItems="flex-start"
                  divider={index < formData.goals.length - 1}
                  sx={{ flexDirection: "column" }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <ListItemText
                      primary={goal.description}
                      secondary={
                        <>
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.primary"
                          >
                            {t("scenarios.fields.priority")}: {goal.priority}/5 {goal.priority === 5 ? `(${t("scenarios.priority.highest")})` :
                              goal.priority === 4 ? `(${t("scenarios.priority.high")})` :
                                goal.priority === 3 ? `(${t("scenarios.priority.medium")})` :
                                  goal.priority === 2 ? `(${t("scenarios.priority.low")})` :
                                    `(${t("scenarios.priority.lowest")})`}
                          </Typography>
                          {" • "}
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.primary"
                          >
                            {goal.isRequired
                              ? t("scenarios.fields.required")
                              : t("scenarios.fields.optional")}
                          </Typography>
                        </>
                      }
                    />
                  </Box>

                  <Typography
                    variant="body2"
                    sx={{ fontWeight: "medium", ml: 2 }}
                  >
                    {t("scenarios.fields.criteria")}:
                  </Typography>
                  {goal.criteria && goal.criteria.length > 0 ? (
                    <ul
                      style={{ margin: "4px 0 0 16px", paddingLeft: "16px" }}
                      role="list"
                    >
                      {goal.criteria.map((criteria, idx) => (
                        <li key={idx} role="listitem">
                          <Typography variant="body2">{criteria}</Typography>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ ml: 2 }}
                    >
                      {t("common.notSet")}
                    </Typography>
                  )}
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t("scenarios.create.noGoalsAdded")}
          </Typography>
        )}
      </Paper>

      {/* 設定 */}
      <Paper sx={{ p: 3, mt: 3 }} role="region" aria-labelledby="sharing-title">
        <Typography variant="subtitle1" gutterBottom id="sharing-title">
          {t("scenarios.fields.generalSettings")}
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 2,
          }}
          role="group"
          aria-labelledby="sharing-title"
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2">
              <strong>{t("scenarios.fields.visibility")}:</strong>{" "}
              {getVisibilityLabel(formData.visibility)}
            </Typography>

            {formData.visibility === "shared" &&
              formData.sharedWithUsers &&
              formData.sharedWithUsers.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    <strong>{t("scenarios.fields.sharedUsers")}:</strong>
                  </Typography>
                  <Box
                    sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}
                    role="group"
                    aria-label={t("scenarios.fields.sharedUsers")}
                  >
                    {formData.sharedWithUsers.map((user, index) => (
                      <Chip key={index} label={user} size="small" />
                    ))}
                  </Box>
                </Box>
              )}
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography variant="body2">
              <strong>{t("scenarios.fields.guardrail")}:</strong>{" "}
              {guardrailInfo.label}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography variant="body2">
              <strong>{t("scenarios.fields.language")}:</strong>{" "}
              {formData.language}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography variant="body2">
              <strong>{t("scenarios.fields.initialMessage")}:</strong>{" "}
              {formData.initialMessage}
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default PreviewStep;
