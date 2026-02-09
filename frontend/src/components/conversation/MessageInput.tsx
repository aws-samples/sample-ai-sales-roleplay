import React from "react";
import { Box, TextField, Button, Tooltip } from "@mui/material";
import { Send as SendIcon, Mic as MicIcon } from "@mui/icons-material";
import SpeechRecognitionFeedback from "../SpeechRecognitionFeedback";
import { useTranslation } from "react-i18next";

interface MessageInputProps {
  userInput: string;
  setUserInput: (input: string) => void;
  sendMessage: () => void;
  isProcessing: boolean;
  isListening: boolean;
  isConnecting?: boolean;
  speechRecognitionError: string | null;
  startSpeechRecognition: () => void;
  switchToTextInput: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  sessionStarted: boolean;
  sessionEnded: boolean;
  continuousListening?: boolean; // 常時マイク入力モードフラグ
}

/**
 * メッセージ入力コンポーネント
 */
const MessageInput: React.FC<MessageInputProps> = ({
  userInput,
  setUserInput,
  sendMessage,
  isProcessing,
  isListening,
  isConnecting = false,
  speechRecognitionError,
  startSpeechRecognition,
  switchToTextInput,
  handleKeyDown,
  sessionStarted,
  sessionEnded,
  continuousListening = false,
}) => {
  const { t } = useTranslation();

  if (!sessionStarted || sessionEnded) {
    return null;
  }

  // マイクボタンのツールチップテキスト
  const micTooltip = isListening
    ? t("conversation.input.stopVoice") // "音声入力を停止"
    : userInput
      ? t("conversation.input.continueVoice") // "音声入力を継続（既存のテキストは保持されます）"
      : t("conversation.input.startVoice"); // "音声入力を開始"

  return (
    <>
      {/* 音声認識フィードバック */}
      <SpeechRecognitionFeedback
        isListening={isListening}
        isProcessing={isProcessing}
        isConnecting={isConnecting}
        errorState={speechRecognitionError}
        onSwitchToTextInput={switchToTextInput}
      />

      {/* 入力エリア */}
      <Box display="flex" gap={1} px={1} py={0.5} alignItems="center">
        <TextField
          fullWidth
          multiline
          maxRows={2}
          size="small"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("conversation.input.placeholder")}
          disabled={isProcessing || isListening}
        />
        <Tooltip title={t("conversation.input.send")} placement="top">
          <span>
            <Button
              variant="contained"
              onClick={() => sendMessage()}
              disabled={!userInput.trim() || isProcessing || isListening}
              sx={{ minWidth: "auto", px: 2, py: 1 }}
              aria-label={t("conversation.input.send")}
            >
              <SendIcon />
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={micTooltip} placement="top">
          <span>
            <Button
              variant={isListening ? "contained" : "outlined"}
              onClick={startSpeechRecognition}
              disabled={isProcessing}
              sx={{
                minWidth: "auto",
                px: 2,
                py: 1,
                position: 'relative'
              }}
              color={isListening ? "primary" : "secondary"}
              aria-label={micTooltip}
            >
              <MicIcon />
              {continuousListening && isListening && (
                <Box
                  sx={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    border: '2px solid',
                    borderColor: 'primary.main',
                    opacity: 0.5,
                    animation: 'pulse 1.5s infinite',
                    '@keyframes pulse': {
                      '0%': { transform: 'scale(1)', opacity: 0.7 },
                      '50%': { transform: 'scale(1.1)', opacity: 0.4 },
                      '100%': { transform: 'scale(1)', opacity: 0.7 },
                    },
                  }}
                />
              )}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </>
  );
};

export default MessageInput;
