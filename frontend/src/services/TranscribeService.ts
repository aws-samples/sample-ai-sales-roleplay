/**
 * Amazon Transcribeストリーミング統合サービス
 * 
 * WebSocketを通じて音声をストリーミングし、Amazon Transcribeによるリアルタイム音声認識を
 * 実行するためのサービスクラスです。常時マイク入力を可能にし、無音検出による自動発話終了を
 * サポートします。
 */
export class TranscribeService {
  private static instance: TranscribeService;
  private socket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private isRecording: boolean = false;
  private silenceDetectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVoiceActivityTime: number = 0;
  
  // 設定パラメータ
  private readonly silenceThresholdMs: number = 1500;  // 無音判定閾値（ミリ秒）
  private websocketUrl: string = '';
  
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
    this.websocketUrl = process.env.REACT_APP_TRANSCRIBE_WEBSOCKET_URL || '';
    if (!this.websocketUrl) {
      console.warn('Transcribe WebSocket URL is not defined in environment variables');
    }
    
    // AudioContextの初期化
    try {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
    } catch (e) {
      console.error('Web Audio APIはこのブラウザでサポートされていません', e);
    }
  }
  
  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): TranscribeService {
    if (!TranscribeService.instance) {
      TranscribeService.instance = new TranscribeService();
    }
    return TranscribeService.instance;
  }
  
  /**
   * WebSocket接続を初期化
   * @param sessionId セッションID
   * @param authToken 認証トークン
   */
  public initializeConnection(sessionId: string, authToken?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 既存の接続をクローズ
        if (this.socket) {
          this.socket.close();
          this.socket = null;
        }
        
        // WebSocketの初期化
        const url = `${this.websocketUrl}?session=${sessionId}${authToken ? `&token=${authToken}` : ''}`;
        this.socket = new WebSocket(url);
        
        this.socket.onopen = () => {
          console.log('Transcribe WebSocketに接続しました');
          resolve();
        };
        
        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.transcript) {
              // 文字起こし結果をコールバックで通知
              if (this.onTranscriptCallback) {
                this.onTranscriptCallback(data.transcript, !!data.isFinal);
              }
              
              // 最終確定した文字起こし結果の場合は無音タイマーをリセット
              if (data.isFinal) {
                this.resetSilenceTimer();
              }
            }
            
            // 音声アクティビティ情報の処理
            if (data.voiceActivity === true) {
              this.lastVoiceActivityTime = Date.now();
              this.resetSilenceTimer();
            }
          } catch (e) {
            console.error('WebSocket message parsing error:', e);
          }
        };
        
        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (this.onErrorCallback) {
            this.onErrorCallback(new Error('WebSocket connection error'));
          }
          reject(error);
        };
        
        this.socket.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          // 予期しない切断の場合
          if (this.isRecording && this.onErrorCallback) {
            this.onErrorCallback(new Error('WebSocket connection closed unexpectedly'));
          }
        };
        
      } catch (error) {
        console.error('WebSocket initialization error:', error);
        reject(error);
      }
    });
  }
  
  /**
   * 音声認識を開始
   * @param onTranscript 文字起こし結果のコールバック
   * @param onSilenceDetected 無音検出時のコールバック
   * @param onError エラー発生時のコールバック
   */
  public async startListening(
    onTranscript: (text: string, isFinal: boolean) => void,
    onSilenceDetected: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    if (this.isRecording) {
      console.log('すでに録音中です');
      return;
    }
    
    // コールバックを設定
    this.onTranscriptCallback = onTranscript;
    this.onSilenceDetectedCallback = onSilenceDetected;
    this.onErrorCallback = onError || null;
    
    try {
      // WebSocketが接続されていることを確認
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocketが接続されていません');
      }
      
      // マイク入力の取得
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // MediaRecorderの設定
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      
      // データ取得時の処理
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
          // 音声データをバイナリ化してWebSocketで送信
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result?.toString().split(',')[1];
            if (base64data && this.socket) {
              this.socket.send(JSON.stringify({
                action: 'sendAudio',
                audio: base64data
              }));
            }
          };
          reader.readAsDataURL(event.data);
        }
      };
      
      // 録音開始
      this.mediaRecorder.start(100); // 100ms間隔でデータを取得
      this.isRecording = true;
      
      // 無音検出タイマーの初期化
      this.lastVoiceActivityTime = Date.now();
      this.resetSilenceTimer();
      
      console.log('音声認識を開始しました');
      
    } catch (error) {
      console.error('音声認識の開始エラー:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }
  
  /**
   * 音声認識を停止
   */
  public stopListening(): void {
    if (!this.isRecording) {
      return;
    }
    
    // MediaRecorderの停止
    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn('MediaRecorderの停止中にエラーが発生しました:', e);
      }
      this.mediaRecorder = null;
    }
    
    // 無音検出タイマーのクリア
    if (this.silenceDetectionTimer) {
      clearTimeout(this.silenceDetectionTimer);
      this.silenceDetectionTimer = null;
    }
    
    this.isRecording = false;
    console.log('音声認識を停止しました');
  }
  
  /**
   * 無音検出タイマーをリセット
   */
  private resetSilenceTimer(): void {
    // 既存のタイマーをクリア
    if (this.silenceDetectionTimer) {
      clearTimeout(this.silenceDetectionTimer);
    }
    
    // 新しいタイマーを設定
    this.silenceDetectionTimer = setTimeout(() => {
      const timeSinceLastActivity = Date.now() - this.lastVoiceActivityTime;
      if (timeSinceLastActivity >= this.silenceThresholdMs && this.onSilenceDetectedCallback) {
        console.log('無音を検出しました - 発話終了と判断');
        this.onSilenceDetectedCallback();
      }
    }, this.silenceThresholdMs);
  }
  
  /**
   * WebSocket接続が有効かどうかを確認
   */
  public isConnected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }
  
  /**
   * 録音中かどうかを確認
   */
  public isListening(): boolean {
    return this.isRecording;
  }
  
  /**
   * リソースの解放
   */
  public dispose(): void {
    this.stopListening();
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close().catch(e => console.warn('AudioContextのクローズ中にエラー:', e));
      this.audioContext = null;
    }
    
    this.onTranscriptCallback = null;
    this.onSilenceDetectedCallback = null;
    this.onErrorCallback = null;
  }
}