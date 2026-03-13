/**
 * 言語コードとAmazon Polly用のlanguageCodeのマッピング
 */
const languageToPollyCodeMapping: Record<string, string> = {
  ja: "ja-JP",
  en: "en-US",
};

/**
 * 言語コードと表示名のマッピング
 */
export const languageNameMapping: Record<string, string> = {
  ja: "日本語",
  en: "English",
};

/**
 * サポートされている言語コードのリスト
 */
export const supportedLanguages = ["ja", "en"];

/**
 * 言語コードからAmazon Polly用のlanguageCodeを取得
 */
export const getPollyLanguageCode = (languageCode: string): string => {
  return languageToPollyCodeMapping[languageCode] || "ja-JP";
};
