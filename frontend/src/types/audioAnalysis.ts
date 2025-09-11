/**
 * 音声分析関連の型定義
 */

/**
 * 話者情報
 */
export interface SpeakerInfo {
  speaker_label: string; // Amazon Transcribeが付与した話者ラベル（例：spk_0, spk_1）
  identified_role: string; // 特定された役割（salesperson, customer, observer）
  confidence: number; // 役割特定の信頼度（0.0-1.0）
  sample_utterances: string[]; // この話者の代表的な発言例
}

/**
 * 会話セグメント
 */
export interface ConversationSegment {
  start_time: number; // 開始時刻（秒）
  end_time: number; // 終了時刻（秒）
  speaker_label: string; // 話者ラベル
  text: string; // 発言内容
  role: string; // 特定された役割
}

/**
 * 音声分析結果
 */
export interface AudioAnalysisResult {
  speakers: SpeakerInfo[]; // 検出された話者情報
  segments: ConversationSegment[]; // 時系列の会話セグメント
  summary: {
    total_speakers: number;
    total_segments: number;
    speaker_distribution: Record<string, number>;
    dominant_speaker?: string;
  }; // 分析サマリー
  language_detected: string; // 検出された言語コード
}

/**
 * 音声分析API レスポンス
 */
export interface AudioAnalysisApiResponse {
  success: boolean;
  sessionId: string;
  audioAnalysis?: AudioAnalysisResult;
  scenarioId?: string;
  language?: string;
  createdAt?: string;
}

/**
 * アップロードURL生成レスポンス
 */
export interface AudioUploadUrlResponse {
  success: boolean;
  uploadUrl: string;
  formData: Record<string, string>;
  audioKey: string;
  sessionId: string;
  language: string;
}

/**
 * 分析状況レスポンス
 */
export interface AudioAnalysisStatusResponse {
  success: boolean;
  sessionId: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED' | 'NOT_STARTED';
  currentStep?: 'START' | 'TRANSCRIBING' | 'ANALYZING' | 'SAVING' | 'ERROR';
  hasResult: boolean;
  progress?: {
    currentStep: string;
    status: string;
    updatedAt?: string;
    transcribeJobName?: string;
    error?: string;
  };
}

/**
 * 分析開始レスポンス
 */
export interface AudioAnalysisStartResponse {
  success: boolean;
  sessionId: string;
  executionArn?: string;
  status: 'STARTED' | 'COMPLETED';
  message?: string;
}

/**
 * 音声分析用の言語設定
 */
export type AudioAnalysisLanguage = 'ja' | 'en';

/**
 * 対応音声形式
 */
export type SupportedAudioFormat = 
  | 'audio/mpeg' 
  | 'audio/mp3' 
  | 'audio/wav' 
  | 'audio/flac' 
  | 'audio/ogg';

/**
 * 音声ファイル情報
 */
export interface AudioFileInfo {
  file: File;
  fileName: string;
  contentType: SupportedAudioFormat;
  size: number;
}
