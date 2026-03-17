import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  FormControlLabel,
  Switch,
  Box,
  Slider,
} from "@mui/material";
import {
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface AudioSettingsPanelProps {
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  audioVolume: number;
  setAudioVolume: (volume: number) => void;
  speechRate: number;
  setSpeechRate: (rate: number) => void;
}

/**
 * 音声設定パネルコンポーネント
 * 翻訳が正しく読み込まれるように特別な処理を追加
 */
const AudioSettingsPanel: React.FC<AudioSettingsPanelProps> = ({
  audioEnabled,
  setAudioEnabled,
  audioVolume,
  setAudioVolume,
  speechRate,
  setSpeechRate,
}) => {
  const { t, i18n } = useTranslation();
  const [ready, setReady] = useState<boolean>(i18n.isInitialized);

  // i18n初期化の完了を待つ（イベント駆動）
  useEffect(() => {
    if (i18n.isInitialized) {
      // 既に初期化済みの場合は初期値で対応済みなのでリスナーのみ登録
      return;
    }
    const handleInitialized = () => setReady(true);
    i18n.on('initialized', handleInitialized);
    return () => { i18n.off('initialized', handleInitialized); };
  }, [i18n]);

  // フォールバックテキスト（翻訳が読み込まれるまでの一時的なテキスト）
  // ブラウザの言語設定に基づいてフォールバック言語を選択
  const getDefaultText = (key: string): string => {
    const browserLang = navigator.language.startsWith('ja') ? 'ja' : 'en';
    const defaults: Record<string, Record<string, string>> = {
      ja: {
        "conversation.audioSettings.title": "音声設定",
        "conversation.audioSettings.outputOn": "音声出力 ON",
        "conversation.audioSettings.outputOff": "音声出力 OFF",
        "conversation.audioSettings.volume": `音量: ${audioVolume}%`,
        "conversation.audioSettings.speechRate": `読み上げ速度: ${speechRate.toFixed(1)}x`,
        "conversation.audioSettings.npcResponseNote": "※ NPCの応答が音声で再生されます",
      },
      en: {
        "conversation.audioSettings.title": "Audio Settings",
        "conversation.audioSettings.outputOn": "Audio Output ON",
        "conversation.audioSettings.outputOff": "Audio Output OFF",
        "conversation.audioSettings.volume": `Volume: ${audioVolume}%`,
        "conversation.audioSettings.speechRate": `Speech Rate: ${speechRate.toFixed(1)}x`,
        "conversation.audioSettings.npcResponseNote": "※ NPC responses will be played as audio",
      },
    };
    return defaults[browserLang]?.[key] || key;
  };

  // 翻訳関数のラッパー - 初期化前はデフォルトテキストを返す
  const translate = (
    key: string,
    options?: Record<string, unknown>,
  ): string => {
    if (!ready) return getDefaultText(key);
    return t(key, options);
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {translate("conversation.audioSettings.title")}
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={audioEnabled}
              onChange={(e) => setAudioEnabled(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Box display="flex" alignItems="center">
              {audioEnabled ? (
                <VolumeUpIcon fontSize="small" sx={{ mr: 1 }} />
              ) : (
                <VolumeOffIcon fontSize="small" sx={{ mr: 1 }} />
              )}
              <Typography variant="body2">
                {audioEnabled
                  ? translate("conversation.audioSettings.outputOn")
                  : translate("conversation.audioSettings.outputOff")}
              </Typography>
            </Box>
          }
        />

        {audioEnabled && (
          <>
            <Box mt={2}>
              <Typography variant="body2" gutterBottom>
                {translate("conversation.audioSettings.volume", {
                  volume: audioVolume,
                })}
              </Typography>
              <Slider
                value={audioVolume}
                onChange={(_, value) => setAudioVolume(value as number)}
                aria-labelledby="audio-volume-slider"
                step={10}
                marks
                min={0}
                max={100}
              />
            </Box>

            <Box mt={2}>
              <Typography variant="body2" gutterBottom>
                {translate("conversation.audioSettings.speechRate", {
                  rate: speechRate.toFixed(1),
                })}
              </Typography>
              <Slider
                value={speechRate}
                onChange={(_, value) => setSpeechRate(value as number)}
                aria-labelledby="speech-rate-slider"
                step={0.1}
                marks={[
                  { value: 0.5, label: "0.5x" },
                  { value: 1.0, label: "1.0x" },
                  { value: 1.5, label: "1.5x" },
                  { value: 2.0, label: "2.0x" },
                ]}
                min={0.5}
                max={2.0}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value.toFixed(1)}x`}
              />
            </Box>
          </>
        )}

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1 }}
        >
          {translate("conversation.audioSettings.npcResponseNote")}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default AudioSettingsPanel;
