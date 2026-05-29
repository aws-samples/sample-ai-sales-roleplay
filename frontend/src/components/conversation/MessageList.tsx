import React, { useRef, useEffect, useMemo } from "react";
import { Box, Typography, Paper, LinearProgress, Button } from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";
import { Message, Metrics, Scenario } from "../../types/index";
import type { SlideImageInfo } from "../../types/api";
import { getSessionEndReason } from "../../utils/dialogueEngine";
import { DEFAULT_VIDEO_RECORDING_ENABLED } from "../../utils/videoRecordingSettings";
import { useTranslation } from "react-i18next";

interface MessageListProps {
  messages: Message[];
  isProcessing: boolean;
  sessionStarted: boolean;
  sessionEnded: boolean;
  currentMetrics: Metrics;
  scenario: Scenario;
  onStartConversation: () => void;
  isCameraInitialized?: boolean;
  cameraError?: boolean;
  /** ビデオ録画機能の有効/無効 */
  videoRecordingEnabled?: boolean;
  /** スライド画像一覧（サムネイル表示用） */
  slideImages?: SlideImageInfo[];
  /** スライドサムネイルクリック時のコールバック */
  onSlideClick?: (slideIndex: number) => void;
}

/**
 * メッセージリストコンポーネント
 */
const MessageList: React.FC<MessageListProps> = ({
  messages,
  isProcessing,
  sessionStarted,
  sessionEnded,
  currentMetrics,
  scenario,
  onStartConversation,
  isCameraInitialized = false,
  cameraError = false,
  videoRecordingEnabled = DEFAULT_VIDEO_RECORDING_ENABLED,
  slideImages = [],
  onSlideClick,
}) => {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 商談開始ボタンの有効化判定とラベルを算出
  // 録画オフの場合は常に開始可能（カメラ初期化を待たない）
  // 録画オンの場合はカメラ初期化完了またはカメラエラー時のみ開始可能
  const canStart = !videoRecordingEnabled || isCameraInitialized || cameraError;

  // ボタンラベルの決定（aria-labelと表示テキストで共用）
  const startButtonLabel = useMemo(() => {
    if (!videoRecordingEnabled) {
      return t("conversation.startButtonNoRecording");
    }
    if (isCameraInitialized) {
      return t("conversation.startButton");
    }
    if (cameraError) {
      return t("conversation.startButtonNoRecording");
    }
    return t("conversation.cameraInitializing");
  }, [videoRecordingEnabled, isCameraInitialized, cameraError, t]);

  // メッセージ自動スクロール（親要素のスクロールを防止）
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      // requestAnimationFrameでレンダリング後にスクロール
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages, isProcessing]);

  return (
    <Paper
      ref={scrollContainerRef}
      sx={{
        flex: 1,
        minHeight: 0,
        p: 2,
        overflow: "auto",
        backgroundColor: sessionStarted ? "#fafafa" : "transparent",
        border: sessionStarted ? "1px solid #e0e0e0" : "none",
        boxShadow: sessionStarted ? undefined : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {!sessionStarted ? (
        <Box textAlign="center" py={4} sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Typography variant="h6" gutterBottom>
            {t("conversation.startQuestion")}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            {scenario.description}
          </Typography>

          {/* 録画オフ時のメッセージ */}
          {!videoRecordingEnabled && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 2 }}
              role="status"
            >
              {t("conversation.recordingDisabledMessage")}
            </Typography>
          )}

          {/* 録画オン時のカメラ初期化中メッセージ */}
          {videoRecordingEnabled && !isCameraInitialized && !cameraError && (
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ display: "block", mb: 2 }}
              role="status"
              aria-live="polite"
            >
              {t("conversation.cameraInitializingMessage")}
            </Typography>
          )}

          {/* 録画オン時のカメラアクセス失敗メッセージ */}
          {videoRecordingEnabled && cameraError && (
            <Typography
              variant="caption"
              color="error.main"
              sx={{ display: "block", mb: 2 }}
              role="alert"
            >
              {t("conversation.cameraAccessFailed")}
            </Typography>
          )}

          <Button
            variant="contained"
            size="large"
            onClick={onStartConversation}
            startIcon={<SendIcon />}
            disabled={!canStart}
            data-testid="start-conversation-button"
            aria-label={startButtonLabel}
            sx={{
              opacity: canStart ? 1 : 0.6,
            }}
          >
            {startButtonLabel}
          </Button>
        </Box>
      ) : (
        <>
          {messages.map((message) => (
            <Box key={message.id} mb={2}>
              <Box
                display="flex"
                justifyContent={
                  message.sender === "user" ? "flex-end" : "flex-start"
                }
              >
                <Paper
                  sx={{
                    p: 2,
                    maxWidth: "70%",
                    backgroundColor:
                      message.sender === "user" ? "primary.main" : "white",
                    color: message.sender === "user" ? "white" : "text.primary",
                  }}
                >
                  <Typography variant="body1">{message.content}</Typography>
                  {/* スライド添付サムネイル */}
                  {message.presentedSlides && message.presentedSlides.length > 0 && slideImages.length > 0 && (
                    <Box sx={{ mt: 0.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      {message.presentedSlides.map((page) => {
                        const slide = slideImages.find(s => s.pageNumber === page);
                        if (!slide) return null;
                        const idx = slideImages.indexOf(slide);
                        return (
                          <Box
                            key={page}
                            onClick={(e) => { e.stopPropagation(); onSlideClick?.(idx); }}
                            sx={{
                              width: 48, height: 34, borderRadius: 0.5, overflow: "hidden",
                              cursor: "pointer", border: 1, borderColor: "rgba(255,255,255,0.4)",
                              "&:hover": { opacity: 0.8 },
                            }}
                          >
                            {slide.thumbnailUrl ? (
                              <Box component="img" src={slide.thumbnailUrl} alt={`Slide ${page}`}
                                sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <Box sx={{ width: "100%", height: "100%", bgcolor: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: "0.5rem" }}>
                                {page}
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      opacity: 0.7,
                      display: "block",
                      mt: 0.5,
                    }}
                  >
                    {message.timestamp.toLocaleTimeString()}
                  </Typography>
                </Paper>
              </Box>
            </Box>
          ))}

          {isProcessing && (
            <Box display="flex" justifyContent="flex-start" mb={2}>
              <Paper sx={{ p: 2, backgroundColor: "white" }}>
                <Typography variant="body2" color="text.secondary">
                  {scenario.npc.name} {t("conversation.thinking")}
                </Typography>
                <LinearProgress sx={{ mt: 1, width: 150 }} />
              </Paper>
            </Box>
          )}

          {sessionEnded && (
            <Box textAlign="center" py={3}>
              <Typography variant="h6" gutterBottom>
                {getSessionEndReason(currentMetrics, messages.length)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("conversation.redirectingToResults")}
              </Typography>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </>
      )}
    </Paper>
  );
};

export default MessageList;
