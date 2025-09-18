import { PubSub } from '@aws-amplify/pubsub';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Amazon Transcribeストリーミング統合サービス
 * 
 * WebSocketを通じて音声をストリーミングし、Amazon Transcribeによるリアルタイム音声認識を
 * 実行するためのサービスクラスです。常時マイク入力を可能にし、無音検出による自動発話終了を
 * サポートします。Amplify PubSubを使用して認証された接続を確立します。
 */
export class TranscribeService {
  private static instance: TranscribeService;
  private pubSubClient: any = null; // PubSubクライアント
  private subscription: any = null; // PubSubサブスクリプション
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private isRecording: boolean = false;
  private silenceDetectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVoiceActivityTime: number = 0;
  
  // 設定パラメータ
  private readonly silenceThresholdMs: number = 1500;  // 無音判定閾値（ミリ秒）
  private websocketUrl: string = '';
  private sessionId: string = '';
  
  // コールバック関数
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onSilenceDetectedCallback: (() => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  
  /**
   * コンストラクタ - シングルトンパターン
   */
  private constructor() {
    console.log("TranscribeService初期化");
  }
  
  /**
   * WebSocketエンドポイントを設定
   * 
   * @param url WebSocketエンドポイントURL
   */
  public setWebSocketEndpoint(url: string): void {
    this.websocketUrl = url;
    console.log(`WebSocketエンドポイントを設定: ${url}`);
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
   * WebSocket接続を初期化（Amplify PubSubを使用）
   *
   * @param sessionId セッションID
   */
  public async initializeConnection(sessionId: string): Promise<void> {
    if (!this.websocketUrl) {
      throw new Error('WebSocketエンドポイントが設定されていません');
    }

    // 既存の接続を閉じる
    this.closeConnection();
    
    // セッションIDを保存
    this.sessionId = sessionId;

    try {
      console.log(`Amplify PubSubでWebSocket接続を初期化: ${this.websocketUrl}`);
      
      // 認証トークンを取得
      const { tokens } = await fetchAuthSession();
      const jwtToken = tokens?.accessToken?.toString();
      
      if (!jwtToken) {
        throw new Error('認証トークンを取得できませんでした');
      }
      
      // WebSocketエンドポイントにクエリパラメータを追加
      // Auth: JWT認証用トークン
      // sessionId: セッション識別用
      const wsUrl = new URL(this.websocketUrl);
      wsUrl.searchParams.append('Auth', jwtToken);
      wsUrl.searchParams.append('sessionId', sessionId);
      
      // PubSub接続を確立
      this.pubSubClient = PubSub.subscribe({
        url: wsUrl.toString(),
      }).subscribe({
        next: (data: any) => {
          try {
            // 受信データを処理
            if (data.transcript && this.onTranscriptCallback) {
              this.onTranscriptCallback(data.transcript, data.isFinal || false);
            }
            
            // 音声アクティビティを検出した場合、タイムスタンプを更新
            if (data.voiceActivity === true) {
              this.lastVoiceActivityTime = Date.now();
            }
          } catch (error) {
            console.error('メッセージ解析エラー:', error);
          }
        },
        error: (error: any) => {
          console.error('PubSub接続エラー:', error);
          if (this.onErrorCallback) {
            this.onErrorCallback(error instanceof Error ? error : new Error('PubSub接続エラー'));
          }
        },
        complete: () => {
          console.log('PubSub接続終了');
        }
      });
      
      console.log('PubSub接続確立');
    } catch (error) {
      console.error('PubSub初期化エラー:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error instanceof Error ? error : new Error('PubSub初期化エラー'));
      }
      throw error;
    }
  }

  /**
   * 音声認識を開始
   *
   * @param onTranscript テキスト認識時のコールバック
   * @param onSilence 無音検出時のコールバック
   * @param onError エラー発生時のコールバック
   */
  public async startListening(
    onTranscript: (text: string, isFinal: boolean) => void,
    onSilence?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    if (this.isRecording) {
      this.stopListening();
    }

    if (!this.pubSubClient) {
      throw new Error('PubSub接続が確立されていません');
    }

    this.onTranscriptCallback = onTranscript;
    this.onSilenceDetectedCallback = onSilence || null;
    this.onErrorCallback = onError || null;

    try {
      // マイクへのアクセスを要求
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // MediaRecorderを設定
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.addEventListener('dataavailable', async (event) => {
        if (event.data.size > 0 && this.pubSubClient) {
          try {
            // 音声データをBase64エンコードして送信
            const buffer = await event.data.arrayBuffer();
            const base64Audio = this.arrayBufferToBase64(buffer);
            
            // PubSubを通じて送信
            await PubSub.publish({
              data: {
                action: 'sendAudio',
                audio: base64Audio,
                sessionId: this.sessionId
              }
            });
          } catch (error) {
            console.error('音声データ送信エラー:', error);
          }
        }
      });

      // 無音検出タイマーを設定
      this.lastVoiceActivityTime = Date.now();
      this.startSilenceDetection();

      // 録音開始
      this.mediaRecorder.start(250); // 250msごとにデータを送信
      this.isRecording = true;

      console.log('音声認識を開始しました');
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
      if (elapsed > this.silenceThresholdMs && this.onSilenceDetectedCallback) {
        console.log(`無音検出: ${elapsed}ms経過`);
        this.onSilenceDetectedCallback();
        
        // 無音検出後は検出を一時停止（連続検出を防止）
        this.lastVoiceActivityTime = now;
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

    // MediaRecorderを停止
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn('MediaRecorder停止エラー:', e);
      }
      this.mediaRecorder = null;
    }

    this.isRecording = false;
    console.log('音声認識を停止しました');
  }

  /**
   * WebSocket接続を閉じる
   */
  private closeConnection(): void {
    if (this.pubSubClient) {
      try {
        this.pubSubClient.unsubscribe();
      } catch (e) {
        console.warn('PubSub切断エラー:', e);
      }
      this.pubSubClient = null;
    }
  }

  /**
   * リソースを解放
   */
  public dispose(): void {
    this.stopListening();
    this.closeConnection();
    
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        console.warn('AudioContext停止エラー:', e);
      }
      this.audioContext = null;
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
   * WebSocketが接続されているかを確認
   *
   * @returns {boolean} 接続されている場合true
   */
  public isConnected(): boolean {
    return this.pubSubClient !== null;
  }

  /**
   * ArrayBufferをBase64に変換
   *
   * @param buffer 変換するArrayBuffer
   * @returns {string} Base64エンコードされた文字列
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

// WebAudioAPI用の型定義
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
