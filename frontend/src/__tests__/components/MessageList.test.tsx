import React from "react";
import { render, screen } from "@testing-library/react";
import MessageList from "../../components/conversation/MessageList";
import type { Scenario, Metrics } from "../../types/index";

// i18nモック（キーをそのまま返すことで分岐を識別しやすくする）
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: { [key: string]: string } = {
        "conversation.startQuestion": "商談を開始しますか？",
        "conversation.startButton": "商談開始",
        "conversation.startButtonNoRecording": "商談開始（録画なし）",
        "conversation.cameraInitializing": "カメラ初期化中...",
        "conversation.cameraInitializingMessage": "カメラを初期化しています...",
        "conversation.cameraAccessFailed": "カメラへのアクセスに失敗しました",
        "conversation.recordingDisabledMessage": "ビデオ録画はオフです",
      };
      return translations[key] || key;
    },
  }),
}));

// dialogueEngineのgetSessionEndReasonをモック（セッション終了表示に使用）
jest.mock("../../utils/dialogueEngine", () => ({
  getSessionEndReason: () => "セッション終了理由",
}));

describe("MessageList - ビデオ録画オン/オフによる開始ボタンの挙動", () => {
  const mockScenario: Scenario = {
    id: "test-scenario",
    title: "テストシナリオ",
    description: "テスト用シナリオの説明",
    difficulty: "normal",
    industry: "IT",
    npc: {
      id: "npc-1",
      name: "テスト太郎",
      role: "部長",
      company: "テスト株式会社",
      personality: [],
      avatar: "👤",
      description: "",
    },
    initialMetrics: {
      angerLevel: 1,
      trustLevel: 1,
      progressLevel: 1,
    },
    goals: [],
  };

  const mockMetrics: Metrics = {
    angerLevel: 1,
    trustLevel: 1,
    progressLevel: 1,
  };

  const defaultProps = {
    messages: [],
    isProcessing: false,
    sessionStarted: false,
    sessionEnded: false,
    currentMetrics: mockMetrics,
    scenario: mockScenario,
    onStartConversation: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("録画オン時（videoRecordingEnabled = true）", () => {
    test("カメラ未初期化かつエラーなしの場合、開始ボタンは無効でカメラ初期化中ラベルになる", () => {
      render(
        <MessageList
          {...defaultProps}
          videoRecordingEnabled={true}
          isCameraInitialized={false}
          cameraError={false}
        />,
      );

      const button = screen.getByTestId("start-conversation-button");
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("カメラ初期化中...");
    });

    test("カメラ初期化完了の場合、開始ボタンは有効で通常の商談開始ラベルになる", () => {
      render(
        <MessageList
          {...defaultProps}
          videoRecordingEnabled={true}
          isCameraInitialized={true}
          cameraError={false}
        />,
      );

      const button = screen.getByTestId("start-conversation-button");
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent("商談開始");
    });

    test("カメラエラーの場合、開始ボタンは有効で録画なしラベルになる", () => {
      render(
        <MessageList
          {...defaultProps}
          videoRecordingEnabled={true}
          isCameraInitialized={false}
          cameraError={true}
        />,
      );

      const button = screen.getByTestId("start-conversation-button");
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent("商談開始（録画なし）");
    });
  });

  describe("録画オフ時（videoRecordingEnabled = false）", () => {
    test("カメラ初期化状態に関わらず開始ボタンは即有効で録画なしラベルになる", () => {
      render(
        <MessageList
          {...defaultProps}
          videoRecordingEnabled={false}
          isCameraInitialized={false}
          cameraError={false}
        />,
      );

      const button = screen.getByTestId("start-conversation-button");
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent("商談開始（録画なし）");
    });

    test("録画オフを示すメッセージが表示される", () => {
      render(
        <MessageList
          {...defaultProps}
          videoRecordingEnabled={false}
        />,
      );

      expect(screen.getByText("ビデオ録画はオフです")).toBeInTheDocument();
    });

    test("録画オフ時はカメラ初期化中メッセージを表示しない", () => {
      render(
        <MessageList
          {...defaultProps}
          videoRecordingEnabled={false}
          isCameraInitialized={false}
          cameraError={false}
        />,
      );

      expect(
        screen.queryByText("カメラを初期化しています..."),
      ).not.toBeInTheDocument();
    });
  });

  describe("videoRecordingEnabled未指定（デフォルト = 録画オン）", () => {
    test("デフォルトでは録画オンとして扱われ、カメラ未初期化時はボタンが無効になる", () => {
      render(
        <MessageList
          {...defaultProps}
          isCameraInitialized={false}
          cameraError={false}
        />,
      );

      const button = screen.getByTestId("start-conversation-button");
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("カメラ初期化中...");
    });
  });
});
