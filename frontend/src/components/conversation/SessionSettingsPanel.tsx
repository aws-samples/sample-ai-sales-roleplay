import React from "react";
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
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface SessionSettingsPanelProps {
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  audioVolume: number;
  setAudioVolume: (volume: number) => void;
  speechRate: number;
  setSpeechRate: (rate: number) => void;
  // アバター表示トグル（セッション中のランタイム切替）
  avatarVisible?: boolean;
  setAvatarVisible?: (visible: boolean) => void;
  avatarEnabled?: boolean;
  // ビデオ録画トグル（商談開始前のみ変更可能）
  videoRecordingEnabled?: boolean;
  setVideoRecordingEnabled?: (enabled: boolean) => void;
  // 録画設定の変更可否（商談開始後はロック）
  recordingSettingLocked?: boolean;
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
  avatarVisible,
  setAvatarVisible,
  avatarEnabled,
  videoRecordingEnabled,
  setVideoRecordingEnabled,
  recordingSettingLocked = false,
}) => {
  // i18nリソースは静的にバンドルされ initImmediate:false で同期初期化されるため、
  // 初回レンダリング時点で t() は正しい翻訳を返す。フォールバック機構は不要であり、
  // 翻訳テキストは ja.json / en.json を単一の真実の源とする（二重管理を排除）。
  const { t } = useTranslation();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        {/* ビデオ録画トグル（商談開始前のみ変更可能） */}
        {setVideoRecordingEnabled && (
          <Box sx={{ mb: 2 }} data-testid="video-recording-setting">
            <FormControlLabel
              control={
                <Switch
                  checked={videoRecordingEnabled ?? true}
                  onChange={(e) => setVideoRecordingEnabled(e.target.checked)}
                  color="primary"
                  disabled={recordingSettingLocked}
                  inputProps={{
                    // アクセシブル名（ON/OFF・日英対応）。テストもこの名前で要素を特定する
                    "aria-label": videoRecordingEnabled ?? true
                      ? t("conversation.settings.recordingOn")
                      : t("conversation.settings.recordingOff"),
                  }}
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  {videoRecordingEnabled ?? true ? (
                    <VideocamIcon fontSize="small" sx={{ mr: 1 }} />
                  ) : (
                    <VideocamOffIcon fontSize="small" sx={{ mr: 1 }} />
                  )}
                  <Typography variant="body2">
                    {videoRecordingEnabled ?? true
                      ? t("conversation.settings.recordingOn")
                      : t("conversation.settings.recordingOff")}
                  </Typography>
                </Box>
              }
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", ml: 0.5 }}
            >
              {recordingSettingLocked
                ? t("conversation.settings.recordingLockedNote")
                : t("conversation.settings.recordingNote")}
            </Typography>
          </Box>
        )}

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
                      ? t("conversation.settings.avatarOn")
                      : t("conversation.settings.avatarOff")}
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
                  ? t("conversation.audioSettings.outputOn")
                  : t("conversation.audioSettings.outputOff")}
              </Typography>
            </Box>
          }
        />

        {audioEnabled && (
          <>
            <Box mt={2}>
              <Typography variant="body2" gutterBottom>
                {t("conversation.audioSettings.volume", {
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
                {t("conversation.audioSettings.speechRate", {
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
          {t("conversation.audioSettings.npcResponseNote")}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default SessionSettingsPanel;
