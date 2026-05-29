import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SessionSettingsPanel from "../../components/conversation/SessionSettingsPanel";

// i18nモック（キーをそのまま日本語訳に変換して返す）
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: { [key: string]: string } = {
        "conversation.settings.recordingOn": "ビデオ録画 ON",
        "conversation.settings.recordingOff": "ビデオ録画 OFF",
        "conversation.settings.recordingNote":
          "※ 録画をオフにすると、カメラを使用せず、動画分析機能は利用できません",
        "conversation.settings.recordingLockedNote":
          "※ 録画設定は商談開始前のみ変更できます",
        "conversation.audioSettings.outputOn": "音声出力 ON",
        "conversation.audioSettings.outputOff": "音声出力 OFF",
        "conversation.audioSettings.volume": `音量: ${options?.volume ?? ""}%`,
        "conversation.audioSettings.speechRate": `読み上げ速度: ${options?.rate ?? ""}x`,
        "conversation.audioSettings.npcResponseNote":
          "※ NPCの応答が音声で再生されます",
      };
      return translations[key] || key;
    },
  }),
}));

/**
 * 録画トグルスイッチを取得（アクセシブル名で特定）
 * MUIのSwitchは role="switch" としてレンダリングされ、ラベルテキストから
 * アクセシブル名が算出される。日英のON/OFFラベルに対応。
 */
const getRecordingToggle = () =>
  screen.getByRole("switch", {
    name: /ビデオ録画 (ON|OFF)|Video Recording (ON|OFF)/,
  });

const queryRecordingToggle = () =>
  screen.queryByRole("switch", {
    name: /ビデオ録画 (ON|OFF)|Video Recording (ON|OFF)/,
  });

describe("SessionSettingsPanel - ビデオ録画トグル", () => {
  const defaultProps = {
    audioEnabled: true,
    setAudioEnabled: jest.fn(),
    audioVolume: 80,
    setAudioVolume: jest.fn(),
    speechRate: 1.0,
    setSpeechRate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("setVideoRecordingEnabledが渡された場合、録画トグルが表示される", () => {
    render(
      <SessionSettingsPanel
        {...defaultProps}
        videoRecordingEnabled={true}
        setVideoRecordingEnabled={jest.fn()}
      />,
    );

    expect(getRecordingToggle()).toBeInTheDocument();
  });

  test("setVideoRecordingEnabledが渡されない場合、録画トグルは表示されない", () => {
    render(<SessionSettingsPanel {...defaultProps} />);

    expect(queryRecordingToggle()).not.toBeInTheDocument();
  });

  test("録画オン時はトグルがチェック済みになる", () => {
    render(
      <SessionSettingsPanel
        {...defaultProps}
        videoRecordingEnabled={true}
        setVideoRecordingEnabled={jest.fn()}
      />,
    );

    expect(getRecordingToggle()).toBeChecked();
  });

  test("録画オフ時はトグルが未チェックになる", () => {
    render(
      <SessionSettingsPanel
        {...defaultProps}
        videoRecordingEnabled={false}
        setVideoRecordingEnabled={jest.fn()}
      />,
    );

    expect(getRecordingToggle()).not.toBeChecked();
  });

  test("トグル操作でsetVideoRecordingEnabledが呼ばれる", () => {
    const setVideoRecordingEnabled = jest.fn();
    render(
      <SessionSettingsPanel
        {...defaultProps}
        videoRecordingEnabled={true}
        setVideoRecordingEnabled={setVideoRecordingEnabled}
      />,
    );

    fireEvent.click(getRecordingToggle());
    expect(setVideoRecordingEnabled).toHaveBeenCalledWith(false);
  });

  test("recordingSettingLocked=trueの場合、トグルは無効化される", () => {
    render(
      <SessionSettingsPanel
        {...defaultProps}
        videoRecordingEnabled={true}
        setVideoRecordingEnabled={jest.fn()}
        recordingSettingLocked={true}
      />,
    );

    expect(getRecordingToggle()).toBeDisabled();
  });

  test("recordingSettingLocked=falseの場合、トグルは有効", () => {
    render(
      <SessionSettingsPanel
        {...defaultProps}
        videoRecordingEnabled={true}
        setVideoRecordingEnabled={jest.fn()}
        recordingSettingLocked={false}
      />,
    );

    expect(getRecordingToggle()).toBeEnabled();
  });

  test("ロック時はロック用の注意書きが表示される", () => {
    render(
      <SessionSettingsPanel
        {...defaultProps}
        videoRecordingEnabled={true}
        setVideoRecordingEnabled={jest.fn()}
        recordingSettingLocked={true}
      />,
    );

    expect(
      screen.getByText("※ 録画設定は商談開始前のみ変更できます"),
    ).toBeInTheDocument();
  });

  test("非ロック時は通常の注意書きが表示される", () => {
    render(
      <SessionSettingsPanel
        {...defaultProps}
        videoRecordingEnabled={true}
        setVideoRecordingEnabled={jest.fn()}
        recordingSettingLocked={false}
      />,
    );

    expect(
      screen.getByText(
        "※ 録画をオフにすると、カメラを使用せず、動画分析機能は利用できません",
      ),
    ).toBeInTheDocument();
  });
});
