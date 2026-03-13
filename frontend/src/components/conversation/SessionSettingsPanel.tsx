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
  Person as PersonIcon,
  PersonOff as PersonOffIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface SessionSettingsPanelProps {
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  audioVolume: number;
  setAudioVolume: (volume: number) => void;
  speechRate: number;
  setSpeechRate: (rate: number) => void;
  silenceThreshold: number;
  setSilenceThreshold: (threshold: number) => void;
  // アバター表示トグル（セッション中のランタイム切替）
  avatarVisible?: boolean;
  setAvatarVisible?: (visible: boolean) => void;
  avatarEnabled?: boolean;
}

/**
 * セッション設定パネルコンポーネント
 * 音声設定とアバター表示切替を統合
 */
const SessionSettingsPanel: React.FC<SessionSettingsPanelProps> = ({
  audioEnabled,
  setAudioEnabled,
  audioVolume,
  setAudioVolume,
  speechRate,
  setSpeechRate,
  silenceThreshold,
  setSilenceThreshold,
  avatarVisible,
  setAvatarVisible,
  avatarEnabled,
}) => {
  const { t, i18n } = useTranslation();
  const [ready, setReady] = useState<boolean>(i18n.isInitialized);

  // i18n初期化の完了を待つ
  useEffect(() => {
    if (!i18n.isInitialized) {
      const checkInit = () => {
        if (i18n.isInitialized) {
          setReady(true);
        } else {
          setTimeout(checkInit, 50);
        }
      };
      checkInit();
    }
  }, [i18n]);

  // フォールバックテキスト（翻訳が読み込まれるまでの一時的なテキスト）
  const getDefaultText = (key: string): string => {
    const defaults: Record<string, string> = {
      "conversation.audioSettings.title": "音声設定",
      "conversation.audioSettings.outputOn": "音声出力 ON",
      "conversation.audioSettings.outputOff": "音声出力 OFF",
      "conversation.audioSettings.volume": `音量: ${audioVolume}%`,
      "conversation.audioSettings.speechRate": `読み上げ速度: ${speechRate.toFixed(1)}x`,
      "conversation.audioSettings.silenceThreshold": `無音検出時間: ${(silenceThreshold / 1000).toFixed(1)}秒`,
      "conversation.audioSettings.npcResponseNote":
        "※ NPCの応答が音声で再生されます",
      "conversation.audioSettings.silenceNote":
        "※ この時間無音が続くと自動送信されます",
      "conversation.settings.title": "設定",
      "conversation.settings.avatarOn": "3Dアバター表示 ON",
      "conversation.settings.avatarOff": "3Dアバター表示 OFF",
    };
    return defaults[key] || key;
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
        {/* アバター表示トグル（シナリオでアバターが有効な場合のみ表示） */}
        {avatarEnabled && setAvatarVisible && (
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={avatarVisible ?? false}
                  onChange={(e) => setAvatarVisible(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  {avatarVisible ? (
                    <PersonIcon fontSize="small" sx={{ mr: 1 }} />
                  ) : (
                    <PersonOffIcon fontSize="small" sx={{ mr: 1 }} />
                  )}
                  <Typography variant="body2">
                    {avatarVisible
                      ? translate("conversation.settings.avatarOn")
                      : translate("conversation.settings.avatarOff")}
                  </Typography>
                </Box>
              }
            />
          </Box>
        )}

        {/* 音声出力トグル */}
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

        {/* 無音検出時間設定 - 音声出力ON/OFFに関係なく常に表示 */}
        <Box mt={2}>
          <Typography variant="body2" gutterBottom>
            {translate("conversation.audioSettings.silenceThreshold", {
              threshold: (silenceThreshold / 1000).toFixed(1),
            })}
          </Typography>
          <Slider
            value={silenceThreshold}
            onChange={(_, value) => setSilenceThreshold(value as number)}
            aria-labelledby="silence-threshold-slider"
            step={100}
            marks={[
              { value: 500, label: "0.5秒" },
              { value: 1000, label: "1.0秒" },
              { value: 1500, label: "1.5秒" },
              { value: 3000, label: "3.0秒" },
              { value: 5000, label: "5.0秒" },
            ]}
            min={500}
            max={5000}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${(value / 1000).toFixed(1)}秒`}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.5 }}
          >
            {translate("conversation.audioSettings.silenceNote")}
          </Typography>
        </Box>

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

export default SessionSettingsPanel;
