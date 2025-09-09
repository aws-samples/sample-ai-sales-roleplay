import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Box } from "@mui/material";
import VideoRecorder from "./VideoRecorder";
import type { VideoManagerRef, VideoRecorderRef } from "../../../types/components";

interface VideoManagerProps {
  sessionId: string;
  sessionStarted: boolean;
  sessionEnded: boolean;
}

/**
 * ビデオ録画管理コンポーネント
 * セッションのライフサイクル全体を通じてビデオ録画の状態を管理します。
 * このコンポーネントは商談ページ内で常に表示され続けるため、
 * 商談開始時のコンポーネント再マウントの問題を回避します。
 */
const VideoManager = forwardRef<VideoManagerRef, VideoManagerProps>(({
  sessionId,
  sessionStarted,
  sessionEnded,
}, ref) => {
  const [videoKey, setVideoKey] = useState<string>("");
  const [recordingError, setRecordingError] = useState<string>("");
  const videoRecorderRef = useRef<VideoRecorderRef | null>(null);

  // sessionIdの変化をログ出力
  useEffect(() => {
    console.log(
      "VideoManager: sessionId変更:",
      sessionId,
      "sessionStarted:",
      sessionStarted,
      "sessionEnded:",
      sessionEnded,
    );
  }, [sessionId, sessionStarted, sessionEnded]);

  // 録画完了時の処理
  const handleRecordingComplete = (key: string) => {
    console.log(`録画完了: ${key}`);
    setVideoKey(key);

    // セッション情報に録画キーを関連付けて保存
    localStorage.setItem(`session_${sessionId}_videoKey`, key);
    localStorage.setItem("lastRecordingKey", key);
  };

  // エラー処理
  const handleRecordingError = (error: string) => {
    console.error(`録画エラー: ${error}`);
    setRecordingError(error);
  };

  // videoKey が変更されたときにコンソールに記録
  useEffect(() => {
    if (videoKey) {
      console.log(`VideoManager: 新しいvideoKey設定: ${videoKey}`);
    }
  }, [videoKey]);

  // 親コンポーネントから明示的に録画を停止するための関数を公開
  useImperativeHandle(ref, () => ({
    forceStopRecording: async () => {
      console.log("VideoManager: 明示的な録画停止が要求されました");
      if (videoRecorderRef.current) {
        return await videoRecorderRef.current.forceStopRecording();
      }
      return Promise.resolve();
    }
  }));

  // sessionEndedが変化したときの明示的な処理
  useEffect(() => {
    if (sessionEnded && sessionStarted && videoRecorderRef.current) {
      console.log("VideoManager: sessionEnded検知による録画停止処理");
      
      // 録画停止処理を確実に実行
      const forceStopWithRetry = async () => {
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
          try {
            console.log(`VideoManager: 録画停止試行 ${attempts + 1}/${maxAttempts}`);
            if (videoRecorderRef.current) {
              await videoRecorderRef.current.forceStopRecording();
              console.log("VideoManager: 録画停止完了");
              break;
            }
          } catch (error) {
            console.error(`VideoManager: 録画停止試行 ${attempts + 1} でエラー:`, error);
            attempts++;
            
            if (attempts < maxAttempts) {
              // 1秒待ってリトライ
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        
        if (attempts >= maxAttempts) {
          console.error("VideoManager: 録画停止が最大試行回数に達しました");
        }
      };
      
      // 少し遅延させてから録画停止を確実に実行
      setTimeout(() => {
        forceStopWithRetry();
      }, 100);
    }
  }, [sessionEnded, sessionStarted]);

  return (
    <Box>
      {/* 
        VideoRecorderコンポーネントはマウントされたままで、
        isActiveプロパティによって録画のON/OFFを制御します
      */}
      <VideoRecorder
        ref={videoRecorderRef}
        sessionId={sessionId}
        isActive={sessionStarted && !sessionEnded && sessionId !== ""}
        onRecordingComplete={handleRecordingComplete}
        onError={handleRecordingError}
      />

      {recordingError && (
        <Box
          mt={1}
          p={1}
          bgcolor="error.light"
          color="error.contrastText"
          borderRadius={1}
        >
          {recordingError}
        </Box>
      )}
    </Box>
  );
});

VideoManager.displayName = 'VideoManager';

export default VideoManager;
