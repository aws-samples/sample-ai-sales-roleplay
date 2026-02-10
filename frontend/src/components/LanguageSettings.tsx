import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Card,
  CardContent,
} from "@mui/material";
import {
  languageNameMapping,
  supportedLanguages,
} from "../i18n/utils/languageUtils";
import { LanguageService } from "../services/LanguageService";

/**
 * 言語設定コンポーネント
 *
 * 設定画面やプロフィール画面で言語設定を変更するためのコンポーネント
 */
const LanguageSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const languageService = LanguageService.getInstance();

  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    i18n.language.split("-")[0]
  );

  // 言語変更ハンドラ
  const handleLanguageChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newLang = event.target.value;
    setSelectedLanguage(newLang);

    try {
      // 言語サービスを使用して言語を変更（永続化も行う）
      await languageService.changeLanguage(newLang);
      console.log("言語を変更しました:", newLang);
    } catch (error) {
      console.error("言語変更エラー:", error);
      // エラー時は選択を元に戻す
      setSelectedLanguage(i18n.language.split("-")[0]);
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {t("settings.language")}
        </Typography>

        <Box sx={{ mt: 2 }}>
          <FormControl component="fieldset">
            <FormLabel component="legend">{t("settings.language")}</FormLabel>
            <RadioGroup
              aria-label="language"
              name="language"
              value={selectedLanguage}
              onChange={handleLanguageChange}
            >
              {supportedLanguages.map((lang) => (
                <FormControlLabel
                  key={lang}
                  value={lang}
                  control={<Radio />}
                  label={languageNameMapping[lang]}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Box>
      </CardContent>
    </Card>
  );
};

export default LanguageSettings;
