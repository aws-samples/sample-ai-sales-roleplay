/**
 * 無音検出処理クラス
 * 
 * 音声ストリームの無音区間を検出し、一定時間以上の無音が続いた場合に
 * イベントを発火するためのヘルパークラスです。
 * Amazon Transcribeストリーミング統合において、発話の終了を自動的に検出するために使用します。
 */

export interface SilenceDetectorOptions {
  /** 無音判定の閾値 (0.0-1.0) - デフォルト: 0.05 */
  threshold?: number;
  
  /** 無音判定までの時間 (ミリ秒) - デフォルト: 1500ms */
  timeoutMs?: number;
}

export class SilenceDetector {
  private readonly threshold: number;
  private readonly timeoutMs: number;
  private lastSoundTimestamp: number = Date.now();
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private onSilenceDetectedCallback: (() => void) | null = null;
  private isActive: boolean = false;
  
  /**
   * コンストラクタ
   * @param options 設定オプション
   */
  constructor(options?: SilenceDetectorOptions) {
    this.threshold = options?.threshold ?? 0.05;
    this.timeoutMs = options?.timeoutMs ?? 1500;
  }
  
  /**
   * 無音検出処理を開始
   * @param onSilenceDetected 無音検出時のコールバック関数
   */
  public start(onSilenceDetected: () => void): void {
    this.onSilenceDetectedCallback = onSilenceDetected;
    this.isActive = true;
    this.lastSoundTimestamp = Date.now();
    this.resetTimer();
  }
  
  /**
   * 無音検出処理を停止
   */
  public stop(): void {
    this.isActive = false;
    this.clearTimer();
    this.onSilenceDetectedCallback = null;
  }
  
  /**
   * 音量レベルを処理し、閾値を下回る場合は無音として判定
   * @param soundLevel 音量レベル (0.0-1.0)
   */
  public processSoundLevel(soundLevel: number): void {
    if (!this.isActive) return;
    
    if (soundLevel > this.threshold) {
      // 音声を検出
      this.lastSoundTimestamp = Date.now();
      this.resetTimer();
    }
  }
  
  /**
   * 無音タイマーをリセット
   */
  public resetTimer(): void {
    this.clearTimer();
    
    this.silenceTimer = setTimeout(() => {
      const silenceTime = Date.now() - this.lastSoundTimestamp;
      if (silenceTime >= this.timeoutMs && this.isActive && this.onSilenceDetectedCallback) {
        console.log(`${silenceTime}ms間の無音を検出しました`);
        this.onSilenceDetectedCallback();
      }
    }, this.timeoutMs);
  }
  
  /**
   * タイマーをクリア
   */
  private clearTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}