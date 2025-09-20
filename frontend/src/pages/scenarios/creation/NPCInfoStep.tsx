import React, { useState } from "react";
import {
  Box,
  TextField,
  Typography,
  Chip,
  Paper,
  Stack,
  Button,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import { NPCInfoStepProps } from "../../../types";

const NPCInfoStep: React.FC<NPCInfoStepProps> = ({
  formData,
  updateFormData,
  validationErrors = {},
}) => {
  const { t } = useTranslation();
  const [newPersonality, setNewPersonality] = useState("");

  // テキストフィールド変更ハンドラー
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    updateFormData({ [name]: value });
  };

  // 性格特性の追加
  const handleAddPersonality = () => {
    if (
      newPersonality.trim() &&
      !formData.npc.personality.includes(newPersonality.trim())
    ) {
      updateFormData({
        personality: [...formData.npc.personality, newPersonality.trim()],
      });
      setNewPersonality("");
    }
  };

  // 性格特性の削除
  const handleDeletePersonality = (personalityToDelete: string) => {
    updateFormData({
      personality: formData.npc.personality.filter(
        (personality) => personality !== personalityToDelete,
      ),
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {t("scenarios.create.steps.npcInfo")}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        {t("scenarios.create.npcInfoDescription")}
      </Typography>

      <Box sx={{ mt: 3 }}>
        {/* NPCの名前 */}
        <TextField
          fullWidth
          required
          label={t("scenarios.fields.npcName")}
          name="name"
          value={formData.npc.name}
          onChange={handleChange}
          helperText={validationErrors.name ? t(validationErrors.name) : t("scenarios.create.npcNameHelp")}
          margin="normal"
          error={Boolean(validationErrors.name)}
        />

        {/* 役職 */}
        <TextField
          fullWidth
          required
          label={t("scenarios.fields.npcRole")}
          name="role"
          value={formData.npc.role}
          onChange={handleChange}
          helperText={validationErrors.role ? t(validationErrors.role) : t("scenarios.create.npcRoleHelp")}
          margin="normal"
          error={Boolean(validationErrors.role)}
        />

        {/* 会社名 */}
        <TextField
          fullWidth
          required
          label={t("scenarios.fields.npcCompany")}
          name="company"
          value={formData.npc.company}
          onChange={handleChange}
          helperText={validationErrors.company ? t(validationErrors.company) : t("scenarios.create.npcCompanyHelp")}
          margin="normal"
          error={Boolean(validationErrors.company)}
        />

        {/* 性格特性 */}
        <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
          {t("scenarios.fields.npcPersonality")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <TextField
            fullWidth
            label={t("scenarios.create.addPersonality")}
            value={newPersonality}
            onChange={(e) => setNewPersonality(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddPersonality();
              }
            }}
          />
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={handleAddPersonality}
            sx={{ ml: 1, height: "56px" }}
          >
            {t("common.add")}
          </Button>
        </Box>
        <Paper variant="outlined" sx={{ p: 2, mt: 1, minHeight: "100px" }}>
          {formData.npc.personality.length > 0 ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {formData.npc.personality.map((personality, index) => (
                <Chip
                  key={index}
                  label={personality}
                  onDelete={() => handleDeletePersonality(personality)}
                  sx={{ mt: 1 }}
                />
              ))}
            </Stack>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
              sx={{ pt: 2 }}
            >
              {t("scenarios.create.noPersonalityAdded")}
            </Typography>
          )}
        </Paper>
        <Typography variant="caption" color="text.secondary">
          {t("scenarios.create.npcPersonalityHelp")}
        </Typography>

        {/* 詳細説明 */}
        <TextField
          fullWidth
          label={t("scenarios.fields.npcDescription")}
          name="description"
          value={formData.npc.description}
          onChange={handleChange}
          multiline
          rows={4}
          helperText={t("scenarios.create.npcDescriptionHelp")}
          margin="normal"
          sx={{ mt: 3 }}
        />

        {/* 初期メッセージ */}
        <TextField
          fullWidth
          label={t("scenarios.fields.npcInitialMessage")}
          name="initialMessage"
          value={formData.initialMessage || ""}
          onChange={handleChange}
          multiline
          rows={3}
          helperText={t("scenarios.create.npcInitialMessageHelp")}
          margin="normal"
          sx={{ mt: 2 }}
        />
      </Box>
    </Box>
  );
};

export default NPCInfoStep;
