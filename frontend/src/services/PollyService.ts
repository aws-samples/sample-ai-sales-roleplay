import i18next from "i18next";
import { getPollySettingsForLanguage } from "../i18n/utils/languageUtils";
import { ApiService } from "./ApiService";

/**
 * Amazon Pollyサービス
 * テキストの音声合成を行う
 */
export class PollyService {
  private static instance: PollyService;

  // デフォルトの読み上げ速度（1.0が標準、1.0より大きいと速く、小さいと遅い）
  private defaultSpeechRate: number = 1.25;

  /**
   * コンストラクタ - シングルトンパターン
   */
  private constructor() {
    console.log("=== Pollyサービス初期化 ===");
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): PollyService {
    if (!PollyService.instance) {
      PollyService.instance = new PollyService();
    }
    return PollyService.instance;
  }

  /**
   * 読み上げ速度を設定
   * @param rate 速度（1.0が標準、0.5～2.0の範囲で設定可能）
   */
  public setSpeechRate(rate: number): void {
    // 0.5～2.0の範囲に制限
    this.defaultSpeechRate = Math.max(0.5, Math.min(2.0, rate));
    console.log(`読み上げ速度を設定: ${this.defaultSpeechRate}`);
  }

  /**
   * 現在の読み上げ速度を取得
   * @returns 現在の読み上げ速度
   */
  public getSpeechRate(): number {
    return this.defaultSpeechRate;
  }

  /**
   * テキストをSSMLに変換する（読み上げ速度の調整を含む）
   * @param text 元のテキスト
   * @param rate 読み上げ速度（指定がない場合はデフォルト値を使用）
   * @returns SSMLフォーマットのテキスト
   */
  public textToSSML(text: string, rate?: number): string {
    // 実際に使用する速度（指定がない場合はデフォルト値）
    const speechRate = rate || this.defaultSpeechRate;

    // テキストをエスケープ（XMLの特殊文字を置換）
    const escapedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    // SSMLタグでラップ
    return `<speak><prosody rate="${speechRate}">${escapedText}</prosody></speak>`;
  }

  /**
   * テキストを音声に変換する（SSML形式の速度調整付き）
   * @param text 音声に変換するテキスト
   * @param voiceId 音声のタイプ（オプション: 指定がない場合は現在の言語に基づいて自動選択）
   * @param rate 読み上げ速度（オプション: 指定がない場合はデフォルト値を使用）
   * @returns 音声のURL
   */
  public async synthesizeSpeech(
    text: string,
    voiceId?: string,
    rate?: number,
  ): Promise<string> {
    try {
      console.log(`=== Polly音声合成開始 ===`);
      console.log(
        `テキストを音声に変換: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`,
      );

      // SSMLに変換（読み上げ速度の調整を含む）
      const ssmlText = this.textToSSML(text, rate);

      return this.synthesizeSpeechWithSSML(ssmlText, voiceId);
    } catch (error) {
      console.error("=== Polly音声合成エラー ===");
      console.error("エラー詳細:", error);
      console.error("エラータイプ:", typeof error);
      console.error(
        "エラースタック:",
        error instanceof Error ? error.stack : "スタックなし",
      );
      throw error;
    }
  }

  /**
   * SSMLタグ付きテキストを音声に変換する
   * @param ssmlText SSMLタグを含むテキスト
   * @param voiceId 音声のタイプ（オプション: 指定がない場合は現在の言語に基づいて自動選択）
   * @returns 音声のURL
   */
  public async synthesizeSpeechWithSSML(
    ssmlText: string,
    voiceId?: string,
  ): Promise<string> {
    try {
      console.log(`=== Polly SSML音声合成開始 ===`);
      console.log(
        `SSMLテキストを音声に変換: ${ssmlText.substring(0, 50)}${ssmlText.length > 50 ? "..." : ""}`,
      );

      // 現在の言語から適切な設定を取得
      const currentLanguage = i18next.language.split("-")[0] || "ja";
      const pollySettings = getPollySettingsForLanguage(currentLanguage);
      const finalVoiceId = voiceId || pollySettings.voiceId;

      console.log(`使用言語: ${currentLanguage}, 音声ID: ${finalVoiceId}`);

      // リクエストボディを作成
      const requestBody = {
        text: ssmlText,
        voiceId: finalVoiceId,
        engine: "neural",
        languageCode: pollySettings.languageCode,
        textType: "ssml" as const,
      };

      console.log("Polly API リクエストボディ:", requestBody);

      // ApiServiceのインスタンスを取得してAPI呼び出し
      const apiService = ApiService.getInstance();
      const response = await apiService.callPollyAPI(requestBody);

      console.log("Polly SSML音声合成完了:", response);

      if (!response.success || !response.audioUrl) {
        throw new Error(
          response.error || response.message || "音声URLの取得に失敗しました",
        );
      }

      return response.audioUrl;
    } catch (error) {
      console.error("=== Polly SSML音声合成エラー ===");
      console.error("エラー詳細:", error);
      console.error("エラータイプ:", typeof error);
      console.error(
        "エラースタック:",
        error instanceof Error ? error.stack : "スタックなし",
      );
      throw error;
    }
  }

  /**
   * テキストを音声に変換し、visemeデータも取得する（Phase 2）
   * @param text 音声に変換するテキスト
   * @param voiceId 音声のタイプ（オプション）
   * @param rate 読み上げ速度（オプション）
   * @returns 音声URLとvisemeデータ
   */
  public async synthesizeSpeechWithViseme(
    text: string,
    voiceId?: string,
    rate?: number,
  ): Promise<{ audioUrl: string; visemes?: Array<{ time: number; type: string; value: string }> }> {
    try {
      const ssmlText = this.textToSSML(text, rate);
      const currentLanguage = i18next.language.split("-")[0] || "ja";
      const pollySettings = getPollySettingsForLanguage(currentLanguage);
      const finalVoiceId = voiceId || pollySettings.voiceId;

      const requestBody = {
        text: ssmlText,
        voiceId: finalVoiceId,
        engine: "neural",
        languageCode: pollySettings.languageCode,
        textType: "ssml" as const,
      };

      const apiService = ApiService.getInstance();
      const response = await apiService.callPollyAPI(requestBody);

      if (!response.success || !response.audioUrl) {
        throw new Error(response.error || response.message || "音声URLの取得に失敗しました");
      }

      return {
        audioUrl: response.audioUrl,
        visemes: response.visemes,
      };
    } catch (error) {
      console.error("Polly音声合成（viseme付き）エラー:", error);
      throw error;
    }
  }

  /**
   * テキストを指定された速度で音声に変換する（便利メソッド）
   * @param text 音声に変換するテキスト
   * @param rate 読み上げ速度（1.0が標準、0.5～2.0の範囲）
   * @param voiceId 音声のタイプ（オプション）
   * @returns 音声のURL
   */
  public async speakWithRate(
    text: string,
    rate: number,
    voiceId?: string,
  ): Promise<string> {
    return this.synthesizeSpeech(text, voiceId, rate);
  }
}
