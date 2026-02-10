import { ApiService } from './ApiService';
import {
  AudioAnalysisApiResponse,
  AudioUploadUrlResponse,
  AudioAnalysisStatusResponse,
  AudioAnalysisStartResponse,
  AudioAnalysisLanguage,
  SupportedAudioFormat
} from '../types/audioAnalysis';

/**
 * 音声分析サービス
 * 
 * 音声ファイルのアップロード、分析処理、結果取得を管理します。
 * ApiServiceを使用してAPI呼び出しを行います。
 */
export class AudioAnalysisService {
  private static instance: AudioAnalysisService;
  private apiService: ApiService;

  /**
   * コンストラクタ - シングルトンパターン
   */
  private constructor() {
    console.log("=== 音声分析サービス初期化 ===");
    this.apiService = ApiService.getInstance();
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): AudioAnalysisService {
    if (!AudioAnalysisService.instance) {
      AudioAnalysisService.instance = new AudioAnalysisService();
    }
    return AudioAnalysisService.instance;
  }

  /**
   * 音声ファイルアップロード用の署名付きURLを生成
   * 
   * @param fileName ファイル名
   * @param contentType 音声ファイルの形式
   * @param language 言語設定
   * @returns 署名付きURLとセッション情報
   */
  async generateUploadUrl(
    fileName: string,
    contentType: SupportedAudioFormat,
    language: AudioAnalysisLanguage
  ): Promise<AudioUploadUrlResponse> {
    try {
      console.log('=== 音声アップロードURL生成開始 ===');
      console.log(`ファイル名: ${fileName}, 形式: ${contentType}, 言語: ${language}`);

      const response = await this.apiService.generateAudioUploadUrl(
        fileName,
        contentType,
        language
      );

      console.log('音声アップロードURL生成完了:', response);
      return response;
    } catch (error) {
      console.error('=== 音声アップロードURL生成エラー ===');
      console.error('エラー詳細:', error);
      throw error;
    }
  }

  /**
   * 音声ファイルをS3にアップロード（POSTフォーム方式）
   * 
   * @param file 音声ファイル
   * @param uploadUrl 署名付きURL
   * @param formData POSTフォーム用データ
   * @param onProgress アップロード進行状況コールバック
   */
  async uploadAudioFile(
    file: File,
    uploadUrl: string,
    formData: Record<string, string>,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      console.log('=== 音声ファイルアップロード開始（POSTフォーム方式）===');
      console.log(`ファイル名: ${file.name}, サイズ: ${file.size}`);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log('音声ファイルアップロード完了');
            resolve();
          } else {
            console.error(`アップロード失敗: ${xhr.status} - ${xhr.statusText}`);
            reject(new Error(`アップロードに失敗しました: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          console.error('アップロード中にエラーが発生');
          reject(new Error('アップロード中にエラーが発生しました'));
        });

        // FormDataオブジェクトを作成
        const formDataObj = new FormData();

        // 署名付きフォームデータのフィールドを追加
        Object.entries(formData).forEach(([key, value]) => {
          formDataObj.append(key, value);
        });

        // ファイルを最後に追加（S3の要求に従い、fileフィールドは最後）
        formDataObj.append("file", file);

        xhr.open('POST', uploadUrl);
        // Content-Typeヘッダーは設定しない（FormDataが自動的に適切な値を設定）
        xhr.send(formDataObj);
      });
    } catch (error) {
      console.error('=== 音声ファイルアップロードエラー ===');
      console.error('エラー詳細:', error);
      throw error;
    }
  }

  /**
   * 音声分析を開始
   * 
   * @param sessionId セッションID
   * @param audioKey 音声ファイルのS3キー
   * @param scenarioId シナリオID
   * @param language 言語設定
   * @returns 分析開始結果
   */
  async startAnalysis(
    sessionId: string,
    audioKey: string,
    scenarioId: string,
    language: AudioAnalysisLanguage
  ): Promise<AudioAnalysisStartResponse> {
    try {
      console.log('=== 音声分析開始 ===');
      console.log(`セッションID: ${sessionId}, シナリオID: ${scenarioId}, 言語: ${language}`);

      const response = await this.apiService.startAudioAnalysis(
        sessionId,
        audioKey,
        scenarioId,
        language
      );

      console.log('音声分析開始完了:', response);

      // 型を適合させる
      return {
        success: response.success,
        sessionId: response.sessionId,
        executionArn: response.executionArn,
        status: response.status as AudioAnalysisStartResponse['status'],
        message: response.message
      };
    } catch (error) {
      console.error('=== 音声分析開始エラー ===');
      console.error('エラー詳細:', error);
      throw error;
    }
  }

  /**
   * 音声分析の状況を確認
   * 
   * @param sessionId セッションID
   * @returns 分析状況
   */
  async getAnalysisStatus(sessionId: string): Promise<AudioAnalysisStatusResponse> {
    try {
      const response = await this.apiService.getAudioAnalysisStatus(sessionId);

      // 型を適合させる
      return {
        success: response.success,
        sessionId: response.sessionId,
        status: response.status as AudioAnalysisStatusResponse['status'],
        currentStep: response.currentStep as AudioAnalysisStatusResponse['currentStep'],
        hasResult: response.hasResult,
        progress: response.progress as unknown as AudioAnalysisStatusResponse['progress']
      };
    } catch (error) {
      console.error('分析状況確認エラー:', error);
      throw error;
    }
  }

  /**
   * 音声分析結果を取得
   * 
   * @param sessionId セッションID
   * @returns 分析結果
   */
  async getAnalysisResults(sessionId: string): Promise<AudioAnalysisApiResponse> {
    try {
      console.log('=== 音声分析結果取得開始 ===');
      console.log(`セッションID: ${sessionId}`);

      const response = await this.apiService.getAudioAnalysisResults(sessionId);

      console.log('音声分析結果取得完了:', response);

      // 型を適合させる
      return {
        success: response.success,
        sessionId: response.sessionId,
        audioAnalysis: response.audioAnalysis as AudioAnalysisApiResponse['audioAnalysis'],
        scenarioId: response.scenarioId,
        language: response.language,
        createdAt: response.createdAt
      };
    } catch (error) {
      console.error('=== 音声分析結果取得エラー ===');
      console.error('エラー詳細:', error);
      throw error;
    }
  }

  /**
   * 音声ファイルのバリデーション
   * 
   * @param file 音声ファイル
   * @param maxSizeInMB 最大ファイルサイズ（MB）
   * @returns バリデーション結果
   */
  validateAudioFile(file: File, maxSizeInMB: number = 100): {
    isValid: boolean;
    error?: string;
    contentType?: SupportedAudioFormat;
  } {
    console.log('=== 音声ファイルバリデーション開始 ===');
    console.log(`ファイル名: ${file.name}, サイズ: ${file.size}, タイプ: ${file.type}`);

    // ファイルサイズチェック
    const maxSize = maxSizeInMB * 1024 * 1024;
    if (file.size > maxSize) {
      console.error(`ファイルサイズ超過: ${file.size} > ${maxSize}`);
      return {
        isValid: false,
        error: `ファイルサイズは${maxSizeInMB}MB以下にしてください`
      };
    }

    // 音声形式チェック
    const supportedTypes: SupportedAudioFormat[] = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/flac',
      'audio/ogg'
    ];

    let contentType: SupportedAudioFormat = 'audio/mpeg';

    // MIMEタイプによる判定
    if (supportedTypes.includes(file.type as SupportedAudioFormat)) {
      contentType = file.type as SupportedAudioFormat;
    } else {
      // 拡張子による判定
      const extension = file.name.toLowerCase().split('.').pop();
      const extensionMap: Record<string, SupportedAudioFormat> = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'ogg': 'audio/ogg'
      };

      if (extension && extensionMap[extension]) {
        contentType = extensionMap[extension];
        console.log(`拡張子による形式判定: ${extension} -> ${contentType}`);
      } else {
        console.error(`対応していない音声形式: ${file.type}, 拡張子: ${extension}`);
        return {
          isValid: false,
          error: '対応していない音声形式です。MP3、WAV、FLAC、OGG形式をご利用ください'
        };
      }
    }

    console.log('音声ファイルバリデーション完了:', { contentType });
    return {
      isValid: true,
      contentType
    };
  }

  /**
   * 分析進行状況をポーリングで監視
   * 
   * @param sessionId セッションID
   * @param onProgress 進行状況更新コールバック
   * @param maxAttempts 最大試行回数
   * @param intervalMs ポーリング間隔（ミリ秒）
   * @returns 最終分析結果
   */
  async pollAnalysisStatus(
    sessionId: string,
    onProgress: (status: AudioAnalysisStatusResponse) => void,
    maxAttempts: number = 120, // 最大20分（10秒間隔 × 120回）
    intervalMs: number = 10000 // 10秒間隔
  ): Promise<AudioAnalysisApiResponse> {
    let attempts = 0;

    console.log('=== 音声分析ポーリング開始 ===');
    console.log(`セッションID: ${sessionId}, 最大試行回数: ${maxAttempts}, 間隔: ${intervalMs}ms`);

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          attempts++;
          console.log(`ポーリング試行: ${attempts}/${maxAttempts}`);

          const status = await this.getAnalysisStatus(sessionId);
          onProgress(status);

          if (status.status === 'COMPLETED') {
            console.log('音声分析完了 - 結果を取得中');
            // 完了時は結果を取得して返す
            const result = await this.getAnalysisResults(sessionId);
            console.log('音声分析結果取得完了');
            resolve(result);
            return;
          } else if (status.status === 'FAILED' || status.currentStep === 'ERROR') {
            console.error('音声分析失敗:', status.progress?.error);
            reject(new Error(`分析に失敗しました: ${status.progress?.error || '詳細不明'}`));
            return;
          } else if (attempts >= maxAttempts) {
            console.error('音声分析ポーリングタイムアウト');
            reject(new Error('分析がタイムアウトしました'));
            return;
          }

          // まだ完了していない場合は次のポーリングをスケジュール
          setTimeout(poll, intervalMs);

        } catch (error) {
          console.error('ポーリング中にエラー:', error);
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * 音声分析を実行（アップロード～結果取得までの統合処理）
   * 
   * @param file 音声ファイル
   * @param scenarioId シナリオID
   * @param language 言語設定
   * @param onUploadProgress アップロード進行状況コールバック
   * @param onAnalysisProgress 分析進行状況コールバック
   * @returns 分析結果
   */
  async executeFullAnalysis(
    file: File,
    scenarioId: string,
    language: AudioAnalysisLanguage,
    onUploadProgress?: (progress: number) => void,
    onAnalysisProgress?: (status: AudioAnalysisStatusResponse) => void
  ): Promise<AudioAnalysisApiResponse> {
    try {
      console.log('=== 音声分析統合処理開始 ===');

      // 1. ファイルバリデーション
      const validation = this.validateAudioFile(file);
      if (!validation.isValid) {
        throw new Error(validation.error || 'ファイルバリデーションに失敗しました');
      }

      // 2. アップロードURL生成
      const uploadInfo = await this.generateUploadUrl(
        file.name,
        validation.contentType!,
        language
      );

      // 3. ファイルアップロード（POSTフォーム方式）
      await this.uploadAudioFile(
        file,
        uploadInfo.uploadUrl,
        (uploadInfo as AudioUploadUrlResponse & { formData: Record<string, string> }).formData, // POSTフォーム用データ
        onUploadProgress
      );

      // 4. 分析開始
      const analysisStart = await this.startAnalysis(
        uploadInfo.sessionId,
        uploadInfo.audioKey,
        scenarioId,
        language
      );

      if (!analysisStart.success) {
        throw new Error(analysisStart.message || '分析開始に失敗しました');
      }

      // 5. ポーリングで結果を監視
      const result = await this.pollAnalysisStatus(
        uploadInfo.sessionId,
        onAnalysisProgress || (() => { })
      );

      console.log('=== 音声分析統合処理完了 ===');
      return result;

    } catch (error) {
      console.error('=== 音声分析統合処理エラー ===');
      console.error('エラー詳細:', error);

      if (error instanceof Error) {
        throw new Error(`音声分析処理に失敗しました: ${error.message}`);
      } else {
        throw new Error('音声分析処理に失敗しました');
      }
    }
  }
}
