import React, { useRef, useEffect } from "react";
import { Box, Typography, Paper, LinearProgress, Button } from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";
import { Message, Metrics, Scenario } from "../../types/index";
import { getSessionEndReason } from "../../utils/dialogueEngine";
import { useTranslation } from "react-i18next";

interface MessageListProps {
  messages: Message[];
  isProcessing: boolean;
  sessionStarted: boolean;
  sessionEnded: boolean;
  currentMetrics: Metrics;
  scenario: Scenario;
  onStartConversation: () => void;
  isCameraInitialized?: boolean; // カメラ初期化状態
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
}) => {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // メッセージ自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Paper
      sx={{
        flexGrow: 1,
        p: 2,
        overflow: "auto",
        backgroundColor: "#fafafa",
        border: "1px solid #e0e0e0",
      }}
    >
      {!sessionStarted ? (
        <Box textAlign="center" py={4}>
          <Typography variant="h6" gutterBottom>
            {t("conversation.startQuestion")}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            {scenario.description}
          </Typography>
          
          {!isCameraInitialized && (
            <Typography 
              variant="caption" 
              color="warning.main" 
              sx={{ display: "block", mb: 2 }}
            >
              📹 カメラを初期化しています。しばらくお待ちください...
            </Typography>
          )}
          
          <Button
            variant="contained"
            size="large"
            onClick={onStartConversation}
            startIcon={<SendIcon />}
            disabled={!isCameraInitialized}
            sx={{
              opacity: isCameraInitialized ? 1 : 0.6,
            }}
          >
            {isCameraInitialized 
              ? t("conversation.startButton") 
              : "カメラ初期化中..."}
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
