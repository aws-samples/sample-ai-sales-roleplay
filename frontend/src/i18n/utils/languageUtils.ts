/**
 * 言語コードとPollyの音声IDのマッピング
 */
export const languageToVoiceMapping: Record<string, string> = {
  ja: "Takumi", // 日本語 - 男性
  en: "Matthew", // 英語 - 男性
};

/**
 * 言語コードとAmazon Polly用のlanguageCodeのマッピング
 */
export const languageToPollyCodeMapping: Record<string, string> = {
  ja: "ja-JP",
  en: "en-US",
};

/**
 * 言語コードとSpeech Recognition APIのlanguageCodeのマッピング
 */
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
 * 現在の言語がRTL（右から左）言語かどうかを判定
 * 将来的にアラビア語やヘブライ語などのRTL言語をサポートする場合に使用
 */
export const isRTLLanguage = (languageCode: string): boolean => {
  const rtlLanguages = ["ar", "he", "fa", "ur"];
  return rtlLanguages.includes(languageCode);
};

/**
 * ブラウザの言語設定からサポートされている言語を検出
 * サポートされていない場合はデフォルト言語（日本語）を返す
 */
export const detectBrowserLanguage = (): string => {
  const browserLang = navigator.language.split("-")[0];
  return supportedLanguages.includes(browserLang) ? browserLang : "ja";
};

/**
 * 言語コードからAmazon Polly用の設定情報を取得
 */
export const getPollySettingsForLanguage = (languageCode: string) => {
  return {
    voiceId: languageToVoiceMapping[languageCode] || "Takumi",
    languageCode: languageToPollyCodeMapping[languageCode] || "ja-JP",
  };
};

/**
 * 言語コードからSpeech Recognition用のlanguageCodeを取得
 */
// Transcribe用の言語コードマッピング
export const getTranscribeLanguage = (languageCode: string): string => {
  // Amazon Transcribeは言語コードが異なる形式
  const mapping: Record<string, string> = {
    ja: "ja-JP",
    en: "en-US",
  };
  return mapping[languageCode] || "ja-JP";
};
