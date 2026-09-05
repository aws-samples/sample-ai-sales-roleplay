/**
 * Amazon Transcribeストリーミング統合サービス（ブラウザ直接接続版）
 *
 * ブラウザから直接 Amazon Transcribe Streaming WebSocket に接続し、
 * リアルタイム音声認識を実行するサービスクラスです。
 *
 * 従来の Lambda 経由方式では、音声チャンクごとに別々の Lambda 実行環境に
 * ルーティングされ、Transcribe セッションが維持できない問題がありました。
 * この実装では Cognito Identity Pool の一時クレデンシャルを使って
 * ブラウザから直接 Transcribe に接続することで、この問題を根本解決します。
 *
 * @see https://github.com/aws-samples/sample-ai-sales-roleplay/issues/93
 */

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * WebSocket接続状態の定義
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',    // 未接続
  CONNECTING = 'connecting',        // 接続中
  CONNECTED = 'connected',          // 接続完了
  CONNECTION_ERROR = 'connection_error'  // 接続エラー
}

/**
 * 言語コードマッピング
 */
const LANGUAGE_MAP: Record<string, LanguageCode> = {
  'ja': 'ja-JP' as LanguageCode,
  'en': 'en-US' as LanguageCode,
};

export class TranscribeService {
  private static instance: TranscribeService;
  private transcribeClient: TranscribeStreamingClient | null = null;
  private audioContext: AudioContext | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;
  // AudioWorklet モジュール（transcribe-audio-processor.js）を AudioContext ごとに
  // 一度だけ addModule するためのフラグ管理用
  private workletModuleLoaded: boolean = false;
  private isRecording: boolean = false;
  private silenceDetectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVoiceActivityTime: number = 0;
  private abortController: AbortController | null = null;

  // 接続状態管理
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;

  // 設定パラメータ
  private silenceThresholdMs: number = 5000;  // 無音判定閾値（ミリ秒）- マイク放置時の安全弁
  private voiceThreshold: number = 1.5;  // 音声判定閾値（環境ノイズ除外用）
  private language: string = 'ja';  // 言語情報を保持
  private currentSessionId: string = '';  // 現在のセッションID
  private region: string = '';

  // 音声データキュー（Transcribe Streaming に流すバッファ）
  private audioQueue: Uint8Array[] = [];
  private isStreaming: boolean = false;
  // 最後に Transcribe へ音声チャンクを送信した時刻（キープアライブ判定用）
  private lastAudioSentTime: number = 0;
  // キープアライブ用の無音PCMチャンク送信間隔（ミリ秒）
  // Transcribe は「15秒間新しい音声が来ない」とタイムアウトするため、
  // それより十分短い間隔で無音チャンクを送り続けてセッションを維持する。
  private readonly keepAliveIntervalMs: number = 5000;
  // キープアライブ用の無音PCMチャンク（16kHz / 16bit / モノラルの 100ms 相当 = 1600 サンプル）
  private readonly silentPcmChunk: Uint8Array = new Uint8Array(1600 * 2);

  // コールバック関数
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onSilenceDetectedCallback: (() => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: ConnectionState) => void) | null = null;

  /**
   * コンストラクタ - シングルトンパターン
   */
  private constructor() {
    // シングルトン初期化
  }

  /**
   * 無音検出時間を設定
   * @deprecated UI設定が削除されたため、現在は内部的な安全弁としてのみ使用
   * @param thresholdMs 無音検出時間（ミリ秒）
   */
  public setSilenceThreshold(thresholdMs: number): void {
    const clampedThreshold = Math.max(500, Math.min(10000, thresholdMs));
    this.silenceThresholdMs = clampedThreshold;
  }

  /**
   * 現在の無音検出時間を取得
   * @deprecated UI設定が削除されたため、現在は内部的な安全弁としてのみ使用
   * @returns {number} 無音検出時間（ミリ秒）
   */
  public getSilenceThreshold(): number {
    return this.silenceThresholdMs;
  }

  /**
   * 音声判定閾値を設定
   * @param threshold 音声判定閾値（0.1〜10.0）
   */
  public setVoiceThreshold(threshold: number): void {
    this.voiceThreshold = Math.max(0.1, Math.min(10.0, threshold));
  }

  /**
   * 接続状態を変更する（内部使用）
   *
   * @private
   * @param {ConnectionState} newState 新しい接続状態
   */
  private setConnectionState(newState: ConnectionState): void {
    if (this.connectionState !== newState) {
      const oldState = this.connectionState;
      this.connectionState = newState;
      console.log(`Transcribe接続状態変更: ${oldState} → ${newState}`);

      // 接続状態変更コールバックを実行
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(newState);
      }
    }
  }

  /**
   * 現在の接続状態を取得
   *
   * @returns {ConnectionState} 現在の接続状態
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * 接続状態変更時のコールバックを設定
   *
   * @param {function} callback 接続状態変更時に呼ばれるコールバック関数
   */
  public setOnConnectionStateChange(callback: (state: ConnectionState) => void | null): void {
    this.onConnectionStateChangeCallback = callback;
  }

  /**
   * シングルトンインスタンスを取得
   *
   * @returns {TranscribeService} シングルトンインスタンス
   */
  public static getInstance(): TranscribeService {
    if (!TranscribeService.instance) {
      TranscribeService.instance = new TranscribeService();
    }
    return TranscribeService.instance;
  }

  /**
   * Cognito Identity Pool から一時クレデンシャルを取得し、
   * Transcribe Streaming クライアントを初期化する
   */
  private async initializeTranscribeClient(): Promise<void> {
    const session = await fetchAuthSession();

    if (!session.credentials) {
      throw new Error('Cognito一時クレデンシャルが取得できませんでした');
    }

    this.region = import.meta.env.VITE_AWS_REGION || 'ap-northeast-1';

    this.transcribeClient = new TranscribeStreamingClient({
      region: this.region,
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken,
      },
    });
  }

  /**
   * 接続を初期化（Transcribe クライアントの準備）
   *
   * @param sessionId セッションID
   * @param language 言語設定 (例: 'ja', 'en')
   */
  public async initializeConnection(sessionId: string, language?: string): Promise<void> {
    // セッションIDと言語情報を保存
    this.currentSessionId = sessionId;
    this.language = language || 'ja';

    // 接続開始状態に変更
    this.setConnectionState(ConnectionState.CONNECTING);

    try {
      await this.initializeTranscribeClient();
      this.setConnectionState(ConnectionState.CONNECTED);
      console.log('Transcribe直接接続の準備完了');
    } catch (error) {
      console.error('Transcribeクライアント初期化エラー:', error);
      this.setConnectionState(ConnectionState.CONNECTION_ERROR);
      if (this.onErrorCallback) {
        this.onErrorCallback(error instanceof Error ? error : new Error('Transcribe初期化エラー'));
      }
      throw error;
    }
  }

  /**
   * Transcribe Streaming セッションを開始
   *
   * @private
   */
  private async startTranscribeStream(): Promise<void> {
    if (!this.transcribeClient) {
      throw new Error('Transcribeクライアントが初期化されていません');
    }

    if (this.isStreaming) {
      return;
    }

    this.isStreaming = true;
    this.abortController = new AbortController();

    const languageCode = LANGUAGE_MAP[this.language] || ('ja-JP' as LanguageCode);

    // 音声ストリームの AsyncGenerator
    const audioStream = this.createAudioStream();

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: languageCode,
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream,
    });

    try {
      const response = await this.transcribeClient.send(command, {
        abortSignal: this.abortController.signal,
      });

      // 結果ストリームを非同期で処理
      if (response.TranscriptResultStream) {
        this.processTranscriptStream(response.TranscriptResultStream);
      }
    } catch (error: unknown) {
      // AbortError は正常終了（stopListening時）
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Transcribeセッション正常終了');
        return;
      }
      console.error('Transcribe Streamingエラー:', error);
      this.isStreaming = false;

      if (this.onErrorCallback) {
        this.onErrorCallback(error instanceof Error ? error : new Error('Transcribe Streamingエラー'));
      }
    }
  }

  /**
   * 音声データの AsyncGenerator を作成
   * audioQueue にデータが積まれるたびに yield する。
   *
   * 実音声が一定時間送られていない場合は無音PCMチャンクを送信して
   * Transcribe セッションのタイムアウト（15秒無音で BadRequestException）を防ぐ。
   */
  private async *createAudioStream(): AsyncGenerator<{ AudioEvent: { AudioChunk: Uint8Array } }> {
    this.lastAudioSentTime = Date.now();

    while (!this.abortController?.signal.aborted) {
      if (this.audioQueue.length > 0) {
        const chunk = this.audioQueue.shift();
        if (chunk) {
          this.lastAudioSentTime = Date.now();
          yield { AudioEvent: { AudioChunk: chunk } };
        }
      } else {
        // 実音声が keepAliveIntervalMs 以上送られていなければ無音チャンクを送り、
        // Transcribe のアイドルタイムアウトを回避する。
        if (Date.now() - this.lastAudioSentTime >= this.keepAliveIntervalMs) {
          this.lastAudioSentTime = Date.now();
          yield { AudioEvent: { AudioChunk: this.silentPcmChunk } };
        } else {
          // データがない場合は短い待機（CPU を解放）
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
    }
  }

  /**
   * Transcribe の結果ストリームを処理
   */
  private async processTranscriptStream(
    stream: AsyncIterable<{ TranscriptEvent?: { Transcript?: { Results?: Array<{ Alternatives?: Array<{ Transcript?: string }>; IsPartial?: boolean }> } } }>
  ): Promise<void> {
    try {
      for await (const event of stream) {
        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            const transcript = result.Alternatives?.[0]?.Transcript || '';
            const isPartial = result.IsPartial === true;

            if (transcript.trim() && this.onTranscriptCallback) {
              this.onTranscriptCallback(transcript, isPartial);
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Transcriptストリーム処理エラー:', error);
    } finally {
      this.isStreaming = false;
    }
  }

  /**
   * 音声認識を開始
   *
   * @param onTranscript テキスト認識時のコールバック（text: 認識テキスト, isPartial: true=途中認識/false=最終確定）
   * @param onSilence 無音検出時のコールバック
   * @param onError エラー発生時のコールバック
   */
  public async startListening(
    onTranscript: (text: string, isPartial: boolean) => void,
    onSilence?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    if (this.isRecording) {
      this.stopListening();
    }

    if (!this.transcribeClient) {
      throw new Error('Transcribeクライアントが初期化されていません。initializeConnection()を先に呼んでください');
    }

    this.onTranscriptCallback = onTranscript;
    this.onSilenceDetectedCallback = onSilence || null;
    this.onErrorCallback = onError || null;

    // 音声キューをリセット
    this.audioQueue = [];

    try {
      // マイクへのアクセスを要求
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,  // Transcribe要求に合わせて16kHzに設定
          channelCount: 1     // モノラル
        }
      });

      // 既存の AudioContext が残っていれば閉じてリークを防ぐ
      if (this.audioContext) {
        try {
          await this.audioContext.close();
        } catch (e) {
          console.warn('既存AudioContext停止エラー:', e);
        }
        this.audioContext = null;
        this.workletModuleLoaded = false;
      }

      // Web Audio APIを使用してPCM形式で処理
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      // 非推奨の ScriptProcessorNode に代わり AudioWorkletNode を使用する。
      // 音声レベル計算と Float32->Int16 PCM 変換はワークレット側で行い、
      // 結果を message で受け取る。
      if (!this.workletModuleLoaded) {
        await this.audioContext.audioWorklet.addModule('/transcribe-audio-processor.js');
        this.workletModuleLoaded = true;
      }

      this.mediaStream = stream;
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'transcribe-audio-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });

      this.audioWorkletNode.port.onmessage = (event: MessageEvent<{ audioLevel: number; pcm: ArrayBuffer }>) => {
        try {
          const { audioLevel, pcm } = event.data;

          // 音声レベルが閾値を超えている場合のみ音声アクティビティを更新
          if (audioLevel > this.voiceThreshold) {
            this.lastVoiceActivityTime = Date.now();
          }

          // Transcribe Streaming のキューに追加
          this.audioQueue.push(new Uint8Array(pcm));
        } catch (error) {
          console.error('音声データ処理エラー:', error);
        }
      };

      this.mediaStreamSource.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);

      // 無音検出タイマーを設定
      this.lastVoiceActivityTime = Date.now();
      this.startSilenceDetection();

      this.isRecording = true;

      // Transcribe Streaming セッションを開始（非同期、バックグラウンド）
      this.startTranscribeStream().catch(error => {
        console.error('Transcribe Streaming 開始エラー:', error);
        if (this.onErrorCallback) {
          this.onErrorCallback(error instanceof Error ? error : new Error('Transcribe開始エラー'));
        }
      });
    } catch (error) {
      console.error('音声認識開始エラー:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error instanceof Error ? error : new Error('音声認識開始エラー'));
      }
      throw error;
    }
  }

  /**
   * 無音検出処理を開始
   *
   * @private
   */
  private startSilenceDetection(): void {
    // 既存のタイマーをクリア
    if (this.silenceDetectionTimer) {
      clearInterval(this.silenceDetectionTimer);
    }

    // 定期的に無音状態をチェック
    this.silenceDetectionTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastVoiceActivityTime;

      // 設定された閾値より長く無音が続いた場合
      if (elapsed > this.silenceThresholdMs) {

        if (this.onSilenceDetectedCallback) {
          this.onSilenceDetectedCallback();

          // 無音検出後は検出を一時停止（連続検出を防止）
          this.lastVoiceActivityTime = now;
        }
      }
    }, 500);
  }

  /**
   * 音声認識を停止
   */
  public stopListening(): void {
    // 無音検出タイマーを停止
    if (this.silenceDetectionTimer) {
      clearInterval(this.silenceDetectionTimer);
      this.silenceDetectionTimer = null;
    }

    // Transcribe Streaming セッションを終了
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isStreaming = false;
    this.audioQueue = [];

    // Web Audio API リソースを停止
    if (this.audioWorkletNode) {
      try {
        this.audioWorkletNode.port.onmessage = null;
        this.audioWorkletNode.disconnect();
        this.audioWorkletNode = null;
      } catch (e) {
        console.warn('AudioWorkletNode停止エラー:', e);
      }
    }

    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect();
        this.mediaStreamSource = null;
      } catch (e) {
        console.warn('MediaStreamSource停止エラー:', e);
      }
    }

    // MediaStreamを停止
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      } catch (e) {
        console.warn('MediaStream停止エラー:', e);
      }
    }

    this.isRecording = false;
  }

  /**
   * リソースを解放
   */
  public dispose(): void {
    this.stopListening();
    this.transcribeClient = null;
    this.setConnectionState(ConnectionState.DISCONNECTED);

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        console.warn('AudioContext停止エラー:', e);
      }
      this.audioContext = null;
      // AudioContext を破棄したので、次回は新しい Context に対して
      // 再度 worklet モジュールを addModule する必要がある。
      this.workletModuleLoaded = false;
    }
  }

  /**
   * 現在音声認識中かどうかを取得
   *
   * @returns {boolean} 音声認識中の場合true
   */
  public isListening(): boolean {
    return this.isRecording;
  }

  /**
   * Transcribeクライアントが準備できているかを確認
   *
   * @returns {boolean} 接続されている場合true
   */
  public isConnected(): boolean {
    return this.transcribeClient !== null &&
      this.connectionState === ConnectionState.CONNECTED;
  }
}

// WebAudioAPI用の型定義
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
