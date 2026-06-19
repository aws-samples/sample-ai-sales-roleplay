import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { Lightbulb as LightbulbIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface SuggestionBarProps {
  /** AIが生成した返答候補のリスト */
  suggestions: string[];
  /** 候補が選択されたときのコールバック（選択テキストを渡す） */
  onSelect: (text: string) => void;
  /** 無効状態（処理中・発話中など） */
  disabled: boolean;
}

/**
 * サジェスト返答ボタンコンポーネント
 *
 * NPCの直前発言を踏まえてAIが生成した返答候補を、タップ/クリックで
 * 選択できるボタン群として表示する。候補が空、または無効状態のときは
 * 何も表示しない。
 */
const SuggestionBar: React.FC<SuggestionBarProps> = ({
  suggestions,
  onSelect,
  disabled,
}) => {
  const { t } = useTranslation();

  // 候補がない、または無効状態のときは何も表示しない
  if (disabled || !suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <Box
      role="group"
      aria-label={t("conversation.suggestion.label")}
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 0.5,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderRadius: 1,
        boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.08)",
      }}
    >
      <Box display="flex" alignItems="center" gap={0.5} sx={{ color: "text.secondary" }}>
        <LightbulbIcon fontSize="small" aria-hidden="true" />
        <Typography variant="caption">
          {t("conversation.suggestion.label")}
        </Typography>
      </Box>
      {suggestions.map((suggestion, index) => (
        <Chip
          key={`${index}-${suggestion}`}
          label={suggestion}
          variant="outlined"
          color="primary"
          clickable
          onClick={() => onSelect(suggestion)}
          data-testid={`suggestion-button-${index}`}
          aria-label={t("conversation.suggestion.select", { text: suggestion })}
          sx={{
            maxWidth: "100%",
            height: "auto",
            "& .MuiChip-label": {
              whiteSpace: "normal",
              py: 0.5,
            },
          }}
        />
      ))}
    </Box>
  );
};

export default SuggestionBar;
