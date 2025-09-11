import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Box, Typography, Alert, Snackbar } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { VideoRecorderRef } from "../../../types/components";

interface VideoRecorderProps {
  sessionId: string;
  isActive: boolean; // セッションがアクティブかどうか（録画を行うべきかどうか）
  onRecordingComplete?: (videoKey: string) => void;
  onError?: (error: string) => void;
  onCameraInitialized?: (initialized: boolean) => void; // カメラ初期化状態の通知
}

/**
 * セッション録画用コンポーネント (改良版)
 * カメラへのアクセス、録画、アップロードを担当
 * 商談開始時のアンマウント問題を解決するため、コンポーネント自体はマウントされたままで
 * 内部状態だけを変更することでセッション間の録画を継続します
 */
const VideoRecorder = forwardRef<VideoRecorderRef, VideoRecorderProps>(({
  sessionId,
  isActive,
  onRecordingComplete,
  onError,
  onCameraInitialized,
}, ref) => {
  const { t } = useTranslation();

  // refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<number | null>(null);

  // state
  const [isAccessGranted, setIsAccessGranted] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [, setRecordingDuration] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);

  // カメラアクセスの初期化 - コンポーネントがマウントされた時に一度だけ実行
  useEffect(() => {
    console.log(t("recording.componentMounted"));

    // カメラアクセス初期化関数
    const initializeCamera = async () => {
      try {
        console.log(t("recording.cameraAccessRequested"));
        setError("");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: true,
        });

        // ストリームをrefに保存
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsAccessGranted(true);
          console.log(t("recording.cameraInitialized"));
          // 親コンポーネントにカメラ初期化完了を通知
          if (onCameraInitialized) onCameraInitialized(true);
        }
      } catch (error) {
        console.error("カメラアクセスエラー:", error);
        setError(t("recording.cameraAccessError"));
        setSnackbarOpen(true);
        if (onError) onError(t("recording.cameraAccessError"));
        // 親コンポーネントにカメラ初期化失敗を通知
        if (onCameraInitialized) onCameraInitialized(false);
      }
    };

    // コンポーネントマウント時にカメラを初期化
    initializeCamera();

    // クリーンアップ関数
    return () => {
      console.log(t("recording.componentUnmounted"));
      stopRecording();
      releaseCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空の依存配列でコンポーネントのマウント時に一度だけ実行

  // isActive プロパティが変更された時の処理
  useEffect(() => {
    console.log(
      t("recording.isActiveChanged") + ":",
      isActive,
      "録画状態:",
      isRecording,
      "sessionId:",
      sessionId,
      "カメラ初期化状態:",
      isAccessGranted,
    );

    if (isActive && !isRecording && sessionId) {
      // セッションがアクティブで、sessionIdが有効な場合のみ録画開始
      // カメラ初期化が完了していれば即座に録画開始
      if (isAccessGranted) {
        console.log("カメラ初期化完了、録画を開始します");
        startRecording();
      } else {
        console.log("カメラ初期化待機中：録画開始は保留");
      }
    } else if (!isActive && isRecording) {
      // セッションが非アクティブになったら録画停止
      stopRecording();
    } else if (isActive && !sessionId) {
      // sessionIdが無効な場合は警告を出力
      console.warn(t("recording.recordingStartRequested"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isRecording, sessionId]);

  // カメラストリームを解放
  const releaseCamera = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsAccessGranted(false);

    // プレビューURL解放
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  };

  // 録画開始
  const startRecording = () => {
    if (isRecording || !isAccessGranted) return;

    console.log(t("recording.recordingStarted"));

    if (!streamRef.current) {
      console.error("カメラストリームがありません");
      setError(t("recording.cameraNotInitialized"));
      setSnackbarOpen(true);
      return;
    }

    try {
      // MP4形式のみをサポート
      let options;
      if (MediaRecorder.isTypeSupported("video/mp4; codecs=h264")) {
        options = { mimeType: "video/mp4; codecs=h264" };
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        options = { mimeType: "video/mp4" };
      } else {
        throw new Error(t("recording.browserNotSupported"));
      }

      // チャンクをリセット
      chunksRef.current = [];

      // MediaRecorderインスタンスを作成
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);

      // データ取得のイベントハンドラ
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // 録画停止時の処理
      mediaRecorderRef.current.onstop = () => {
        console.log(t("recording.recordingStopped"));

        try {
          // MP4形式でBlobを作成
          const blob = new Blob(chunksRef.current, { type: "video/mp4" });
          console.log(
            t("recording.recordingBlobSize") + ":",
            blob.size,
            "バイト",
            "MIMEタイプ: video/mp4",
          );

          // 以前のURLを解放
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
          }

          // 有効なBlobのみURLを作成
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);

            // 録画データを保存
            saveRecordingData(blob);
          } else {
            console.warn(t("recording.emptyBlobGenerated"));
          }
        } catch (err) {
          console.error(t("recording.recordingDataProcessingError") + ":", err);
        }

        // 録画時間をリセット
        stopDurationTimer();
        setIsRecording(false);
      };

      // 録画開始
      mediaRecorderRef.current.start(100); // 100msごとにデータを取得
      setIsRecording(true);
      startDurationTimer();
    } catch (error) {
      console.error(t("recording.startError") + ":", error);
      setError(t("recording.startError"));
      setSnackbarOpen(true);
      if (onError) onError(t("recording.startError"));
    }
  };

  // 録画停止
  const stopRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;

    console.log(t("recording.recordingStopped"));

    try {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } catch (error) {
      console.error(t("recording.recordingStopError") + ":", error);
    }
  };

  // 録画時間タイマー開始
  const startDurationTimer = () => {
    setRecordingDuration(0);
    durationTimerRef.current = window.setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  };

  // 録画時間タイマー停止
  const stopDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  // リトライ機能付きアップロード
  const uploadWithRetry = async (uploadInfo: { uploadUrl: string; formData: Record<string, string> }, blob: Blob, videoKey: string, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`アップロード試行 ${attempt}/${maxRetries}`);
        
        const formData = new FormData();
        Object.entries(uploadInfo.formData).forEach(([key, value]) => {
          formData.append(key, value);
        });
        formData.append("file", blob);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分タイムアウト

        const response = await fetch(uploadInfo.uploadUrl, {
          method: "POST",
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(t("recording.s3UploadSuccess"), response.status);
          localStorage.setItem("lastRecordingKey", videoKey);
          console.log("録画キーをlocalStorageに保存:", videoKey);
          
          // 録画完了イベントを発火
          const event = new CustomEvent('recordingComplete', { 
            detail: { videoKey, sessionId } 
          });
          window.dispatchEvent(event);
          return; // 成功したら終了
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error(`アップロード試行 ${attempt} 失敗:`, error);
        
        if (attempt === maxRetries) {
          throw error; // 最後の試行で失敗したらエラーを投げる
        }
        
        // 指数バックオフで待機
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  };

  // 録画データの保存処理
  const saveRecordingData = async (blob: Blob) => {
    try {
      // sessionIdが無効な場合はエラーを投げる
      if (!sessionId || sessionId.trim() === "") {
        throw new Error(t("recording.sessionIdNotSet"));
      }

      const videoKey = `session_${sessionId}_${new Date().getTime()}.mp4`;
      console.log(t("recording.s3UploadStart") + ": " + videoKey, "サイズ:", Math.round(blob.size / 1024 / 1024 * 100) / 100, "MB");

      // APIサービスを使用して署名付きURLを取得してS3にアップロード
      try {
        // ApiServiceのインポート
        const { ApiService } = await import("../../../services/ApiService");
        const apiService = ApiService.getInstance();

        // 署名付きURLを取得
        const contentType = "video/mp4";
        const uploadInfo = await apiService.getVideoUploadUrl(
          sessionId,
          contentType,
          videoKey,
        );
        console.log(t("recording.signedUrlObtained") + ":", uploadInfo.uploadUrl);

        // BlobをS3にPOSTフォームでアップロード（リトライ機能付き）
        await uploadWithRetry(uploadInfo, blob, videoKey);

      } catch (uploadError) {
        console.error(t("recording.s3UploadProcessError") + ":", uploadError);
        // エラーが発生した場合でも、親コンポーネントにエラー情報を渡す
        if (onError) {
          onError(`アップロードエラー: ${uploadError}`);
        }
        // エラーが発生してもvideoKeyは渡して処理を続行
      }

      console.log(t("recording.recordingDataSaved") + ":", videoKey);

      // コールバックを呼び出し（エラーが発生してもvideoKeyは渡す）
      if (onRecordingComplete) {
        onRecordingComplete(videoKey);
      }
    } catch (err) {
      console.error(t("recording.recordingDataProcessingFailed") + ":", err);
      if (onError) {
        onError(t("recording.recordingDataProcessingFailed"));
      }
    }
  };

  // 明示的な録画停止のためのメソッドを外部に公開
  useImperativeHandle(ref, () => ({
    forceStopRecording: async () => {
      console.log("VideoRecorder: forceStopRecording呼び出し");
      return new Promise<void>((resolve) => {
        if (isRecording && mediaRecorderRef.current) {
          console.log("VideoRecorder: 録画中のため停止処理を実行");
          
          // 録画停止完了を待つためのイベントリスナーを設定
          const handleStop = () => {
            console.log("VideoRecorder: 録画停止完了");
            if (mediaRecorderRef.current) {
              mediaRecorderRef.current.removeEventListener('stop', handleStop);
            }
            resolve();
          };
          
          mediaRecorderRef.current.addEventListener('stop', handleStop);
          stopRecording();
        } else {
          console.log("VideoRecorder: 録画していないため停止処理をスキップ");
          resolve();
        }
      });
    }
  }));

  // スナックバーを閉じる
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  return (
    <Box sx={{ border: 1, borderColor: "grey.300", borderRadius: 1, p: 2 }}>
      {/* エラー表示用Snackbar */}
      <Snackbar
        open={snackbarOpen && !!error}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity="error"
          variant="filled"
          sx={{ width: "100%" }}
        >
          {error}
        </Alert>
      </Snackbar>

      {/* isActiveステータス表示（開発用） */}
      <Typography
        variant="caption"
        color={isActive ? "success.main" : "text.secondary"}
        sx={{ display: "block", mb: 1 }}
      >
        {isActive
          ? t("recording.recordingActive")
          : t("recording.recordingStandby")}
      </Typography>

      {/* ビデオプレビュー */}
      <Box sx={{ position: "relative", mb: 2 }}>
        {previewUrl ? (
          <Box sx={{ position: "relative" }}>
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              width="100%"
              height="auto"
              onError={(e) => {
                console.error(t("recording.videoLoadError") + ":", e);
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl("");
                }
              }}
            />
          </Box>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            width="100%"
            height="auto"
          />
        )}
      </Box>
    </Box>
  );
});

VideoRecorder.displayName = 'VideoRecorder';

export default VideoRecorder;
