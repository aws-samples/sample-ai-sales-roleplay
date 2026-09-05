import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Box, Alert, Snackbar } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { VideoRecorderRef } from "../../../types/components";
import { isDevEnvironment } from "../../../utils/env";

// マルチパートアップロードの1パートあたりのサイズ（10MB、S3の最小5MB以上）
// 録画動画はファイルサイズに関わらずマルチパートアップロードで送信するため、
// 長時間セッションの大容量動画（200MB超）でもS3のサイズ制限に達しない
const MULTIPART_PART_SIZE_BYTES = 10 * 1024 * 1024;

// isActive が true になってから録画開始を待つ猶予時間（ミリ秒）。
// カメラ初期化のタイムアウト（10秒）より長くし、初期化完了を待って
// 録画が始まるケースを誤検知しないようにする。
const RECORDING_START_GRACE_MS = 15000;

/**
 * 録画の実行状態。親コンポーネントは録画が実際に開始されたかどうかを知る必要がある。
 * - idle: まだ録画が開始されていない
 * - recording: 録画が開始された（アップロード完了を待つ価値がある）
 * - failed: 録画の開始・アップロードに失敗した（待機しても意味がない）
 */
export type RecordingState = "idle" | "recording" | "failed";

interface VideoRecorderProps {
  sessionId: string;
  isActive: boolean; // セッションがアクティブかどうか（録画を行うべきかどうか）
  onRecordingComplete?: (videoKey: string) => void;
  onError?: (error: string) => void;
  onCameraInitialized?: (initialized: boolean) => void; // カメラ初期化状態の通知
  onRecordingStateChange?: (state: RecordingState) => void; // 録画状態の通知
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
  onRecordingStateChange,
}, ref) => {
  const { t } = useTranslation();

  // refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  // プレビューURLの最新値。onstop などの非同期コールバックが state の
  // 古いクロージャを参照して URL を revoke し損ねるのを防ぐ。
  const previewUrlRef = useRef<string>("");
  // このセッションで一度でも録画が開始されたか（停止時の無音失敗を検出するため）
  const hasStartedRecordingRef = useRef<boolean>(false);
  // このセッションで録画すべき状態（isActive=true）になったか。
  // 停止要求時には既に isActive=false になっているため、判定にはこのフラグを使う。
  const wasActiveRef = useRef<boolean>(false);
  // カメラ初期化が失敗したか（録画開始の猶予タイマーの二重通知を避けるため）
  const cameraFailedRef = useRef<boolean>(false);

  // state
  const [isAccessGranted, setIsAccessGranted] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [, setRecordingDuration] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);

  // プレビューURLは ref と state の両方で保持する（下記 previewUrlRef のコメント参照）
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // 録画の開始・アップロード失敗を利用者と親コンポーネントの両方に伝える。
  // 「録画されているつもりだったが記録が残っていなかった」状態を防ぐため、
  // 本番ビルドでも必ず console に残し、Snackbar と onError で明示する。
  const reportRecordingFailure = useCallback(
    (messageKey: string, detail?: unknown) => {
      const message = t(messageKey);
      console.error(`Recording failure: ${message}`, detail ?? "");
      setError(message);
      setSnackbarOpen(true);
      if (onError) onError(message);
      if (onRecordingStateChange) onRecordingStateChange("failed");
      // 呼び出し元（ConversationPage）がアップロード待ちを打ち切れるよう通知する
      window.dispatchEvent(
        new CustomEvent("recordingFailed", { detail: { sessionId, message } }),
      );
    },
    [onError, onRecordingStateChange, sessionId, t],
  );

  // カメラアクセスの初期化 - コンポーネントがマウントされた時に一度だけ実行
  useEffect(() => {
    if (isDevEnvironment()) console.log("Component mounted");

    // カメラアクセス初期化関数
    const initializeCamera = async () => {
      try {
        if (isDevEnvironment()) console.log("Requesting camera access");
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

        // <video> 要素がまだマウントされていない場合でもカメラ初期化は完了扱いにする。
        // srcObject の割り当ては videoRef が利用可能になった時点で別の useEffect が行う。
        // （以前は videoRef.current が null だと isAccessGranted が永久に false のままで、
        //  録画が一切開始されなかった）
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        cameraFailedRef.current = false;
        setIsAccessGranted(true);
        if (isDevEnvironment()) console.log("Camera initialized");
        // 親コンポーネントにカメラ初期化完了を通知
        if (onCameraInitialized) onCameraInitialized(true);
      } catch (error) {
        console.error("Camera access error:", error);
        cameraFailedRef.current = true;
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
      if (isDevEnvironment()) console.log("Component unmounting - releasing resources");
      stopRecording();
      releaseCamera();
    };
    // カメラ初期化はマウント時に一度だけ行う意図的な処理のため exhaustive-deps を無効化する。
    // （録画開始を制御する下の useEffect では無効化していない。依存漏れを ESLint に
    //  検出させるためであり、isAccessGranted の漏れが本 Issue の原因だった）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空の依存配列でコンポーネントのマウント時に一度だけ実行

  // カメラストリームを <video> 要素へ割り当てる。
  // カメラ初期化の完了と <video> のマウント順序に依存しないよう、初期化本体から分離している。
  useEffect(() => {
    // プレビュー再生中（previewUrl あり）は src 属性を使うため srcObject は設定しない
    if (previewUrl) return;
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [previewUrl, isAccessGranted]);

  // 最新の startRecording / stopRecording を保持する ref。
  // これらの関数は毎レンダー再生成されるため依存配列に直接入れると effect が無駄に再実行される。
  // ref 経由で呼ぶことで、依存配列を「録画すべきかどうかを決める値」だけに保ちつつ
  // exhaustive-deps を満たせる（= 依存漏れを ESLint が検出できる状態を維持できる）。
  const startRecordingRef = useRef<() => void>(() => {});
  const stopRecordingRef = useRef<() => void>(() => {});

  // セッションが切り替わったら録画状態のフラグをリセットする
  useEffect(() => {
    hasStartedRecordingRef.current = false;
    wasActiveRef.current = false;
  }, [sessionId]);

  // isActive プロパティが変更された時の処理
  useEffect(() => {
    if (isDevEnvironment()) console.log(
      "isActive changed:",
      isActive,
      "recording:",
      isRecording,
      "sessionId:",
      sessionId,
      "camera initialized:",
      isAccessGranted,
    );

    if (isActive && sessionId) {
      wasActiveRef.current = true;
    }

    if (isActive && !isRecording && sessionId) {
      // セッションがアクティブで、sessionIdが有効な場合のみ録画開始
      // カメラ初期化が完了していれば即座に録画開始
      if (isAccessGranted) {
        if (isDevEnvironment()) console.log("Camera initialized, starting recording");
        startRecordingRef.current();
      } else {
        // カメラ初期化の完了を待つ。isAccessGranted が依存配列に含まれているため、
        // 初期化完了時にこの effect が再実行されて録画が開始される。
        if (isDevEnvironment()) console.log("Waiting for camera initialization, recording deferred");
      }
    } else if (!isActive && isRecording) {
      // セッションが非アクティブになったら録画停止
      stopRecordingRef.current();
    } else if (isActive && !sessionId) {
      // sessionIdが無効な場合は警告を出力
      console.warn("Recording start requested but sessionId is empty");
    }
  }, [isActive, isRecording, sessionId, isAccessGranted]);

  // 録画開始の監視。isActive になってから猶予時間内に録画が開始されない場合は、
  // 無音のまま録画されないことを防ぐため利用者と親コンポーネントに明示する。
  useEffect(() => {
    if (!isActive || !sessionId || isRecording || isAccessGranted) return;

    const timeoutId = window.setTimeout(() => {
      // カメラアクセス自体が失敗している場合は既に通知済みなので二重に出さない
      if (cameraFailedRef.current) return;
      reportRecordingFailure("recording.notStartedError");
    }, RECORDING_START_GRACE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isActive, sessionId, isRecording, isAccessGranted, reportRecordingFailure]);

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

    // プレビューURL解放（ref を使い、古いクロージャの値を参照しないようにする）
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
      setPreviewUrl("");
    }
  };

  // 録画開始
  const startRecording = () => {
    if (isRecording || !isAccessGranted) return;

    if (isDevEnvironment()) console.log("Recording started");

    if (!streamRef.current) {
      reportRecordingFailure("recording.cameraNotInitialized");
      return;
    }

    try {
      // MP4形式のみをサポート
      // ビットレートを制限してファイルサイズを抑制（S3アップロード上限対策）
      const videoBitsPerSecond = 1_500_000; // 1.5Mbps（10分録画で約112MB以内）
      let options: MediaRecorderOptions;
      if (MediaRecorder.isTypeSupported("video/mp4; codecs=h264")) {
        options = { mimeType: "video/mp4; codecs=h264", videoBitsPerSecond };
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        options = { mimeType: "video/mp4", videoBitsPerSecond };
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
        if (isDevEnvironment()) console.log("Recording stopped");

        try {
          // MP4形式でBlobを作成
          const blob = new Blob(chunksRef.current, { type: "video/mp4" });
          if (isDevEnvironment()) console.log(
            "Recording blob size:",
            blob.size,
            "bytes",
            "MIME type: video/mp4",
          );

          // 以前のURLを解放（ref を使い、古いクロージャの値を参照しないようにする）
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
          }

          // 有効なBlobのみURLを作成
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);

            // 録画データを保存
            saveRecordingData(blob);
          } else {
            // 空のBlobはアップロードされないため、待機側が90秒待たされないよう失敗として通知する
            reportRecordingFailure("recording.emptyRecordingError");
          }
        } catch (err) {
          console.error("Recording data processing error:", err);
          reportRecordingFailure("recording.recordingDataProcessingFailed", err);
        }

        // 録画時間をリセット
        stopDurationTimer();
        setIsRecording(false);
      };

      // 録画開始
      mediaRecorderRef.current.start(100); // 100msごとにデータを取得
      hasStartedRecordingRef.current = true;
      setIsRecording(true);
      startDurationTimer();
      if (onRecordingStateChange) onRecordingStateChange("recording");
    } catch (error) {
      reportRecordingFailure("recording.startError", error);
    }
  };

  // 録画停止
  const stopRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;

    if (isDevEnvironment()) console.log("Recording stopped");

    try {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } catch (error) {
      console.error("Recording stop error:", error);
    }
  };

  // 上の isActive 監視 effect から最新の実装を呼べるようにする（latest ref パターン）
  startRecordingRef.current = startRecording;
  stopRecordingRef.current = stopRecording;

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

  // 1パートのアップロード（リトライ機能付き、ETagを返す）
  const uploadPartWithRetry = async (
    url: string,
    partBlob: Blob,
    partNumber: number,
    maxRetries = 3,
  ): Promise<string> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 1パートあたり5分タイムアウト

        const response = await fetch(url, {
          method: "PUT",
          body: partBlob,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        // S3はパートアップロードのレスポンスでETagヘッダーを返す
        // （CORSのexposedHeadersでETagを公開済み）
        const eTag = response.headers.get("ETag");
        if (!eTag) {
          throw new Error(`ETag header not found for part ${partNumber}`);
        }

        if (isDevEnvironment()) {
          console.log(`Part ${partNumber} uploaded: eTag=${eTag}`);
        }
        return eTag;
      } catch (error) {
        console.error(`Part ${partNumber} upload attempt ${attempt} failed:`, error);

        if (attempt === maxRetries) {
          throw error;
        }
        // 指数バックオフで待機
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    // ここには到達しないが型のために明示
    throw new Error(`Failed to upload part ${partNumber}`);
  };

  // localStorageへの書き込み（Safariプライベートモード等で例外が発生しても
  // アップロード成功処理全体を失敗させないよう、try-catchで保護する）
  const safeSetLocalStorage = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (storageError) {
      console.warn(`localStorageへの保存に失敗しました（key=${key}）:`, storageError);
    }
  };

  // マルチパートアップロード（長時間セッションの大容量動画向け）
  // 成功時はサーバーが採番した動画キー（videos/{sessionId}/...）を返す。
  // 呼び出し元はこのキーを下流処理（localStorage・録画完了通知）に使い、
  // フロント・バックエンド間でキーを一本化する。
  const uploadWithMultipart = async (
    blob: Blob,
    sessionId: string,
    videoKey: string,
  ): Promise<string> => {
    const { ApiService } = await import("../../../services/ApiService");
    const apiService = ApiService.getInstance();

    // パート数を算出（S3の仕様上、最後のパート以外は5MB以上必要）
    const partCount = Math.ceil(blob.size / MULTIPART_PART_SIZE_BYTES);
    const fileName = videoKey.split("/").pop() || "recording.mp4";

    if (isDevEnvironment()) {
      console.log(
        `Multipart upload start: size=${Math.round(blob.size / 1024 / 1024 * 100) / 100}MB, parts=${partCount}`,
      );
    }

    // マルチパートアップロードを開始し、各パートの署名付きURLを取得
    const { uploadId, videoKey: serverVideoKey, partUrls } =
      await apiService.createMultipartUpload(sessionId, "video/mp4", partCount, fileName);

    try {
      // 各パートを順次アップロードしてETagを収集
      const uploadedParts: Array<{ partNumber: number; eTag: string }> = [];
      for (const { partNumber, url } of partUrls) {
        const start = (partNumber - 1) * MULTIPART_PART_SIZE_BYTES;
        const end = Math.min(start + MULTIPART_PART_SIZE_BYTES, blob.size);
        const partBlob = blob.slice(start, end);

        const eTag = await uploadPartWithRetry(url, partBlob, partNumber);
        uploadedParts.push({ partNumber, eTag });
      }

      // 全パート完了後、S3にパート結合を指示
      await apiService.completeMultipartUpload(serverVideoKey, uploadId, uploadedParts);

      if (isDevEnvironment()) console.log("Multipart upload success:", serverVideoKey);

      // サーバー採番のキーで保存・通知し、フロント/バックエンドのキーを一致させる
      safeSetLocalStorage("lastRecordingKey", serverVideoKey);

      // 録画完了イベントを発火
      const event = new CustomEvent("recordingComplete", {
        detail: { videoKey: serverVideoKey, sessionId },
      });
      window.dispatchEvent(event);

      // 呼び出し元がサーバー採番のキーを使えるよう返却する
      return serverVideoKey;
    } catch (error) {
      // 失敗時はマルチパートアップロードを中断してパートの残骸を破棄
      console.error("Multipart upload failed, aborting:", error);
      await apiService.abortMultipartUpload(serverVideoKey, uploadId);
      throw error;
    }
  };

  // 録画データの保存処理
  const saveRecordingData = async (blob: Blob) => {
    try {
      // sessionIdが無効な場合はエラーを投げる
      if (!sessionId || sessionId.trim() === "") {
        throw new Error(t("recording.sessionIdNotSet"));
      }

      // ローカルの仮キー。アップロード成功時はサーバー採番のキーで上書きする
      const localVideoKey = `session_${sessionId}_${new Date().getTime()}.mp4`;
      if (isDevEnvironment()) console.log("S3 upload start:", localVideoKey, "size:", Math.round(blob.size / 1024 / 1024 * 100) / 100, "MB");

      // マルチパートアップロードでS3に保存する
      // ファイルサイズに関わらずマルチパート方式に統一しており、
      // 長時間セッションの大容量動画（200MB超）でもS3のサイズ制限に達しない
      // アップロード成功時はサーバー採番のキー（videos/{sessionId}/...）を採用する
      let resultVideoKey = localVideoKey;
      try {
        resultVideoKey = await uploadWithMultipart(blob, sessionId, localVideoKey);
      } catch (uploadError) {
        // アップロード失敗は利用者に明示し、待機側（ConversationPage）が
        // 90秒のタイムアウトを待たずに進めるよう通知する
        reportRecordingFailure("recording.uploadError", uploadError);
        // エラーが発生してもvideoKeyは渡して処理を続行
      }

      if (isDevEnvironment()) console.log("Recording data saved:", resultVideoKey);

      // コールバックを呼び出し（エラーが発生してもvideoKeyは渡す）
      // 成功時はサーバー採番のキー、失敗時はローカル仮キーを渡す
      if (onRecordingComplete) {
        onRecordingComplete(resultVideoKey);
      }
    } catch (err) {
      reportRecordingFailure("recording.recordingDataProcessingFailed", err);
    }
  };

  // 明示的な録画停止のためのメソッドを外部に公開
  useImperativeHandle(ref, () => ({
    forceStopRecording: async () => {
      if (isDevEnvironment()) console.log("VideoRecorder: forceStopRecording called");
      return new Promise<void>((resolve) => {
        if (isRecording && mediaRecorderRef.current) {
          if (isDevEnvironment()) console.log("VideoRecorder: Recording in progress, stopping");

          // 録画停止完了を待つためのイベントリスナーを設定
          const handleStop = () => {
            if (isDevEnvironment()) console.log("VideoRecorder: Recording stopped");
            if (mediaRecorderRef.current) {
              mediaRecorderRef.current.removeEventListener('stop', handleStop);
            }
            resolve();
          };

          mediaRecorderRef.current.addEventListener('stop', handleStop);
          stopRecording();
        } else {
          // 録画が一度も開始されていない状態で停止が要求された場合は、
          // 「正常に停止した」ように見せず失敗として明示する。
          // （従来はここで黙って resolve していたため、録画されていないことに気づけなかった）
          // 停止要求時点では既に isActive=false になっているため、
          // 「このセッションで録画すべきだったか」は wasActiveRef で判定する。
          if (wasActiveRef.current && !hasStartedRecordingRef.current) {
            reportRecordingFailure("recording.notStartedError");
          } else if (isDevEnvironment()) {
            console.log("VideoRecorder: Not recording, skipping stop");
          }
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
