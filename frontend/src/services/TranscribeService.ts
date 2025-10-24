/**
 * Amazon Transcribeストリーミング統合サービス
 * 
 * WebSocketを通じて音声をストリーミングし、Amazon Transcribeによるリアルタイム音声認識を
 * 実行するためのサービスクラスです。常時マイク入力を可能にし、無音検出による自動発話終了を
 * サポートします。認証されたWebSocket接続を使用します。
 */
export class TranscribeService {
  private static instance: TranscribeService;
  private socket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private isRecording: boolean = false;
  private silenceDetectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVoiceActivityTime: number = 0;
  
  // 設定パラメータ
  private silenceThresholdMs: number = 1500;  // 無音判定閾値（ミリ秒）
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

  /**
   * 無音検出時間を設定
   * 
   * @param thresholdMs 無音検出時間（ミリ秒）
   */
  public setSilenceThreshold(thresholdMs: number): void {
    // 範囲制限: 500ms〜5000ms
    const clampedThreshold = Math.max(500, Math.min(5000, thresholdMs));
    this.silenceThresholdMs = clampedThreshold;
    console.log(`無音検出時間を設定: ${clampedThreshold}ms`);
  }

  /**
   * 現在の無音検出時間を取得
   * 
   * @returns {number} 無音検出時間（ミリ秒）
   */
  public getSilenceThreshold(): number {
    return this.silenceThresholdMs;
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
   * WebSocket接続を初期化
   *
   * @param sessionId セッションID
   */
  public async initializeConnection(sessionId: string): Promise<void> {
    if (!this.websocketUrl) {
      throw new Error('WebSocketエンドポイントが設定されていません');
    }

    // 既存の接続を閉じる
    this.closeConnection();

    try {
      // AuthServiceから認証トークンを取得
      const { AuthService } = await import('./AuthService');
      const authService = AuthService.getInstance();
      const token = await authService.getAuthToken();
      
      if (!token) {
        throw new Error('認証トークンが取得できませんでした');
      }

      // 認証トークン付きの接続URL
      const authenticatedUrl = `${this.websocketUrl}?session=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;
      console.log(`WebSocket認証付き接続を初期化: ${this.websocketUrl}?session=${encodeURIComponent(sessionId)}&token=***`);

      return new Promise((resolve, reject) => {
        try {
          this.socket = new WebSocket(authenticatedUrl);

          this.socket.onopen = () => {
            console.log('WebSocket接続確立成功!');
            resolve();
          };

          this.socket.onmessage = (event) => {
            // console.log('WebSocketメッセージ受信:', event.data);
            try {
              const data = JSON.parse(event.data);
              if (data.transcript && this.onTranscriptCallback) {
                // isPartial: true=途中認識、false=最終確定（AWS Transcribe APIの標準に準拠）
                this.onTranscriptCallback(data.transcript, data.isPartial || false);
              }
              
              // Lambda側のvoiceActivityは無視（フロントエンド側の音声レベル判定を優先）
              // 実際の音声レベル検出はaudioProcessor内で行う
            } catch (error) {
              console.error('WebSocketメッセージ解析エラー:', error);
            }
          };

          this.socket.onerror = (error) => {
            console.error('WebSocketエラー詳細:', error);
            console.error('WebSocketエラー状態:', {
              readyState: this.socket?.readyState,
              url: this.socket?.url
            });
            reject(error);
          };

          this.socket.onclose = (event) => {
            console.log(`WebSocket切断詳細: コード=${event.code}, 理由=${event.reason}, wasClean=${event.wasClean}`);
          };
        } catch (error) {
          console.error('WebSocket初期化エラー:', error);
          reject(error);
        }
      });
    } catch (error) {
      console.error('WebSocket接続エラー:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error instanceof Error ? error : new Error('WebSocket接続エラー'));
      }
      throw error;
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

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket接続が確立されていません');
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
          autoGainControl: true,
          sampleRate: 16000,  // Transcribe要求に合わせて16kHzに設定
          channelCount: 1     // モノラル
        }
      });

      // Web Audio APIを使用してPCM形式で処理
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      this.mediaStream = stream;
      const source = this.audioContext.createMediaStreamSource(stream);
      this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.audioProcessor.onaudioprocess = (event) => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          try {
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // 音声レベルを計算（RMS値）
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
              sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            const audioLevel = rms * 100; // 0-100のスケールに変換
            
            // 音声レベルが閾値を超えている場合のみ音声アクティビティを更新
            const voiceThreshold = 0.5; // 音声判定閾値（調整可能）
            if (audioLevel > voiceThreshold) {
              this.lastVoiceActivityTime = Date.now();
              // console.log(`🎤 音声検出: レベル=${audioLevel.toFixed(2)} (閾値: ${voiceThreshold})`);
            } else {
              // 無音状態の詳細ログ
              // const elapsed = Date.now() - this.lastVoiceActivityTime;
              // if (elapsed > 500 && elapsed % 500 < 100) { // 500ms以上の無音時に定期的にログ
              //   console.log(`🔇 無音継続: レベル=${audioLevel.toFixed(2)}, 経過=${elapsed}ms (閾値: ${this.silenceThresholdMs}ms)`);
              // }
            }
            
            // Float32ArrayをInt16Arrayに変換（PCM 16bit）
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              // -1.0から1.0の範囲を-32768から32767の範囲に変換
              pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32767));
            }

            // Int16ArrayをUint8Arrayに変換してBase64エンコード
            const uint8Array = new Uint8Array(pcmData.buffer);
            const base64Audio = this.arrayBufferToBase64(uint8Array.buffer);
            
            // console.log(`音声データ送信: ${uint8Array.length}バイト, レベル: ${audioLevel.toFixed(2)}`);
            
            this.socket.send(JSON.stringify({
              action: 'sendAudio',
              audio: base64Audio
            }));
          } catch (error) {
            console.error('音声データ処理エラー:', error);
          }
        }
      };

      source.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);

      // 無音検出タイマーを設定
      this.lastVoiceActivityTime = Date.now();
      this.startSilenceDetection();

      this.isRecording = true;
      console.log('音声認識を開始しました (PCM 16kHz)');
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

    // console.log(`無音検出タイマー開始: 閾値=${this.silenceThresholdMs}ms, チェック間隔=500ms`);

    // 定期的に無音状態をチェック
    this.silenceDetectionTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastVoiceActivityTime;
      
      // デバッグログ: 定期的に経過時間を確認
      // if (elapsed % 2000 < 500) { // 約2秒ごとにログ出力
      //   console.log(`無音チェック: ${elapsed}ms経過, 閾値: ${this.silenceThresholdMs}ms`);
      // }
      
      // 設定された閾値より長く無音が続いた場合
      if (elapsed > this.silenceThresholdMs) {
        // console.log(`🔇 無音検出トリガー: ${elapsed}ms経過, コールバック有無: ${!!this.onSilenceDetectedCallback}`);
        
        if (this.onSilenceDetectedCallback) {
          // console.log(`📤 無音検出コールバック実行`);
          this.onSilenceDetectedCallback();
          
          // 無音検出後は検出を一時停止（連続検出を防止）
          this.lastVoiceActivityTime = now;
          // console.log(`⏰ 無音検出後の音声アクティビティ時刻をリセット`);
        } else {
          // console.warn(`⚠️ 無音検出コールバックが設定されていません`);
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

    // Web Audio API リソースを停止
    if (this.audioProcessor) {
      try {
        this.audioProcessor.disconnect();
        this.audioProcessor = null;
      } catch (e) {
        console.warn('AudioProcessor停止エラー:', e);
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

    // MediaRecorderを停止（後方互換性のため残しておく）
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
    console.log('音声認識を停止しました (Web Audio API)');
  }

  /**
   * WebSocket接続を閉じる
   */
  private closeConnection(): void {
    if (this.socket) {
      try {
        if (this.socket.readyState === WebSocket.OPEN || 
            this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close();
        }
      } catch (e) {
        console.warn('WebSocket切断エラー:', e);
      }
      this.socket = null;
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
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
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
