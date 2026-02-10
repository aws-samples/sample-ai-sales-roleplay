import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';

// DynamoDBクライアントを初期化
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

interface CloudFormationEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  ResourceProperties: {
    TableName?: string;
    ScenarioData?: string;
    [key: string]: any;
  };
}

interface CloudFormationResponse {
  Status: 'SUCCESS' | 'FAILED';
  Reason?: string;
  PhysicalResourceId: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  Data?: Record<string, any>;
}

/**
 * システム管理シナリオ（createdBy = 'system'）のみを削除する
 */
async function deleteSystemScenarios(tableName: string): Promise<void> {
  console.log('Deleting existing system scenarios...');
  
  try {
    // createdBy = 'system' のアイテムを取得
    const scanParams = {
      TableName: tableName,
      FilterExpression: 'createdBy = :system',
      ExpressionAttributeValues: {
        ':system': 'system'
      },
      ProjectionExpression: 'scenarioId' // 削除に必要な主キーのみ取得
    };
    
    const scanCommand = new ScanCommand(scanParams);
    const result = await dynamoDB.send(scanCommand);
    
    if (!result.Items || result.Items.length === 0) {
      console.log('No system scenarios found to delete');
      return;
    }
    
    console.log(`Found ${result.Items.length} system scenarios to delete`);
    
    // バッチで削除処理
    const batchSize = 25; // DynamoDBの制限
    for (let i = 0; i < result.Items.length; i += batchSize) {
      const batch = result.Items.slice(i, i + batchSize);
      const deleteParams = {
        RequestItems: {
          [tableName]: batch.map((item: any) => ({
            DeleteRequest: {
              Key: {
                scenarioId: item.scenarioId
              }
            }
          }))
        }
      };
      
      console.log(`Deleting batch ${Math.floor(i / batchSize) + 1} with ${batch.length} items`);
      const deleteCommand = new BatchWriteCommand(deleteParams);
      await dynamoDB.send(deleteCommand);
    }
    
    console.log('Successfully deleted all system scenarios');
  } catch (error) {
    console.error('Error deleting system scenarios:', error);
    throw error;
  }
}

/**
 * CloudFormationのカスタムリソース応答を送信する
 */
async function sendResponse(event: CloudFormationEvent, status: 'SUCCESS' | 'FAILED', data?: Record<string, any>, reason?: string): Promise<void> {
  const responseBody: CloudFormationResponse = {
    Status: status,
    Reason: reason || 'See the details in CloudWatch Log',
    PhysicalResourceId: event.PhysicalResourceId || 'scenario-initialization',
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  };

  console.log('Response body:', JSON.stringify(responseBody, null, 2));
  return Promise.resolve(); // CloudFormation wait for async custom resource
}

/**
 * Lambda Handler
 */
export async function handler(event: CloudFormationEvent): Promise<void> {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    // Create または Update イベントの場合にシナリオデータを登録/更新
    console.log(`Processing ${event.RequestType} event for scenario initialization`);
    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
      const tableName = event.ResourceProperties.TableName;
      const useDirectFileLoading = event.ResourceProperties.UseDirectFileLoading === 'true' || event.ResourceProperties.UseDirectFileLoading === true;
      
      if (!tableName) {
        throw new Error('TableName is required');
      }
      
      // シナリオデータを取得
      let scenarioData: any[] = [];
      
      if (useDirectFileLoading) {
        // JSONファイルからシナリオデータを直接読み込む
        console.log('Loading scenario data directly from file');
        try {
          // Lambda関数内でのファイルパス（プロセスのルートディレクトリからの相対パス）
          const jsonFilePath = path.join(process.cwd(), 'data', 'scenarios.json');
          console.log(`Looking for scenarios.json at: ${jsonFilePath}`);
          
          if (fs.existsSync(jsonFilePath)) {
            const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
            const scenariosData = JSON.parse(jsonContent);
            
            // シナリオデータの配列を取得
            scenarioData = scenariosData.scenarios || [];
            console.log(`Successfully loaded ${scenarioData.length} scenarios from JSON file`);
            
            // データ変換（transformScenarioData関数と同等の処理を行う）
            scenarioData = scenarioData.map((scenario: any) => {
              // 目標データを整形
              const goals = scenario.goals || [];
              
              // NPCデータを整形（関連するNPCを抽出）
              const npc = scenario.npc || {}; // scenarioからnpcを参照
              
              // scenarioIdを優先的に使用し、存在しない場合はidを使用（scenarioIdに統一する方針）
              const scenarioId = scenario.scenarioId || scenario.id;
              if (!scenarioId) {
                console.error('Error: Scenario has no ID:', scenario);
                throw new Error('Scenario must have an ID (either \"id\" or \"scenarioId\")');
              }
              console.log("scenario: ", scenario)
              
              return {
                scenarioId: scenarioId, // 必ずscenarioIdとして保存
                title: scenario.title || '',
                description: scenario.description || '',
                difficulty: scenario.difficulty || 'medium',
                industry: scenario.industry || '',
                category: scenario.category || scenario.industry || '', // カテゴリ優先、なければ産業をカテゴリとして使用
                guardrail: scenario.guardrail || null,
                language: scenario.language || 'ja', // 言語設定（デフォルトは日本語）

                initialMessage: scenario.initialMessage,
                maxTurns: scenario.maxTurns || 0, // デフォルト値は0
                npc: {
                  id: npc.id || '',
                  name: npc.name || '',
                  role: npc.role || '',
                  company: npc.company || '',
                  personality: npc.personality || [],
                  avatar: npc.avatar || '',
                  description: npc.description || '',
                  voiceId: npc.voiceId || '',
                },
                initialMetrics: {
                  angerLevel: scenario.initialMetrics?.angerLevel || 0,
                  trustLevel: scenario.initialMetrics?.trustLevel || 0,
                  progressLevel: scenario.initialMetrics?.progressLevel || 0
                },
                goals: goals.map((goal: any) => ({
                  id: goal.id,
                  description: goal.description || '',
                  priority: goal.priority || 0,
                  criteria: goal.criteria || [],
                  isRequired: goal.isRequired || false
                })),

                visibility: scenario.visibility || 'public', // デフォルトは公開
                createdBy: scenario.createdBy || 'system', // システムによって作成されたデータ
                sharedWithUsers: scenario.sharedWithUsers || [], // 共有ユーザーリスト
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: 1
              };
            });
          } else {
            console.error(`File not found at path: ${jsonFilePath}`);
            throw new Error('Scenarios JSON file not found');
          }
        } catch (error) {
          console.error('Error loading scenarios from JSON file:', error);
          throw new Error(`Failed to load scenarios from JSON file: ${error}`);
        }
      } else {
        // CustomResourceから渡されたシナリオデータを使用
        const scenarioDataString = event.ResourceProperties.ScenarioData || '[]';
        scenarioData = JSON.parse(scenarioDataString);
      }
      
      if (scenarioData.length === 0) {
        console.log('No scenario data provided, skipping initialization');
      } else {
        console.log(`${event.RequestType === 'Create' ? 'Initializing' : 'Updating'} ${scenarioData.length} scenarios to ${tableName}`);
        
        // Update処理の場合は、先に既存のシステム管理シナリオを削除
        if (event.RequestType === 'Update') {
          await deleteSystemScenarios(tableName);
        }
        
        // データを一括で登録するためのバッチ処理
        const batchSize = 25; // DynamoDBの制限に合わせる
        for (let i = 0; i < scenarioData.length; i += batchSize) {
          const batch = scenarioData.slice(i, i + batchSize);
          const batchParams = {
            RequestItems: {
              [tableName]: batch.map((item: any) => ({
                PutRequest: {
                  Item: item
                }
              }))
            }
          };
          
          console.log(`Writing batch ${Math.floor(i / batchSize) + 1} with ${batch.length} items`);
          const command = new BatchWriteCommand(batchParams);
          await dynamoDB.send(command);
        }
        
        console.log(`Successfully ${event.RequestType === 'Create' ? 'initialized' : 'updated'} scenario data`);
      }
    } else {
      console.log(`Skipping ${event.RequestType} event, no action required`);
    }
    
    // 成功レスポンスを返す
    await sendResponse(event, 'SUCCESS');
  } catch (error: any) {
    console.error('Error:', error);
    // 失敗レスポンスを返す
    await sendResponse(event, 'FAILED', {}, error.message);
  }
}
