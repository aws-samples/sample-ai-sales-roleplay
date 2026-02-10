import i18next from "i18next";
import { getPollyLanguageCode } from "../i18n/utils/languageUtils";
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
  private constructor() { }

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
    this.defaultSpeechRate = Math.max(0.5, Math.min(2.0, rate));
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
    const speechRate = rate || this.defaultSpeechRate;

    // テキストをエスケープ（XMLの特殊文字を置換）
    const escapedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    return `<speak><prosody rate="${speechRate}">${escapedText}</prosody></speak>`;
  }

  /**
   * テキストを音声に変換する（SSML形式の速度調整付き）
   * @param text 音声に変換するテキスト
   * @param voiceId 音声のタイプ（必須: シナリオのNPC設定から取得）
   * @param rate 読み上げ速度（オプション: 指定がない場合はデフォルト値を使用）
   * @returns 音声のURL
   */
  public async synthesizeSpeech(
    text: string,
    voiceId: string,
    rate?: number,
  ): Promise<string> {
    const ssmlText = this.textToSSML(text, rate);
    return this.synthesizeSpeechWithSSML(ssmlText, voiceId);
  }

  /**
   * SSMLタグ付きテキストを音声に変換する
   * @param ssmlText SSMLタグを含むテキスト
   * @param voiceId 音声のタイプ（必須: シナリオのNPC設定から取得）
   * @returns 音声のURL
   */
  public async synthesizeSpeechWithSSML(
    ssmlText: string,
    voiceId: string,
  ): Promise<string> {
    const currentLanguage = i18next.language.split("-")[0] || "ja";
    const languageCode = getPollyLanguageCode(currentLanguage);

    const requestBody = {
      text: ssmlText,
      voiceId,
      languageCode,
      textType: "ssml" as const,
    };

    const apiService = ApiService.getInstance();
    const response = await apiService.callPollyAPI(requestBody);

    if (!response.success || !response.audioUrl) {
      throw new Error(
        response.error || response.message || "音声URLの取得に失敗しました",
      );
    }

    return response.audioUrl;
  }

  /**
   * テキストを音声に変換し、visemeデータも取得する
   * @param text 音声に変換するテキスト
   * @param voiceId 音声のタイプ（必須）
   * @param rate 読み上げ速度（オプション）
   * @returns 音声URLとvisemeデータ
   */
  public async synthesizeSpeechWithViseme(
    text: string,
    voiceId: string,
    rate?: number,
  ): Promise<{ audioUrl: string; visemes?: Array<{ time: number; type: string; value: string }> }> {
    const ssmlText = this.textToSSML(text, rate);
    const currentLanguage = i18next.language.split("-")[0] || "ja";
    const languageCode = getPollyLanguageCode(currentLanguage);

    const requestBody = {
      text: ssmlText,
      voiceId,
      languageCode,
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
  }
}
