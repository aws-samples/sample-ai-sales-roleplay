import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
  IconButton,
  Menu,
  ListItemText,
} from "@mui/material";
import TranslateIcon from "@mui/icons-material/Translate";
import {
  languageNameMapping,
  supportedLanguages,
} from "../i18n/utils/languageUtils";

/**
 * 言語切り替えコンポーネント
 *
 * ヘッダーなどに配置して言語切り替えを行うためのUIを提供します。
 * デスクトップではドロップダウン、モバイルではアイコンボタンとメニューを表示します。
 */
const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // コンポーネントマウント時に言語を日本語に設定
  useEffect(() => {
    const savedLanguage = localStorage.getItem("i18nextLng");
    if (!savedLanguage || !supportedLanguages.includes(savedLanguage)) {
      i18n.changeLanguage("ja");
      localStorage.setItem("i18nextLng", "ja");
    }
  }, [i18n]);

  // 現在の言語を取得
  const currentLanguage = i18n.language || "ja";

  // 言語切り替えハンドラー
  const handleLanguageChange = (event: SelectChangeEvent) => {
    const newLang = event.target.value;
    i18n.changeLanguage(newLang);
    // localStorage に保存して永続化
    localStorage.setItem("i18nextLng", newLang);
  };

  // モバイル用メニューを開く
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  // モバイル用メニューを閉じる
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // モバイル用メニューで言語を選択した時
  const handleMenuItemClick = (lang: string) => {
    i18n.changeLanguage(lang);
    // localStorage に保存して永続化
    localStorage.setItem("i18nextLng", lang);
    handleMenuClose();
  };

  return (
    <>
      {/* デスクトップ表示用のセレクトボックス（アイコン付き） */}
      <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 1 }}>
        <TranslateIcon sx={{ color: "inherit", fontSize: "1.2rem" }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={currentLanguage}
            onChange={handleLanguageChange}
            displayEmpty
            variant="outlined"
            sx={{
              "& .MuiSelect-select": {
                py: 0.5,
                display: "flex",
                alignItems: "center",
              },
              fontFamily: "inherit", // フォントファミリーを継承
              color: "inherit", // テキストの色を継承
            }}
          >
            {supportedLanguages.map((lang) => (
              <MenuItem key={lang} value={lang} sx={{ fontFamily: "inherit" }}>
                {languageNameMapping[lang]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* モバイル表示用のアイコンボタン */}
      <Box sx={{ display: { xs: "flex", md: "none" } }}>
        <IconButton
          onClick={handleMenuOpen}
          color="inherit"
          aria-label={t("settings.language")}
        >
          <TranslateIcon />
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleMenuClose}
          slotProps={{
            paper: {
              "aria-labelledby": "language-button",
            },
          }}
        >
          {supportedLanguages.map((lang) => (
            <MenuItem
              key={lang}
              onClick={() => handleMenuItemClick(lang)}
              selected={currentLanguage === lang}
              sx={{ fontFamily: "inherit" }}
            >
              <ListItemText sx={{ fontFamily: "inherit" }}>
                {languageNameMapping[lang]}
              </ListItemText>
            </MenuItem>
          ))}
        </Menu>
      </Box>
    </>
  );
};

export default LanguageSwitcher;
