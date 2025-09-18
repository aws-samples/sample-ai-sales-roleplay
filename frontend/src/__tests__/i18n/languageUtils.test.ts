import {
  isRTLLanguage,
  detectBrowserLanguage,
  getPollySettingsForLanguage,
  getTranscribeLanguage,
} from "../../i18n/utils/languageUtils";

describe("languageUtils", () => {
  describe("isRTLLanguage", () => {
    it("RTL言語を正しく識別する", () => {
      expect(isRTLLanguage("ar")).toBe(true); // アラビア語
      expect(isRTLLanguage("he")).toBe(true); // ヘブライ語
      expect(isRTLLanguage("fa")).toBe(true); // ペルシャ語
    });

    it("LTR言語は識別されない", () => {
      expect(isRTLLanguage("en")).toBe(false); // 英語
      expect(isRTLLanguage("ja")).toBe(false); // 日本語
      expect(isRTLLanguage("fr")).toBe(false); // フランス語
    });
  });

  describe("detectBrowserLanguage", () => {
    beforeEach(() => {
      // ブラウザの言語設定をモック
      Object.defineProperty(navigator, "language", {
        value: "ja-JP",
        configurable: true,
      });
    });

    it("サポートされている言語を検出する", () => {
      expect(detectBrowserLanguage()).toBe("ja");

      // ブラウザ言語を英語に変更
      Object.defineProperty(navigator, "language", {
        value: "en-US",
        configurable: true,
      });

      expect(detectBrowserLanguage()).toBe("en");
    });

    it("サポートされていない言語の場合デフォルトを返す", () => {
      // サポートされていない言語に変更
      Object.defineProperty(navigator, "language", {
        value: "fr-FR",
        configurable: true,
      });

      expect(detectBrowserLanguage()).toBe("ja"); // デフォルト言語
    });
  });

  describe("getPollySettingsForLanguage", () => {
    it("日本語の正しいPolly設定を返す", () => {
      const settings = getPollySettingsForLanguage("ja");

      expect(settings).toEqual({
        voiceId: "Takumi",
        languageCode: "ja-JP",
      });
    });

    it("英語の正しいPolly設定を返す", () => {
      const settings = getPollySettingsForLanguage("en");

      expect(settings).toEqual({
        voiceId: "Matthew",
        languageCode: "en-US",
      });
    });

    it("サポートされていない言語の場合デフォルト設定を返す", () => {
      const settings = getPollySettingsForLanguage("xyz");

      expect(settings).toEqual({
        voiceId: "Takumi",
        languageCode: "ja-JP",
      });
    });
  });

  describe("getTranscribeLanguage", () => {
    it("日本語の正しいTranscribe言語コードを返す", () => {
      expect(getTranscribeLanguage("ja")).toBe("ja-JP");
    });

    it("英語の正しいTranscribe言語コードを返す", () => {
      expect(getTranscribeLanguage("en")).toBe("en-US");
    });

    it("サポートされていない言語の場合デフォルトを返す", () => {
      expect(getTranscribeLanguage("xyz")).toBe("ja-JP");
    });
  });
});
