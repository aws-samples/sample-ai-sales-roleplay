import {
  languageNameMapping,
  supportedLanguages,
  getPollyLanguageCode,
} from "../../i18n/utils/languageUtils";

describe("languageUtils", () => {
  describe("languageNameMapping", () => {
    it("日本語の表示名を返す", () => {
      expect(languageNameMapping["ja"]).toBe("日本語");
    });

    it("英語の表示名を返す", () => {
      expect(languageNameMapping["en"]).toBe("English");
    });
  });

  describe("supportedLanguages", () => {
    it("サポートされている言語を含む", () => {
      expect(supportedLanguages).toContain("ja");
      expect(supportedLanguages).toContain("en");
    });
  });

  describe("getPollyLanguageCode", () => {
    it("日本語の正しいPolly言語コードを返す", () => {
      expect(getPollyLanguageCode("ja")).toBe("ja-JP");
    });

    it("英語の正しいPolly言語コードを返す", () => {
      expect(getPollyLanguageCode("en")).toBe("en-US");
    });

    it("サポートされていない言語の場合デフォルトを返す", () => {
      expect(getPollyLanguageCode("xyz")).toBe("ja-JP");
    });
  });
});
