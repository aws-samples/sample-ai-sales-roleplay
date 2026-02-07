import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
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
  engine?: string;
  languageCode?: string;
  textType?: 'text' | 'ssml';
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
async function synthesizeSpeech(
  text: string,
  requestedVoiceId: string,
  requestedEngine: string,
  languageCode: string,
  textType: string,
  outputFormat: string
): Promise<{ success: true; audioStream: any; finalVoiceId: string; finalEngine: string } | { success: false; error: string }> {

  // まず希望の音声・エンジンを試行
  const initialStrategy = { voiceId: requestedVoiceId, engine: requestedEngine };

  try {
    console.log(`音声合成試行: ${requestedVoiceId} + ${requestedEngine}`);

    let lexiconName = "ja"
    if (languageCode.startsWith('ja')) lexiconName = `${envId}ja`
    if (languageCode.startsWith('en')) lexiconName = `${envId}en`

    const pollyParams = {
      Engine: requestedEngine as 'standard' | 'neural',
      OutputFormat: outputFormat as 'json' | 'mp3' | 'ogg_vorbis' | 'pcm',
      Text: text,
      TextType: textType as any,
      VoiceId: requestedVoiceId,
      LanguageCode: languageCode,
      // 言語コードに基づいて適切なLexiconを適用
      LexiconNames: [lexiconName],
    } as any;

    console.log('Pollyパラメータ:', JSON.stringify(pollyParams));

    const pollyCommand = new SynthesizeSpeechCommand(pollyParams);
    const pollyResponse = await pollyClient.send(pollyCommand);

    if (pollyResponse.AudioStream) {
      console.log(`音声合成成功: ${requestedVoiceId} + ${requestedEngine}`);
      return {
        success: true,
        audioStream: pollyResponse.AudioStream,
        finalVoiceId: requestedVoiceId,
        finalEngine: requestedEngine
      };
    }
  } catch (error) {
    console.warn('音声合成失敗:', { voiceId: requestedVoiceId, engine: requestedEngine }, error);
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
    let lexiconName = "ja";
    if (languageCode.startsWith('ja')) lexiconName = `${envId}ja`;
    if (languageCode.startsWith('en')) lexiconName = `${envId}en`;

    const params = {
      Engine: engine as 'standard' | 'neural',
      OutputFormat: 'json' as const,
      Text: text,
      TextType: textType as any,
      VoiceId: voiceId,
      LanguageCode: languageCode,
      LexiconNames: [lexiconName],
      SpeechMarkTypes: ['viseme'] as any,
    } as any;

    const command = new SynthesizeSpeechCommand(params);
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

    console.log(`Speech Marks取得成功: ${visemes.length}件のviseme`);
    return visemes;
  } catch (error) {
    console.warn('Speech Marks取得失敗（音声合成は続行）:', error);
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
    console.log('イベント受信:', JSON.stringify(event));

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
    const requestedEngine = body.engine || 'neural'; // デフォルトはニューラルエンジン
    const languageCode = body.languageCode || 'ja-JP';
    const textType = body.textType || 'text'; // text または ssml
    const outputFormat = 'mp3';

    const synthesisResult = await synthesizeSpeech(
      text, requestedVoiceId, requestedEngine, languageCode, textType, outputFormat
    );

    // Speech Marks（viseme）を並列取得（失敗しても音声合成は続行）
    let visemes: VisemeEntry[] = [];
    const visemePromise = getSpeechMarks(
      text, requestedVoiceId, requestedEngine, languageCode, textType
    ).then(v => { visemes = v; }).catch(() => { /* viseme取得失敗は無視 */ });

    // viseme取得を待つ（最大2秒）
    await Promise.race([visemePromise, new Promise(resolve => setTimeout(resolve, 2000))]);

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
      console.log('既存の音声ファイルが見つかりました:', fileName);
    } catch (err) {
      audioExists = false;
      console.log('新しい音声ファイルを作成します');
    }

    // ファイルが存在しない場合のみS3にアップロード
    if (!audioExists) {
      try {
        // AudioStreamをBufferに変換
        console.log('AudioStreamをBufferに変換中...');
        const audioBuffer = await streamToBuffer(synthesisResult.audioStream);
        console.log('Buffer変換成功:', audioBuffer.length, 'bytes');

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

        console.log('S3アップロード成功:', fileName);
      } catch (s3Error) {
        console.error('S3アップロードエラー:', s3Error);
        return createResponse(500, {
          success: false,
          error: 'S3アップロードに失敗しました',
          message: s3Error instanceof Error ? s3Error.message : String(s3Error)
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

    console.log('署名付きURL生成成功');

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
      error: '音声合成中にエラーが発生しました',
      message: error instanceof Error ? error.message : String(error)
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
      'Access-Control-Allow-Origin': '*', // CORS対応
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
    },
    body: JSON.stringify(body)
  };
}
