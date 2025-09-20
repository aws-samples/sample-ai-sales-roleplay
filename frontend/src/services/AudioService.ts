import { PollyService } from "./PollyService";

/**
 * 音声再生サービス
 *
 * テキストの音声合成や再生キューの管理を行うサービスクラスです。
 * Amazon Pollyとの統合により、テキストを高品質な日本語音声に変換し、
 * ブラウザで再生します。再生順序を制御するキュー機能や、複数の音声チャンクを
 * 連続して再生する機能を提供します。
 *
 * 主な機能:
 * - テキストを音声に変換し再生 (Amazon Polly利用)
 * - 音声再生キューの管理
 * - 音声の有効/無効切り替え
 * - 音量調整
 * - 長文テキストの分割と順次処理
 * - メッセージIDによる関連音声の管理
 */
export class AudioService {
  private static instance: AudioService;
  private audioQueue: Array<{
    id: string;
    audio: HTMLAudioElement;
    text: string;
  }> = [];
  private isPlaying: boolean = false;
  private audioEnabled: boolean = true;
  private audioVolume: number = 1.0;
  private currentSynthesisTasks: Map<string, AbortController> = new Map();
  private pollyService: PollyService;
  
  // イベントリスナーの追加
  private playbackCompleteListeners: Map<string, Set<() => void>> = new Map();
  private globalPlaybackListeners: Set<(messageId: string) => void> = new Set();

  /**
   * コンストラクタ - シングルトンパターン
   *
   * AudioServiceのインスタンス初期化を行います。PollyServiceのインスタンスを
   * 取得し、音声合成機能を準備します。
   *
   * @private
   */
  private constructor() {
    console.log("=== 音声サービス初期化 ===");
    this.pollyService = PollyService.getInstance();
  }

  /**
   * シングルトンインスタンスを取得
   *
   * AudioServiceの唯一のインスタンスを返します。インスタンスがまだ
   * 作成されていない場合は、新しく作成します。
   *
   * @returns {AudioService} AudioServiceのシングルトンインスタンス
   */
  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  /**
   * 音声を有効/無効にする
   *
   * 音声出力の有効/無効状態を設定します。無効に設定すると、現在再生中の
   * すべての音声が停止され、新たな音声合成リクエストは処理されません。
   *
   * @param {boolean} enabled 有効にする場合はtrue、無効にする場合はfalse
   */
  public setAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled;
    console.log(`音声出力を${enabled ? "有効" : "無効"}にしました`);

    if (!enabled) {
      this.stopAllAudio();
    }
  }

  /**
   * 音量を設定
   *
   * 音声再生の音量レベルを設定します。指定された値は0.0～1.0の範囲に
   * 制限されます。現在キューに入っている音声にも即時に音量変更が適用されます。
   *
   * @param {number} volume 音量 (0.0-1.0の範囲、0.0は無音、1.0は最大音量)
   */
  public setVolume(volume: number): void {
    this.audioVolume = Math.max(0, Math.min(1, volume));
    console.log(`音量を設定: ${this.audioVolume}`);

    // 再生中の音声があれば音量を適用
    this.audioQueue.forEach((item) => {
      item.audio.volume = this.audioVolume;
    });
  }

  /**
   * テキストを音声に変換して再生キューに追加
   *
   * テキストをAmazon Pollyを使用して音声に変換し、再生キューに追加します。
   * テキストは適切なチャンクサイズに分割され、各チャンクは順番に処理されます。
   * 同じメッセージIDの既存の合成タスクがある場合は、それをキャンセルして
   * 新しいタスクを開始します。
   *
   * @param {string} text 音声に変換するテキスト
   * @param {string} messageId メッセージID（複数の音声チャンクをグループ化するため）
   * @returns {Promise<void>} 処理完了を表すPromise
   */
  public async synthesizeAndQueueAudio(
    text: string,
    messageId: string,
  ): Promise<void> {
    if (!this.audioEnabled || !text) {
      console.log("音声は無効か、テキストが空です。合成をスキップします");
      return;
    }

    try {
      // 既存のタスクをキャンセル（同じメッセージID）
      if (this.currentSynthesisTasks.has(messageId)) {
        this.currentSynthesisTasks.get(messageId)?.abort();
        this.currentSynthesisTasks.delete(messageId);
      }

      // テキスト分割（長すぎると Polly の制限に引っかかる可能性がある）
      const textChunks = this.splitTextIntoChunks(text, 1000);

      for (const chunk of textChunks) {
        // 新しい AbortController を作成
        const controller = new AbortController();
        this.currentSynthesisTasks.set(messageId, controller);

        // Amazon Polly でテキストを音声に変換（デフォルト速度で変換）
        // PollyService内で自動的にSSMLに変換され、速度調整される
        const audioUrl = await this.pollyService.synthesizeSpeech(chunk);

        // タスクがキャンセルされていない場合のみ続行
        if (!controller.signal.aborted) {
          // 音声をキューに追加
          const audio = new Audio(audioUrl);
          audio.volume = this.audioVolume;

          this.audioQueue.push({
            id: messageId,
            audio,
            text: chunk,
          });

          console.log(`音声をキューに追加: ${chunk.substring(0, 20)}...`);

          // 再生中でなければ再生を開始
          if (!this.isPlaying) {
            this.playNextAudio();
          }
        }
      }
    } catch (error) {
      console.error("音声合成エラー:", error);
    } finally {
      // タスクが完了したらマップから削除
      this.currentSynthesisTasks.delete(messageId);
    }
  }

  /**
   * テキストを適切なチャンクサイズに分割する
   *
   * 長いテキストを文の区切りを考慮して適切なサイズのチャンクに分割します。
   * 可能な限り自然な区切り（句読点など）でテキストを分割し、
   * チャンクサイズの上限を超えないようにします。これにより、
   * Pollyの制限内で自然な音声合成が可能になります。
   *
   * @param {string} text 分割するテキスト
   * @param {number} chunkSize チャンクの最大サイズ（文字数）
   * @returns {string[]} 分割されたテキストの配列
   * @private
   */
  private splitTextIntoChunks(text: string, chunkSize: number): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      // チャンクサイズか文の終わりの位置を探す
      let end = start + chunkSize;
      if (end >= text.length) {
        end = text.length;
      } else {
        // 文の切れ目（。、!?）を探す
        const sentenceBreaks = [
          text.lastIndexOf("。", end),
          text.lastIndexOf("、", end),
          text.lastIndexOf("!", end),
          text.lastIndexOf("?", end),
          text.lastIndexOf("？", end),
          text.lastIndexOf("！", end),
        ].filter((pos) => pos > start && pos < end);

        // 文の切れ目があればそこで分割
        if (sentenceBreaks.length > 0) {
          end = Math.max(...sentenceBreaks) + 1;
        }
      }

      chunks.push(text.substring(start, end));
      start = end;
    }

    return chunks;
  }

  /**
   * Base64エンコードされた音声データを再生キューに追加
   *
   * すでに音声合成された音声データ（Base64エンコードまたはURL）を再生キューに追加します。
   * このメソッドは音声合成をスキップし、直接提供された音声データを使用します。
   * 音声再生キューが空の場合は、追加後すぐに再生を開始します。
   *
   * @param {string} audioData Base64エンコードされた音声データまたは音声URL
   * @param {string} text 音声のテキスト内容（デバッグとログ記録用）
   * @param {string} messageId メッセージID（複数の音声チャンクをグループ化するため）
   */
  public queueAudio(audioData: string, text: string, messageId: string): void {
    if (!this.audioEnabled) {
      console.log("音声は無効になっています。再生をスキップします");
      return;
    }

    try {
      const audio = new Audio(audioData);
      audio.volume = this.audioVolume;

      // キューに追加
      this.audioQueue.push({
        id: messageId,
        audio,
        text,
      });

      console.log(`音声をキューに追加: ${text.substring(0, 20)}...`);

      // 再生中でなければ再生を開始
      if (!this.isPlaying) {
        this.playNextAudio();
      }
    } catch (error) {
      console.error("音声キュー追加エラー:", error);
    }
  }

  /**
   * キュー内の次の音声を再生
   *
   * 音声キューの先頭にある音声を再生します。音声の再生が終了するか
   * エラーが発生した場合、キューから削除し次の音声の再生を試みます。
   * 音声が無効になっているかキューが空の場合は何も再生しません。
   *
   * @private
   */
  private playNextAudio(): void {
    if (!this.audioEnabled || this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const nextAudio = this.audioQueue[0];
    console.log(`音声再生開始: ${nextAudio.text.substring(0, 20)}...`);

    nextAudio.audio.onended = () => {
      // 再生終了したら次の音声へ
      const completedMessageId = nextAudio.id;
      this.audioQueue.shift();
      
      // キューが空になった場合（このメッセージの再生が完了した場合）、リスナーに通知
      if (this.audioQueue.length === 0 || this.audioQueue[0].id !== completedMessageId) {
        // 特定のメッセージに対するリスナーを実行
        const listeners = this.playbackCompleteListeners.get(completedMessageId);
        if (listeners) {
          console.log(`メッセージID ${completedMessageId} の再生完了リスナーを実行`);
          listeners.forEach(listener => listener());
        }
        
        // グローバルリスナーを実行
        this.globalPlaybackListeners.forEach(listener => listener(completedMessageId));
        
        // リスナーを削除（一回限りのイベント）
        this.playbackCompleteListeners.delete(completedMessageId);
      }
      
      this.playNextAudio();
    };

    nextAudio.audio.onerror = (error) => {
      console.error("音声再生エラー:", error);
      const errorMessageId = nextAudio.id;
      this.audioQueue.shift();
      
      // エラー時にもリスナーに通知
      const listeners = this.playbackCompleteListeners.get(errorMessageId);
      if (listeners) {
        console.log(`メッセージID ${errorMessageId} の再生エラー - リスナーを実行`);
        listeners.forEach(listener => listener());
      }
      
      // グローバルリスナーを実行
      this.globalPlaybackListeners.forEach(listener => listener(errorMessageId));
      
      // リスナーを削除（一回限りのイベント）
      this.playbackCompleteListeners.delete(errorMessageId);
      
      this.playNextAudio();
    };

    // 再生開始
    nextAudio.audio.play().catch((error) => {
      console.error("音声再生開始エラー:", error);
      const failedMessageId = nextAudio.id;
      this.audioQueue.shift();
      
      // 再生開始失敗時にもリスナーに通知
      const listeners = this.playbackCompleteListeners.get(failedMessageId);
      if (listeners) {
        console.log(`メッセージID ${failedMessageId} の再生開始失敗 - リスナーを実行`);
        listeners.forEach(listener => listener());
      }
      
      // グローバルリスナーを実行
      this.globalPlaybackListeners.forEach(listener => listener(failedMessageId));
      
      // リスナーを削除（一回限りのイベント）
      this.playbackCompleteListeners.delete(failedMessageId);
      
      this.playNextAudio();
    });
  }

  /**
   * 特定のメッセージIDに関連するすべての音声をキューから削除
   *
   * 指定されたメッセージIDに関連するすべての音声合成タスクと音声再生をキャンセルします。
   * 再生中の音声が指定されたIDに一致する場合は停止し、キューからも削除します。
   * 複数メッセージの音声が同時に処理されている場合に、特定のメッセージの音声だけを
   * キャンセルするために使用します。
   *
   * @param {string} messageId メッセージID
   */
  public clearAudiosByMessageId(messageId: string): void {
    // 実行中の合成タスクをキャンセル
    if (this.currentSynthesisTasks.has(messageId)) {
      this.currentSynthesisTasks.get(messageId)?.abort();
      this.currentSynthesisTasks.delete(messageId);
    }

    // 再生中の音声を確認
    if (this.audioQueue.length > 0 && this.audioQueue[0].id === messageId) {
      this.audioQueue[0].audio.pause();
      this.audioQueue.shift();
      this.isPlaying = false;
      
      // リスナーに通知
      const listeners = this.playbackCompleteListeners.get(messageId);
      if (listeners) {
        console.log(`メッセージID ${messageId} の再生キャンセル - リスナーを実行`);
        listeners.forEach(listener => listener());
      }
      
      // グローバルリスナーにも通知
      this.globalPlaybackListeners.forEach(listener => listener(messageId));
      
      // リスナーを削除（一回限りのイベント）
      this.playbackCompleteListeners.delete(messageId);
    }

    // 残りのキューからも削除
    this.audioQueue = this.audioQueue.filter((item) => item.id !== messageId);

    // 再生を再開
    if (this.audioQueue.length > 0 && !this.isPlaying) {
      this.playNextAudio();
    }
  }

  /**
   * すべての音声再生を停止
   *
   * 進行中のすべての音声合成タスクをキャンセルし、再生中の音声を停止して、
   * 再生キューを空にします。ユーザーが音声を無効にした場合や、ページ遷移時などに
   * 呼び出されます。
   */
  public stopAllAudio(): void {
    // すべての合成タスクをキャンセル
    this.currentSynthesisTasks.forEach((controller) => {
      controller.abort();
    });
    this.currentSynthesisTasks.clear();
    
    // 再生中のメッセージIDを記録（リスナー通知用）
    const activeMessageIds = new Set<string>();
    this.audioQueue.forEach(item => activeMessageIds.add(item.id));

    // 再生中の音声を停止
    if (this.audioQueue.length > 0) {
      this.audioQueue[0].audio.pause();
    }

    // キューをクリア
    this.audioQueue = [];
    this.isPlaying = false;
    
    // すべてのメッセージIDに対応するリスナーに通知
    activeMessageIds.forEach(messageId => {
      const listeners = this.playbackCompleteListeners.get(messageId);
      if (listeners) {
        console.log(`メッセージID ${messageId} の再生中断 - リスナーを実行`);
        listeners.forEach(listener => listener());
      }
      
      // グローバルリスナーにも通知
      this.globalPlaybackListeners.forEach(listener => listener(messageId));
      
      // リスナーを削除（一回限りのイベント）
      this.playbackCompleteListeners.delete(messageId);
    });
    
    console.log("すべての音声再生を停止しました");
  }

  /**
   * 音声が有効かどうかを取得
   *
   * 現在の音声再生の有効/無効状態を返します。
   *
   * @returns {boolean} 音声が有効な場合はtrue、無効な場合はfalse
   */
  public isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  /**
   * 現在の音量を取得
   *
   * 設定されている現在の音量レベルを返します。
   *
   * @returns {number} 音量 (0.0-1.0の範囲、0.0は無音、1.0は最大音量)
   */
  public getVolume(): number {
    return this.audioVolume;
  }
  
  /**
   * 特定のメッセージIDの音声再生完了時に実行されるリスナーを追加
   * 
   * @param messageId 監視するメッセージID
   * @param callback 再生完了時に実行するコールバック関数
   */
  public addPlaybackCompleteListener(messageId: string, callback: () => void): void {
    if (!this.playbackCompleteListeners.has(messageId)) {
      this.playbackCompleteListeners.set(messageId, new Set());
    }
    this.playbackCompleteListeners.get(messageId)?.add(callback);
    console.log(`メッセージID ${messageId} の再生完了リスナーを追加しました`);
  }
  
  /**
   * 特定のメッセージIDの音声再生完了リスナーを削除
   * 
   * @param messageId 対象のメッセージID
   * @param callback 削除するコールバック関数（省略した場合はすべてのリスナーを削除）
   */
  public removePlaybackCompleteListener(messageId: string, callback?: () => void): void {
    if (!this.playbackCompleteListeners.has(messageId)) return;
    
    if (callback) {
      this.playbackCompleteListeners.get(messageId)?.delete(callback);
    } else {
      this.playbackCompleteListeners.delete(messageId);
    }
    console.log(`メッセージID ${messageId} の再生完了リスナーを削除しました`);
  }
  
  /**
   * すべての音声再生完了イベントを監視するグローバルリスナーを追加
   * 
   * @param callback 再生完了時に実行するコールバック関数（メッセージIDが引数として渡される）
   */
  public addGlobalPlaybackListener(callback: (messageId: string) => void): void {
    this.globalPlaybackListeners.add(callback);
    console.log("グローバル再生完了リスナーを追加しました");
  }
  
  /**
   * グローバル再生完了リスナーを削除
   * 
   * @param callback 削除するコールバック関数
   */
  public removeGlobalPlaybackListener(callback: (messageId: string) => void): void {
    this.globalPlaybackListeners.delete(callback);
    console.log("グローバル再生完了リスナーを削除しました");
  }
}
