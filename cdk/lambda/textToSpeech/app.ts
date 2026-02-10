import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PollyClient, SynthesizeSpeechCommand, TextType, Engine, OutputFormat, SpeechMarkType, VoiceId, LanguageCode } from '@aws-sdk/client-polly';
import * as crypto from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// S3とPollyクライアントを初期化
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const pollyClient = new PollyClient({ region: process.env.AWS_REGION });

// 環境変数からS3バケット名を取得
const bucketName = process.env.STORAGE_BUCKET;
const envId = process.env.ENV_ID

// 署名付きURLの有効期限（秒）
const URL_EXPIRATION = 300; // 5分

interface TextToSpeechRequest {
  text: string;
  voiceId?: string;
  engine?: string; // 無視される（voiceIdから自動選択）
  languageCode?: string;
  textType?: 'text' | 'ssml';
}

/**
 * generative対応モデルのセット
 * これらのvoiceIdはgenerativeエンジンを優先使用する
 * 重要: フロントエンドの frontend/src/config/pollyVoices.ts の GENERATIVE_VOICE_IDS と同期が必要
 */
const GENERATIVE_VOICE_IDS = new Set([
  'Danielle', 'Joanna', 'Salli', 'Matthew', 'Ruth', 'Stephen'
]);

/**
 * voiceIdに応じたエンジンを自動選択（generative優先）
 */
function getPreferredEngine(voiceId: string): string {
  return GENERATIVE_VOICE_IDS.has(voiceId) ? 'generative' : 'neural';
}

interface VisemeEntry {
  time: number;
  type: string;
  value: string;
}

interface TextToSpeechResponse {
  success: boolean;
  audioUrl?: string;
  expiresIn?: number;
  text?: string;
  voiceId?: string;
  engine?: string;
  fileName?: string;
  visemes?: VisemeEntry[];
  error?: string;
  message?: string;
}

/**
 * 音声合成を実行（フォールバック機能付き）
 */
function getLexiconName(languageCode: string): string {
  if (languageCode.startsWith('ja')) return `${envId}ja`;
  if (languageCode.startsWith('en')) return `${envId}en`;
  return 'ja';
}

async function synthesizeSpeech(
  text: string,
  requestedVoiceId: string,
  requestedEngine: string,
  languageCode: string,
  textType: string,
  outputFormat: string
): Promise<{ success: true; audioStream: NodeJS.ReadableStream; finalVoiceId: string; finalEngine: string } | { success: false; error: string }> {

  try {
    const pollyCommand = new SynthesizeSpeechCommand({
      Engine: requestedEngine as Engine,
      OutputFormat: outputFormat as OutputFormat,
      Text: text,
      TextType: textType as TextType,
      VoiceId: requestedVoiceId as VoiceId,
      LanguageCode: languageCode as LanguageCode,
      LexiconNames: [getLexiconName(languageCode)],
    });

    const pollyResponse = await pollyClient.send(pollyCommand);

    if (pollyResponse.AudioStream) {
      return {
        success: true,
        audioStream: pollyResponse.AudioStream as unknown as NodeJS.ReadableStream,
        finalVoiceId: requestedVoiceId,
        finalEngine: requestedEngine
      };
    }
  } catch (error) {
    // 音声合成失敗時はエラーレスポンスを返す
  }
  return {
    success: false,
    error: `音声合成失敗: ${requestedVoiceId} + ${requestedEngine}`
  }
}

/**
 * Speech Marks（viseme）を取得
 */
async function getSpeechMarks(
  text: string,
  voiceId: string,
  engine: string,
  languageCode: string,
  textType: string
): Promise<VisemeEntry[]> {
  try {
    const command = new SynthesizeSpeechCommand({
      Engine: engine as Engine,
      OutputFormat: 'json' as OutputFormat,
      Text: text,
      TextType: textType as TextType,
      VoiceId: voiceId as VoiceId,
      LanguageCode: languageCode as LanguageCode,
      LexiconNames: [getLexiconName(languageCode)],
      SpeechMarkTypes: ['viseme' as SpeechMarkType],
    });

    const response = await pollyClient.send(command);

    if (!response.AudioStream) return [];

    const buffer = await streamToBuffer(response.AudioStream);
    const jsonLines = buffer.toString('utf-8').trim().split('\n');

    const visemes: VisemeEntry[] = jsonLines
      .filter(line => line.trim())
      .map(line => {
        try {
          const parsed = JSON.parse(line);
          return { time: parsed.time, type: parsed.type, value: parsed.value };
        } catch {
          return null;
        }
      })
      .filter((v): v is VisemeEntry => v !== null && v.type === 'viseme');

    return visemes;
  } catch (error) {
    return [];
  }
}

/**
 * AudioStreamをBufferに変換
 */
async function streamToBuffer(stream: any): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) {
    return stream;
  }

  const chunks: Uint8Array[] = [];

  if (stream && typeof stream.on === 'function') {
    // Readable stream の場合
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: any) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  } else if (stream instanceof Uint8Array) {
    return Buffer.from(stream);
  } else if (typeof stream === 'string') {
    return Buffer.from(stream);
  }

  // その他の場合は直接BufferとしてTRY
  try {
    return Buffer.from(stream);
  } catch (error) {
    throw new Error(`AudioStreamの変換に失敗: ${typeof stream}`);
  }
}

/**
 * テキストを音声に変換してS3に保存し、署名付きURLを返すLambda関数
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {

    // リクエストボディのパース
    let body: TextToSpeechRequest;
    if (typeof event.body === 'string') {
      body = JSON.parse(event.body);
    } else if (event.body) {
      body = event.body as TextToSpeechRequest;
    } else {
      body = { text: '' }; // デフォルト値を設定
    }

    // パラメータを検証
    if (!body || !body.text) {
      return createResponse(400, {
        success: false,
        error: 'text パラメータが必要です'
      });
    }

    const text = body.text;
    const requestedVoiceId = body.voiceId || 'Takumi'; // デフォルトは男性音声

    // WR-001: voiceIdバリデーション
    const VALID_VOICE_IDS = new Set([
      'Takumi', 'Kazuha', 'Tomoko',
      'Danielle', 'Gregory', 'Ivy', 'Joanna', 'Kendra',
      'Kimberly', 'Salli', 'Joey', 'Justin', 'Kevin',
      'Matthew', 'Ruth', 'Stephen'
    ]);
    if (!VALID_VOICE_IDS.has(requestedVoiceId)) {
      return createResponse(400, { success: false, error: '無効なvoiceIdです' });
    }

    const requestedEngine = getPreferredEngine(requestedVoiceId); // voiceIdに応じてエンジン自動選択
    const languageCode = body.languageCode || 'ja-JP';
    const textType = body.textType || 'text'; // text または ssml
    const outputFormat = 'mp3';

    const [synthesisResult, visemes] = await Promise.all([
      synthesizeSpeech(
        text, requestedVoiceId, requestedEngine, languageCode, textType, outputFormat
      ),
      getSpeechMarks(
        text, requestedVoiceId, requestedEngine, languageCode, textType
      ).catch((error) => {
        console.error('Viseme取得エラー（音声合成は続行）:', error);
        return [] as VisemeEntry[];
      }),
    ]);

    if (!synthesisResult.success) {
      return createResponse(500, {
        success: false,
        error: '音声合成に失敗しました',
        message: synthesisResult.error
      });
    }

    // 最終的に使用された音声・エンジンでファイル名を生成
    const contentHash = crypto
      .createHash('md5')
      .update(`${text}_${synthesisResult.finalVoiceId}_${synthesisResult.finalEngine}_${languageCode}_${textType}`)
      .digest('hex');

    const fileName = `speech/${contentHash}.${outputFormat}`;

    // 既存ファイルの確認
    let audioExists = false;
    try {
      await s3Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: fileName,
      }));
      audioExists = true;
    } catch (err) {
      audioExists = false;
    }

    // ファイルが存在しない場合のみS3にアップロード
    if (!audioExists) {
      try {
        // AudioStreamをBufferに変換
        const audioBuffer = await streamToBuffer(synthesisResult.audioStream);

        // S3に音声ファイルをアップロード
        const s3Params = {
          Bucket: bucketName!,
          Key: fileName,
          Body: audioBuffer,
          ContentType: `audio/${outputFormat}`,
          ContentLength: audioBuffer.length,
          CacheControl: 'max-age=31536000' // 1年間のキャッシュ
        };

        const s3Command = new PutObjectCommand(s3Params);
        await s3Client.send(s3Command);
      } catch (s3Error) {
        console.error('S3アップロードエラー:', s3Error);
        return createResponse(500, {
          success: false,
          error: 'S3アップロードに失敗しました'
        });
      }
    }

    // 署名付きURLを生成
    const getObjectParams = {
      Bucket: bucketName!,
      Key: fileName
    };

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand(getObjectParams),
      { expiresIn: URL_EXPIRATION }
    );

    // 成功レスポンスを返す
    return createResponse(200, {
      success: true,
      audioUrl: signedUrl,
      expiresIn: URL_EXPIRATION,
      text,
      voiceId: synthesisResult.finalVoiceId,
      engine: synthesisResult.finalEngine,
      fileName,
      visemes: visemes.length > 0 ? visemes : undefined
    });
  } catch (error) {
    console.error('音声合成エラー:', error);
    return createResponse(500, {
      success: false,
      error: '音声合成中にエラーが発生しました'
    });
  }
};

/**
 * API Gatewayのレスポンスを作成
 */
function createResponse(statusCode: number, body: TextToSpeechResponse): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST'
    },
    body: JSON.stringify(body)
  };
}
