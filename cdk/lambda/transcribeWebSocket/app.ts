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
const transcribeClient = new TranscribeStreamingClient({ 
  region: REGION,
  // マネージドストリーミング転送の設定
  streamingRetryOptions: {
    maxRetries: 2, // 再試行回数
    retryDecider: (error: any) => {
      // 再試行可能なエラーを定義
      return error.name === 'NetworkError' || error.name === 'TimeoutError';
    }
  }
});

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
      await startTranscribeSession(connectionId, domainName, stage);
      // セッションの初期化には少し時間がかかるため、短い待機を挿入
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 既存のTranscribeストリーミングセッションに音声データを送信
    const session = activeTranscribeSessions.get(connectionId);
    if (session && session.audioInput) {
      // 音声データをTranscribeに送信
      session.audioInput.write(audioBuffer);
      
      // 音声アクティビティを通知
      await sendToClient(apiClient, connectionId, {
        voiceActivity: true
      });
    } else {
      console.warn(`有効なTranscribeセッションが見つかりません: ${connectionId}`);
      // セッションがない場合は再作成を試みる
      await startTranscribeSession(connectionId, domainName, stage);
    }
    
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
async function startTranscribeSession(connectionId: string, domainName: string, stage: string): Promise<void> {
  const apiClient = new ApiGatewayManagementApi({
    region: REGION,
    endpoint: `https://${domainName}/${stage}`
  });
  
  // セッション情報を取得して言語コードを確認
  let languageCode = 'ja-JP'; // デフォルト: 日本語
  try {
    const connectionInfo = await ddbDocClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { connectionId }
    }));
    
    // セッション情報から言語設定があれば使用
    if (connectionInfo.Item?.languageCode) {
      languageCode = connectionInfo.Item.languageCode;
    }
  } catch (error) {
    console.warn('言語設定の取得に失敗しました:', error);
  }
  
  // AbortControllerを作成
  const abortController = new AbortController();
  
  try {
    // 双方向ストリームを作成
    const audioStream = async function* () {
      // 音声データをストリームに送信するためのキュー
      const audioQueue: Buffer[] = [];
      let isStreamClosed = false;
      
      // このジェネレータ関数は接続の有効期間中、チャンクを生成し続ける
      while (!isStreamClosed) {
        // キューにデータがあればそれを返す
        if (audioQueue.length > 0) {
          const chunk = audioQueue.shift();
          if (chunk) {
            yield { AudioEvent: { AudioChunk: chunk } };
          }
        } else {
          // キューが空の場合は短い遅延
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        // 中断信号があれば終了
        if (abortController.signal.aborted) {
          isStreamClosed = true;
        }
      }
    };
    
    // Transcribeストリーミング設定
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: languageCode,
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream()
    });
    
    // Transcribeセッションを開始
    const transcribePromise = transcribeClient.send(command, {
      abortSignal: abortController.signal
    });
    
    // 音声データをキューに追加するための関数
    const audioInput = {
      write: (audioData: Buffer) => {
        // ストリーミングキューに音声データを追加
        if (!abortController.signal.aborted) {
          audioStream().next({ value: { AudioEvent: { AudioChunk: audioData } } });
          return true;
        }
        return false;
      }
    };
    
    // Transcribeセッションをマップに保存
    const transcribeSession = {
      audioInput,
      abort: () => {
        try {
          abortController.abort();
        } catch (e) {
          console.warn('Transcribeセッション終了エラー:', e);
        }
      }
    };
    
    activeTranscribeSessions.set(connectionId, transcribeSession);
    
    // 応答処理をセットアップ
    transcribePromise.then(response => {
      if (response.TranscriptResultStream) {
        response.TranscriptResultStream.on('data', async (event) => {
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
                await sendToClient(apiClient, connectionId, {
                  voiceActivity: true
                });
              }
            }
          } catch (error) {
            console.error('Transcribe結果処理エラー:', error);
          }
        });
        
        response.TranscriptResultStream.on('error', async (error) => {
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
        });
      }
    }).catch(async (error) => {
      console.error('Transcribeセッションエラー:', error);
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
    });
    
    console.log(`Transcribeセッション開始: ${connectionId}`);
  } catch (error) {
    console.error('Transcribeセッション開始エラー:', error);
    await sendToClient(apiClient, connectionId, {
      error: {
        code: 'TranscribeInitError',
        message: 'Failed to initialize transcription service'
      }
    });
  }
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