import React, { useState, useMemo, useRef } from "react";
import {
  Box,
  TextField,
  Typography,
  Chip,
  Paper,
  Stack,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Alert,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import DeleteIcon from "@mui/icons-material/Delete";
import { NPCInfoStepProps } from "../../../types";
import { getVoicesForLanguage } from "../../../config/pollyVoices";

const NPCInfoStep: React.FC<NPCInfoStepProps> = ({
  formData,
  updateFormData,
  validationErrors = {},
  avatarFile,
  avatarFileName,
  onAvatarFileChange,
  voiceId,
  onVoiceIdChange,
}) => {
  const { t } = useTranslation();
  const [newPersonality, setNewPersonality] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // WR-015: alert()をMUI Alertに置き換え
  const [fileError, setFileError] = useState<string>("");

  // 言語に応じた音声モデル一覧を取得
  const availableVoices = useMemo(() => {
    const lang = formData.language || "ja";
    return getVoicesForLanguage(lang);
  }, [formData.language]);

  // 性別表示用ラベル
  const genderLabel = (gender: string): string => {
    switch (gender) {
      case "male": return t("scenarios.create.voice.male");
      case "female": return t("scenarios.create.voice.female");
      case "male_child": return t("scenarios.create.voice.maleChild");
      case "female_child": return t("scenarios.create.voice.femaleChild");
      default: return "";
    }
  };

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

  // VRMファイル選択ハンドラー
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // .vrm拡張子チェック
      if (!file.name.toLowerCase().endsWith(".vrm")) {
        setFileError(t("scenarios.create.avatar.invalidFormat"));
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      // 50MB制限チェック
      if (file.size > 50 * 1024 * 1024) {
        setFileError(t("scenarios.create.avatar.fileTooLarge"));
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setFileError("");
      onAvatarFileChange?.(file);
    }
    // inputをリセット（同じファイルを再選択可能にする）
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // VRMファイル削除ハンドラー
  const handleFileRemove = () => {
    onAvatarFileChange?.(null);
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

        {/* 音声モデル選択 */}
        {/* 将来拡張: 音声プレビュー再生機能を追加する場合は、
            Selectの各MenuItemにPlayArrowIconボタンを追加し、
            PollyService.synthesizeSpeech()でサンプルテキストを再生する。
            コンポーネントの拡張性を維持するため、プレビュー機能は
            別コンポーネント（VoicePreviewButton等）として切り出すことを推奨。 */}
        <FormControl
          fullWidth
          required
          margin="normal"
          error={Boolean(validationErrors.voiceId)}
        >
          <InputLabel id="voice-select-label">
            {t("scenarios.create.voice.label")}
          </InputLabel>
          <Select
            labelId="voice-select-label"
            id="voice-select"
            value={voiceId || ""}
            label={t("scenarios.create.voice.label")}
            onChange={(e) => onVoiceIdChange?.(e.target.value)}
            data-testid="voice-select"
          >
            {availableVoices.map((voice) => (
              <MenuItem key={voice.voiceId} value={voice.voiceId}>
                {voice.displayName} ({genderLabel(voice.gender)})
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {validationErrors.voiceId
              ? t(validationErrors.voiceId)
              : t("scenarios.create.voice.help")}
          </FormHelperText>
        </FormControl>

        {/* VRMアバターアップロード */}
        <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
          {t("scenarios.create.avatar.label")}
        </Typography>
        <Paper variant="outlined" sx={{ p: 2 }}>
          {fileError && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setFileError("")}>
              {fileError}
            </Alert>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".vrm"
            onChange={handleFileSelect}
            style={{ display: "none" }}
            id="vrm-file-input"
            aria-label={t("scenarios.create.avatar.selectFile")}
          />
          {avatarFile || avatarFileName ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <InsertDriveFileIcon color="primary" />
              <Typography variant="body2" sx={{ flex: 1 }}>
                {avatarFile?.name || avatarFileName}
              </Typography>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleFileRemove}
                aria-label={t("scenarios.create.avatar.remove")}
              >
                {t("common.delete")}
              </Button>
            </Stack>
          ) : (
            <Button
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={() => fileInputRef.current?.click()}
              fullWidth
            >
              {t("scenarios.create.avatar.selectFile")}
            </Button>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            {t("scenarios.create.avatar.help")}
          </Typography>
        </Paper>

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
