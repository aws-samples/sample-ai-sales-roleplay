import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Box, Alert, Snackbar } from "@mui/material";
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
    if (import.meta.env.DEV) console.log("Component mounted");

    // カメラアクセス初期化関数
    const initializeCamera = async () => {
      try {
        if (import.meta.env.DEV) console.log("Requesting camera access");
        setError("");

        // タイムアウト処理を追加（10秒）
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Camera initialization timeout")), 10000);
        });

        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user",
            },
            audio: true,
          }),
          timeoutPromise
        ]);

        // ストリームをrefに保存
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsAccessGranted(true);
          if (import.meta.env.DEV) console.log("Camera initialized");
          // 親コンポーネントにカメラ初期化完了を通知
          if (onCameraInitialized) onCameraInitialized(true);
        }
      } catch (error) {
        console.error("Camera access error:", error);
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
      if (import.meta.env.DEV) console.log("Component unmounting - releasing resources");
      stopRecording();
      releaseCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空の依存配列でコンポーネントのマウント時に一度だけ実行

  // isActive プロパティが変更された時の処理
  useEffect(() => {
    if (import.meta.env.DEV) console.log(
      "isActive changed:",
      isActive,
      "recording:",
      isRecording,
      "sessionId:",
      sessionId,
      "camera initialized:",
      isAccessGranted,
    );

    if (isActive && !isRecording && sessionId) {
      // セッションがアクティブで、sessionIdが有効な場合のみ録画開始
      // カメラ初期化が完了していれば即座に録画開始
      if (isAccessGranted) {
        if (import.meta.env.DEV) console.log("Camera initialized, starting recording");
        startRecording();
      } else {
        if (import.meta.env.DEV) console.log("Waiting for camera initialization, recording deferred");
      }
    } else if (!isActive && isRecording) {
      // セッションが非アクティブになったら録画停止
      stopRecording();
    } else if (isActive && !sessionId) {
      // sessionIdが無効な場合は警告を出力
      console.warn("Recording start requested but sessionId is empty");
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

    if (import.meta.env.DEV) console.log("Recording started");

    if (!streamRef.current) {
      console.error("Camera stream not available");
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
        if (import.meta.env.DEV) console.log("Recording stopped");

        try {
          // MP4形式でBlobを作成
          const blob = new Blob(chunksRef.current, { type: "video/mp4" });
          if (import.meta.env.DEV) console.log(
            "Recording blob size:",
            blob.size,
            "bytes",
            "MIME type: video/mp4",
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
            console.warn("Empty blob generated");
          }
        } catch (err) {
          console.error("Recording data processing error:", err);
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
      console.error("Recording start error:", error);
      setError(t("recording.startError"));
      setSnackbarOpen(true);
      if (onError) onError(t("recording.startError"));
    }
  };

  // 録画停止
  const stopRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;

    if (import.meta.env.DEV) console.log("Recording stopped");

    try {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } catch (error) {
      console.error("Recording stop error:", error);
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
        if (import.meta.env.DEV) console.log(`Upload attempt ${attempt}/${maxRetries}`);
        if (import.meta.env.DEV) console.log("Form data fields:", Object.keys(uploadInfo.formData));

        const formData = new FormData();

        // S3 presigned POSTでは、フィールドの順序が重要
        // 'key'フィールドを最初に、'file'フィールドを最後に追加する必要がある
        // また、'Content-Type'フィールドも正しく追加する必要がある
        const orderedFields = ['key', 'Content-Type', 'x-amz-algorithm', 'x-amz-credential', 'x-amz-date', 'x-amz-security-token', 'policy', 'x-amz-signature'];

        // 順序通りにフィールドを追加
        orderedFields.forEach(fieldName => {
          if (uploadInfo.formData[fieldName]) {
            formData.append(fieldName, uploadInfo.formData[fieldName]);
            if (import.meta.env.DEV) console.log(`Field added: ${fieldName}`);
          }
        });

        // 残りのフィールドを追加（上記以外のフィールドがある場合）
        Object.entries(uploadInfo.formData).forEach(([key, value]) => {
          if (!orderedFields.includes(key)) {
            formData.append(key, value);
            if (import.meta.env.DEV) console.log(`Additional field: ${key}`);
          }
        });

        // fileフィールドは必ず最後に追加（ファイル名も指定）
        const file = new File([blob], videoKey.split('/').pop() || 'recording.mp4', { type: 'video/mp4' });
        formData.append("file", file);
        if (import.meta.env.DEV) console.log(`File added: size=${file.size}, name=${file.name}, type=${file.type}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分タイムアウト

        const response = await fetch(uploadInfo.uploadUrl, {
          method: "POST",
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok || response.status === 204) {
          if (import.meta.env.DEV) console.log("S3 upload success:", response.status);
          localStorage.setItem("lastRecordingKey", videoKey);
          if (import.meta.env.DEV) console.log("Recording key saved to localStorage:", videoKey);

          // 録画完了イベントを発火
          const event = new CustomEvent('recordingComplete', {
            detail: { videoKey, sessionId }
          });
          window.dispatchEvent(event);
          return; // 成功したら終了
        } else {
          // エラーレスポンスの詳細を取得
          const errorText = await response.text();
          console.error(`S3 error response: ${errorText}`);
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
      } catch (error) {
        console.error(`Upload attempt ${attempt} failed:`, error);

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
      if (import.meta.env.DEV) console.log("S3 upload start:", videoKey, "size:", Math.round(blob.size / 1024 / 1024 * 100) / 100, "MB");

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
        if (import.meta.env.DEV) console.log("Signed URL obtained:", uploadInfo.uploadUrl);

        // BlobをS3にPOSTフォームでアップロード（リトライ機能付き）
        await uploadWithRetry(uploadInfo, blob, videoKey);

      } catch (uploadError) {
        console.error("S3 upload process error:", uploadError);
        // エラーが発生した場合でも、親コンポーネントにエラー情報を渡す
        if (onError) {
          onError(t("recording.uploadError"));
        }
        // エラーが発生してもvideoKeyは渡して処理を続行
      }

      if (import.meta.env.DEV) console.log("Recording data saved:", videoKey);

      // コールバックを呼び出し（エラーが発生してもvideoKeyは渡す）
      if (onRecordingComplete) {
        onRecordingComplete(videoKey);
      }
    } catch (err) {
      console.error("Recording data processing failed:", err);
      if (onError) {
        onError(t("recording.recordingDataProcessingFailed"));
      }
    }
  };

  // 明示的な録画停止のためのメソッドを外部に公開
  useImperativeHandle(ref, () => ({
    forceStopRecording: async () => {
      if (import.meta.env.DEV) console.log("VideoRecorder: forceStopRecording called");
      return new Promise<void>((resolve) => {
        if (isRecording && mediaRecorderRef.current) {
          if (import.meta.env.DEV) console.log("VideoRecorder: Recording in progress, stopping");

          // 録画停止完了を待つためのイベントリスナーを設定
          const handleStop = () => {
            if (import.meta.env.DEV) console.log("VideoRecorder: Recording stopped");
            if (mediaRecorderRef.current) {
              mediaRecorderRef.current.removeEventListener('stop', handleStop);
            }
            resolve();
          };

          mediaRecorderRef.current.addEventListener('stop', handleStop);
          stopRecording();
        } else {
          if (import.meta.env.DEV) console.log("VideoRecorder: Not recording, skipping stop");
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
    <Box sx={{ borderRadius: 1, overflow: "hidden", lineHeight: 0 }}>
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

      {/* ビデオプレビュー */}
      <Box sx={{ position: "relative" }}>
        {previewUrl ? (
          <Box sx={{ position: "relative" }}>
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              width="100%"
              height="auto"
              style={{ display: "block", borderRadius: 4 }}
              onError={(e) => {
                console.error("Video load error:", e);
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
            style={{ display: "block", borderRadius: 4 }}
          />
        )}
      </Box>

      {/* 録画ステータスインジケーター */}
      {isActive && (
        <Box
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#ef4444",
            animation: "pulse 1.5s infinite",
            "@keyframes pulse": {
              "0%, 100%": { opacity: 1 },
              "50%": { opacity: 0.4 },
            },
            "@media (prefers-reduced-motion: reduce)": {
              animation: "none",
            },
          }}
          aria-label={t("recording.recordingActive")}
        />
      )}
    </Box>
  );
});

VideoRecorder.displayName = 'VideoRecorder';

export default VideoRecorder;
