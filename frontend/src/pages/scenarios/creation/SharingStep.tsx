import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Radio,
  RadioGroup,
  TextField,
  Chip,
  Paper,
  Stack,
  Button,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import { SharingStepProps } from "../../../types";

const SharingStep: React.FC<SharingStepProps> = ({
  formData,
  guardrailsList,
  updateFormData,
  validationErrors = {},
}) => {
  const { t } = useTranslation();
  const [newUser, setNewUser] = useState("");

  // Selectコンポーネントの制御された状態を確保するため、常に文字列値を提供
  const guardrailValue = formData.guardrail ?? "";

  // 表示用の名前を生成（任意のプレフィックス除去）
  const getDisplayName = (fullName: string): string => {
    // 最初のハイフンまでをプレフィックスとして除去
    // 例: "dev-FinanceCompliance" → "FinanceCompliance"
    // 例: "my-company-FinanceCompliance" → "FinanceCompliance"
    const hyphenIndex = fullName.indexOf('-');
    return hyphenIndex !== -1 ? fullName.substring(hyphenIndex + 1) : fullName;
  };

  // 表示値を取得（選択されたガードレールの表示名）
  const displayValue = guardrailValue ? getDisplayName(guardrailValue) : "";

  // 公開設定の変更ハンドラー
  const handleVisibilityChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    updateFormData({
      visibility: event.target.value as "public" | "private" | "shared",
    });
  };

  // Guardrail選択の変更ハンドラー
  const handleGuardrailChange = (event: SelectChangeEvent<string>) => {
    const selectedValue = event.target.value;
    if (selectedValue === "") {
      updateFormData({ guardrail: undefined });
      return;
    }

    updateFormData({
      guardrail: event.target.value,
    });
  };

  // ユーザー追加ハンドラー
  const handleAddUser = () => {
    if (newUser.trim() && !formData.sharedWithUsers.includes(newUser.trim())) {
      updateFormData({
        sharedWithUsers: [...formData.sharedWithUsers, newUser.trim()],
      });
      setNewUser("");
    }
  };

  // ユーザー削除ハンドラー
  const handleDeleteUser = (userToDelete: string) => {
    updateFormData({
      sharedWithUsers: formData.sharedWithUsers.filter(
        (user) => user !== userToDelete,
      ),
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {t("scenarios.create.steps.sharing")}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        {t("scenarios.create.sharingDescription")}
      </Typography>

      {/* 公開設定 */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {t("scenarios.fields.visibility")}
        </Typography>

        <FormControl component="fieldset" error={Boolean(validationErrors?.sharedWithUsers)}>
          <RadioGroup
            name="visibility"
            value={formData.visibility}
            onChange={handleVisibilityChange}
          >
            <FormControlLabel
              value="private"
              control={<Radio />}
              label={t("scenarios.visibility.private")}
            />
            <FormHelperText sx={{ ml: 4, mt: -1 }}>
              {t("scenarios.create.privateHelp")}
            </FormHelperText>

            <FormControlLabel
              value="shared"
              control={<Radio />}
              label={t("scenarios.visibility.shared")}
              sx={{ mt: 1 }}
            />
            <FormHelperText sx={{ ml: 4, mt: -1 }}>
              {t("scenarios.create.sharedHelp")}
            </FormHelperText>

            <FormControlLabel
              value="public"
              control={<Radio />}
              label={t("scenarios.visibility.public")}
              sx={{ mt: 1 }}
            />
            <FormHelperText sx={{ ml: 4, mt: -1 }}>
              {t("scenarios.create.publicHelp")}
            </FormHelperText>
          </RadioGroup>
        </FormControl>

        {/* 共有ユーザーの設定（共有が選択されている場合のみ表示） */}
        {formData.visibility === "shared" && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t("scenarios.fields.sharedUsers")}
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <TextField
                fullWidth
                label={t("scenarios.create.addUser")}
                placeholder={t("scenarios.create.userIdPlaceholder")}
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddUser();
                  }
                }}
              />
              <Button
                startIcon={<AddIcon />}
                variant="contained"
                onClick={handleAddUser}
                sx={{ ml: 1, height: "56px" }}
              >
                {t("common.add")}
              </Button>
            </Box>

            <Paper variant="outlined" sx={{ p: 2, mt: 1, minHeight: "100px" }}>
              {formData.sharedWithUsers.length > 0 ? (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {formData.sharedWithUsers.map((user, index) => (
                    <Chip
                      key={index}
                      label={user}
                      onDelete={() => handleDeleteUser(user)}
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
                  {t("scenarios.create.noUsersAdded")}
                </Typography>
              )}
            </Paper>
            <Typography variant="caption" color="text.secondary">
              {t("scenarios.create.sharedUsersHelp")}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Guardrails設定 */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          {t("scenarios.fields.guardrail")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("scenarios.create.guardrailDescription")}
        </Typography>

        <FormControl fullWidth margin="normal" error={Boolean(validationErrors?.guardrail)}>
          <InputLabel>{t("scenarios.fields.selectGuardrail")}</InputLabel>
          <Select
            value={guardrailValue}
            label={t("scenarios.fields.selectGuardrail")}
            onChange={handleGuardrailChange}
            displayEmpty
            renderValue={(selected) => {
              // 選択された値のプレフィックスを除去して表示
              return selected ? getDisplayName(selected as string) : "";
            }}
          >
            {guardrailsList.map((guardrail) => {
              const fullName = guardrail.name;
              const displayName = getDisplayName(fullName);
              return (
                <MenuItem key={guardrail.id} value={fullName}>
                  {displayName}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </Paper>
    </Box>
  );
};

export default SharingStep;
