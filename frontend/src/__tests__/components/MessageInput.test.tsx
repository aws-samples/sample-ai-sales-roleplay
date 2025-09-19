import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MessageInput from "../../components/conversation/MessageInput";

// モック
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: { [key: string]: string } = {
        "conversation.input.placeholder": "メッセージを入力してください...",
        "conversation.input.send": "メッセージを送信",
        "conversation.input.startVoice": "音声入力を開始",
        "conversation.input.stopVoice": "音声入力を停止",
        "conversation.input.continueVoice": "音声入力を継続（既存のテキストは保持されます）",
      };
      return translations[key] || key;
    },
  }),
}));

// SpeechRecognitionFeedbackをモック
jest.mock(
  "../../components/SpeechRecognitionFeedback",
  () => (props: Record<string, unknown>) => (
    <div
      data-testid="speech-recognition-feedback"
      data-props={JSON.stringify(props)}
    >
      Speech Recognition Feedback
    </div>
  ),
);

describe("MessageInput", () => {
  const defaultProps = {
    userInput: "",
    setUserInput: jest.fn(),
    sendMessage: jest.fn(),
    isProcessing: false,
    isListening: false,
    speechRecognitionError: null,
    startSpeechRecognition: jest.fn(),
    switchToTextInput: jest.fn(),
    handleKeyDown: jest.fn(),
    sessionStarted: true,
    sessionEnded: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("セッションが開始されていない場合は表示されない", () => {
    const { container } = render(
      <MessageInput {...defaultProps} sessionStarted={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("セッションが終了している場合は表示されない", () => {
    const { container } = render(
      <MessageInput {...defaultProps} sessionEnded={true} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("テキスト入力が正しく機能する", () => {
    render(<MessageInput {...defaultProps} />);

    const textField =
      screen.getByPlaceholderText("メッセージを入力してください...");
    fireEvent.change(textField, { target: { value: "テストメッセージ" } });

    expect(defaultProps.setUserInput).toHaveBeenCalledWith("テストメッセージ");
  });

  test("送信ボタンのクリックでメッセージ送信が呼ばれる", () => {
    render(<MessageInput {...defaultProps} userInput="テストメッセージ" />);

    const sendButton = screen.getByRole("button", { name: "メッセージを送信" });
    fireEvent.click(sendButton);

    expect(defaultProps.sendMessage).toHaveBeenCalledTimes(1);
  });

  test("空のメッセージでは送信ボタンが無効化される", () => {
    render(<MessageInput {...defaultProps} userInput="" />);

    const sendButton = screen.getByRole("button", { name: "メッセージを送信" });
    expect(sendButton).toBeDisabled();
  });

  test("音声入力ボタンのクリックで音声認識が開始される", () => {
    render(<MessageInput {...defaultProps} />);

    const micButton = screen.getByRole("button", { name: "音声入力を開始" });
    fireEvent.click(micButton);

    expect(defaultProps.startSpeechRecognition).toHaveBeenCalledTimes(1);
  });

  test("処理中は入力フィールドが無効化される", () => {
    render(<MessageInput {...defaultProps} isProcessing={true} />);

    const textField =
      screen.getByPlaceholderText("メッセージを入力してください...");
    expect(textField).toBeDisabled();

    const sendButton = screen.getByRole("button", { name: "メッセージを送信" });
    expect(sendButton).toBeDisabled();

    const micButton = screen.getByRole("button", { name: "音声入力を開始" });
    expect(micButton).toBeDisabled();
  });

  test("リスニング中は入力フィールドが無効化される", () => {
    render(<MessageInput {...defaultProps} isListening={true} />);

    const textField =
      screen.getByPlaceholderText("メッセージを入力してください...");
    expect(textField).toBeDisabled();

    const sendButton = screen.getByRole("button", { name: "メッセージを送信" });
    expect(sendButton).toBeDisabled();

    // isListening=trueの時、ボタンのラベルは「音声入力を停止」になり、停止ボタンとして有効
    const micButton = screen.getByRole("button", { name: "音声入力を停止" });
    expect(micButton).toBeEnabled();
  });

  test("キーボードイベント（Enter）が適切に処理される", () => {
    render(<MessageInput {...defaultProps} userInput="テストメッセージ" />);

    const textField =
      screen.getByPlaceholderText("メッセージを入力してください...");
    fireEvent.keyDown(textField, { key: "Enter" });

    expect(defaultProps.handleKeyDown).toHaveBeenCalled();
  });

  test("SpeechRecognitionFeedbackコンポーネントに正しいプロパティが渡される", () => {
    render(
      <MessageInput
        {...defaultProps}
        isListening={true}
        speechRecognitionError="permission"
      />,
    );

    const feedbackComponent = screen.getByTestId("speech-recognition-feedback");
    const props = JSON.parse(
      feedbackComponent.getAttribute("data-props") || "{}",
    );

    expect(props.isListening).toBe(true);
    expect(props.isProcessing).toBe(false);
    expect(props.errorState).toBe("permission");
  });
});
