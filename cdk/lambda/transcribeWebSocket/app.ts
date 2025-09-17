import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ApiGatewayManagementApi, TranscribeStreamingClient, StartStreamTranscriptionCommand } from '@aws-sdk/client-transcribe-streaming';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

// 環境変数
const TABLE_NAME = process.env.CONNECTION_TABLE_NAME || '';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

// DynamoDBクライアントの初期化
const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// TranscribeStreamingクライアントの初期化
const transcribeClient = new TranscribeStreamingClient({ region: REGION });

// 接続中のセッションを保持するマップ
const activeTranscribeSessions = new Map<string, any>();

/**
 * WebSocket接続ハンドラ
 * クライアント接続時に呼び出され、接続IDとセッションIDをDynamoDBに保存
 */
export const connectHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('WebSocket接続:', event);
  
  try {
    const connectionId = event.requestContext.connectionId;
    const queryParams = event.queryStringParameters || {};
    const sessionId = queryParams.session || 'unknown';
    
    if (!connectionId) {
      return { statusCode: 400, body: 'Connection ID missing' };
    }
    
    // 接続情報をDynamoDBに保存
    await ddbDocClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        connectionId,
        sessionId,
        ttl: Math.floor(Date.now() / 1000) + 3600, // 1時間後に自動削除
        createdAt: new Date().toISOString()
      }
    }));
    
    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    console.error('接続エラー:', error);
    return { statusCode: 500, body: 'Connection failed' };
  }
};

/**
 * WebSocket切断ハンドラ
 * クライアント切断時に呼び出され、接続IDをDynamoDBから削除
 */
export const disconnectHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('WebSocket切断:', event);
  
  try {
    const connectionId = event.requestContext.connectionId;
    if (!connectionId) {
      return { statusCode: 400, body: 'Connection ID missing' };
    }
    
    // Transcribeセッションがあれば終了
    if (activeTranscribeSessions.has(connectionId)) {
      const transcribeSession = activeTranscribeSessions.get(connectionId);
      if (transcribeSession && transcribeSession.abort) {
        try {
          transcribeSession.abort();
        } catch (e) {
          console.warn('Transcribeセッションの終了エラー:', e);
        }
      }
      activeTranscribeSessions.delete(connectionId);
    }
    
    // 接続情報をDynamoDBから削除
    await ddbDocClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { connectionId }
    }));
    
    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('切断エラー:', error);
    return { statusCode: 500, body: 'Disconnect processing failed' };
  }
};

/**
 * 音声データ受信ハンドラ
 * クライアントから送信された音声データを受け取り、Amazon Transcribeに送信
 */
export const defaultHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('メッセージ受信:', event.body ? event.body.substring(0, 100) + '...' : 'No body');
  
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: 'Connection ID missing' };
  }
  
  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;
    
    // 音声データ送信アクション
    if (action === 'sendAudio' && body.audio) {
      await processAudioData(connectionId, body.audio, event.requestContext.domainName, event.requestContext.stage);
      return { statusCode: 200, body: 'Audio data received' };
    }
    
    return { statusCode: 400, body: 'Invalid action' };
  } catch (error) {
    console.error('メッセージ処理エラー:', error);
    return { statusCode: 500, body: 'Message processing failed' };
  }
};

/**
 * 音声データをTranscribeに送信し、結果をクライアントに返す
 */
async function processAudioData(
  connectionId: string,
  base64Audio: string,
  domainName: string,
  stage: string
): Promise<void> {
  // APIクライアントの作成
  const apiClient = new ApiGatewayManagementApi({
    region: REGION,
    endpoint: `https://${domainName}/${stage}`
  });
  
  try {
    // Base64音声データをデコード
    const audioBuffer = Buffer.from(base64Audio, 'base64');
    
    // TranscribeStreamingセッションが存在しなければ作成
    if (!activeTranscribeSessions.has(connectionId)) {
      startTranscribeSession(connectionId, domainName, stage);
    }
    
    // 音声アクティビティを通知
    await sendToClient(apiClient, connectionId, {
      voiceActivity: true
    });
    
  } catch (error) {
    console.error('音声処理エラー:', error);
    try {
      await sendToClient(apiClient, connectionId, {
        error: {
          code: 'ProcessingError',
          message: 'Audio processing failed'
        }
      });
    } catch (e) {
      console.error('エラー通知送信失敗:', e);
    }
  }
}

/**
 * Transcribeストリーミングセッションを開始
 */
function startTranscribeSession(connectionId: string, domainName: string, stage: string): void {
  const apiClient = new ApiGatewayManagementApi({
    region: REGION,
    endpoint: `https://${domainName}/${stage}`
  });
  
  // Transcribeストリーミング設定
  const command = new StartStreamTranscriptionCommand({
    LanguageCode: 'ja-JP', // 日本語
    MediaEncoding: 'pcm',
    MediaSampleRateHertz: 16000,
    AudioStream: {
      AudioEvent: {
        AudioChunk: Buffer.from([]) // 空のバッファで初期化
      }
    }
  });
  
  // 応答ハンドラの設定
  const responseHandler = {
    onEvent: async (event: any) => {
      try {
        // 結果の処理
        const results = event.TranscriptEvent?.Results || [];
        
        for (const result of results) {
          const transcript = result.Alternatives?.[0]?.Transcript || '';
          const isFinal = result.IsPartial === false;
          
          if (transcript.trim()) {
            await sendToClient(apiClient, connectionId, {
              transcript,
              isFinal
            });
            
            // 音声アクティビティの検出
            if (transcript.trim()) {
              await sendToClient(apiClient, connectionId, {
                voiceActivity: true
              });
            }
          }
        }
      } catch (error) {
        console.error('Transcribe結果処理エラー:', error);
      }
    },
    onError: async (error: any) => {
      console.error('Transcribeストリーミングエラー:', error);
      try {
        await sendToClient(apiClient, connectionId, {
          error: {
            code: 'TranscribeError',
            message: error.message || 'Transcription service error'
          }
        });
      } catch (e) {
        console.error('エラー通知送信失敗:', e);
      }
    }
  };
  
  // Transcribeセッションをマップに保存
  const transcribeSession = { abort: () => {} }; // 実際のAbort Controller等をここに格納
  activeTranscribeSessions.set(connectionId, transcribeSession);
}

/**
 * WebSocketクライアントにメッセージを送信
 */
async function sendToClient(
  apiClient: ApiGatewayManagementApi,
  connectionId: string,
  message: any
): Promise<void> {
  try {
    await apiClient.postToConnection({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(message))
    });
  } catch (error: any) {
    // 接続が既に閉じられている場合はDynamoDBから削除
    if (error.statusCode === 410) {
      console.log(`接続閉鎖済み: ${connectionId}、DBから削除します`);
      try {
        await ddbDocClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { connectionId }
        }));
        // Transcribeセッションを削除
        if (activeTranscribeSessions.has(connectionId)) {
          const session = activeTranscribeSessions.get(connectionId);
          if (session && session.abort) {
            try {
              session.abort();
            } catch (e) {
              console.warn('Transcribeセッション終了エラー:', e);
            }
          }
          activeTranscribeSessions.delete(connectionId);
        }
      } catch (dbError) {
        console.error('DB削除エラー:', dbError);
      }
    } else {
      throw error;
    }
  }
}