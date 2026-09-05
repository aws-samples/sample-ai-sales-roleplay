import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import VideoRecorder from "../../components/recording/v2/VideoRecorder";
import type { VideoRecorderRef } from "../../types/components";

// t() はキーをそのまま返し、通知メッセージのキーを検証できるようにする
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// import.meta は CJS の Jest から参照できないため、env ユーティリティを差し替える
jest.mock("../../utils/env", () => ({
  isDevEnvironment: () => false,
}));

/** getUserMedia の解決タイミングをテストから制御するためのヘルパー */
const createDeferredStream = () => {
  let resolve!: (stream: MediaStream) => void;
  const promise = new Promise<MediaStream>((res) => {
    resolve = res;
  });
  const stream = {
    getTracks: () => [{ stop: jest.fn() }],
  } as unknown as MediaStream;
  return { promise, resolve: () => resolve(stream), stream };
};

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = jest.fn(() => true);

  public state = "inactive";
  public ondataavailable: ((event: unknown) => void) | null = null;
  public onstop: (() => void) | null = null;
  public start = jest.fn(() => {
    this.state = "recording";
  });
  public stop = jest.fn(() => {
    this.state = "inactive";
    if (this.onstop) this.onstop();
  });
  public addEventListener = jest.fn();
  public removeEventListener = jest.fn();

  constructor(
    public stream: MediaStream,
    public options?: MediaRecorderOptions,
  ) {
    MockMediaRecorder.instances.push(this);
  }
}

describe("VideoRecorder", () => {
  let deferred: ReturnType<typeof createDeferredStream>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    MockMediaRecorder.instances = [];
    deferred = createDeferredStream();

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: jest.fn(() => deferred.promise) },
    });
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
      MockMediaRecorder;

    // 失敗通知は本番でも console.error に残す仕様のため、テスト出力を汚さないよう抑制する
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it("isActive が true になった後にカメラ初期化が完了しても録画を開始する（Issue #100 の競合状態）", async () => {
    // isActive が最初から true = カメラ取得が終わる前にセッションが始まったケース
    render(<VideoRecorder sessionId="session-1" isActive={true} />);

    // カメラ初期化前は録画が始まらない
    expect(MockMediaRecorder.instances).toHaveLength(0);

    // カメラ取得が完了した時点で録画が開始されること
    await act(async () => {
      deferred.resolve();
    });

    await waitFor(() => {
      expect(MockMediaRecorder.instances).toHaveLength(1);
    });
    expect(MockMediaRecorder.instances[0].start).toHaveBeenCalledWith(100);
  });

  it("録画開始時に onRecordingStateChange('recording') を通知する", async () => {
    const onRecordingStateChange = jest.fn();
    render(
      <VideoRecorder
        sessionId="session-1"
        isActive={true}
        onRecordingStateChange={onRecordingStateChange}
      />,
    );

    await act(async () => {
      deferred.resolve();
    });

    await waitFor(() => {
      expect(onRecordingStateChange).toHaveBeenCalledWith("recording");
    });
  });

  it("カメラ取得成功時に onCameraInitialized(true) を通知する", async () => {
    const onCameraInitialized = jest.fn();
    render(
      <VideoRecorder
        sessionId="session-1"
        isActive={false}
        onCameraInitialized={onCameraInitialized}
      />,
    );

    await act(async () => {
      deferred.resolve();
    });

    await waitFor(() => {
      expect(onCameraInitialized).toHaveBeenCalledWith(true);
    });
  });

  it("録画が一度も開始されないままセッションが終了した場合は失敗として通知する", async () => {
    const onError = jest.fn();
    const onRecordingStateChange = jest.fn();
    const recordingFailedListener = jest.fn();
    window.addEventListener("recordingFailed", recordingFailedListener);

    const ref = React.createRef<VideoRecorderRef>();
    render(
      <VideoRecorder
        ref={ref}
        sessionId="session-1"
        isActive={true}
        onError={onError}
        onRecordingStateChange={onRecordingStateChange}
      />,
    );

    // カメラ取得は完了させない = 録画は開始されない
    await act(async () => {
      await ref.current?.forceStopRecording();
    });

    expect(onError).toHaveBeenCalledWith("recording.notStartedError");
    expect(onRecordingStateChange).toHaveBeenCalledWith("failed");
    expect(recordingFailedListener).toHaveBeenCalled();

    window.removeEventListener("recordingFailed", recordingFailedListener);
  });

  it("録画中にセッションが終了した場合は失敗として通知しない", async () => {
    const onError = jest.fn();
    const ref = React.createRef<VideoRecorderRef>();
    render(
      <VideoRecorder
        ref={ref}
        sessionId="session-1"
        isActive={true}
        onError={onError}
      />,
    );

    await act(async () => {
      deferred.resolve();
    });
    await waitFor(() => {
      expect(MockMediaRecorder.instances).toHaveLength(1);
    });

    // 録画中は addEventListener('stop') 経由で停止完了を待つため、
    // 停止コールバックを即時に呼び出して Promise を解決させる
    const recorder = MockMediaRecorder.instances[0];
    recorder.addEventListener.mockImplementation(
      (event: string, handler: () => void) => {
        if (event === "stop") handler();
      },
    );

    await act(async () => {
      await ref.current?.forceStopRecording();
    });

    expect(onError).not.toHaveBeenCalledWith("recording.notStartedError");
  });
});
