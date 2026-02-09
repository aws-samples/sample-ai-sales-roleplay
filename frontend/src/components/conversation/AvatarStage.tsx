import React from "react";
import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { VRMAvatarContainer } from "../avatar";
import type { EmotionState } from "../../types/index";
import type { GestureType } from "../../types/avatar";

interface AvatarStageProps {
  // アバター関連
  avatarId?: string;
  angerLevel: number;
  trustLevel: number;
  progressLevel: number;
  isSpeaking: boolean;
  directEmotion?: EmotionState;
  gesture?: GestureType;
  onEmotionChange?: (emotion: EmotionState) => void;
  // NPC情報
  npcName: string;
}

/**
 * アバターステージコンポーネント
 * VRMAvatarContainerを中央大表示でラップし、
 * NPC名ラベルと発話中サウンドウェーブインジケーターを表示する
 */
const AvatarStage: React.FC<AvatarStageProps> = ({
  avatarId,
  angerLevel,
  trustLevel,
  progressLevel,
  isSpeaking,
  directEmotion,
  gesture,
  onEmotionChange,
  npcName,
}) => {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        p: 2.5,
        minHeight: 0,
      }}
      role="region"
      aria-label={t("avatarStage.label")}
    >
      {/* NPC名ラベル */}
      <Typography
        sx={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "text.secondary",
          mb: 1.5,
          px: 1.75,
          py: 0.5,
          background: "rgba(255, 255, 255, 0.8)",
          borderRadius: "9999px",
          zIndex: 5,
        }}
      >
        {npcName}
      </Typography>

      {/* VRMアバター */}
      <Box
        sx={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          maxWidth: 600,
        }}
      >
        <VRMAvatarContainer
          avatarId={avatarId}
          angerLevel={angerLevel}
          trustLevel={trustLevel}
          progressLevel={progressLevel}
          isSpeaking={isSpeaking}
          directEmotion={directEmotion}
          gesture={gesture}
          onEmotionChange={onEmotionChange}
        />
      </Box>

      {/* 発話中サウンドウェーブインジケーター */}
      {isSpeaking && (
        <Box
          sx={{
            position: "absolute",
            bottom: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: "3px",
            height: 24,
          }}
          role="status"
          aria-label={t("avatarStage.speakingIndicator")}
        >
          {[8, 16, 24, 16, 8].map((h, i) => (
            <Box
              key={i}
              sx={{
                width: 4,
                height: h,
                backgroundColor: "#4f46e5",
                borderRadius: 2,
                animation: `wave 0.6s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
                "@keyframes wave": {
                  "0%, 100%": { transform: "scaleY(0.4)" },
                  "50%": { transform: "scaleY(1)" },
                },
                "@media (prefers-reduced-motion: reduce)": {
                  animation: "none",
                },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default AvatarStage;
