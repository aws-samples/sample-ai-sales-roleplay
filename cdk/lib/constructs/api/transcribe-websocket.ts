import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export interface TranscribeWebSocketProps {
  stageName: string;
  envId: string;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  sessionsTable: dynamodb.Table;
  scenariosTable: dynamodb.Table;
}

/**
 * Amazon Transcribe WebSocket API構築クラス
 * 
 * リアルタイム音声認識のためのWebSocket APIを構築します。
 * クライアントから送信される音声データをAmazon Transcribeに転送し、
 * 認識結果をクライアントにストリーミングします。
 */
export class TranscribeWebSocketConstruct extends Construct {
  public readonly webSocketApi: apigatewayv2.CfnApi;
  public readonly webSocketApiEndpoint: string;

  constructor(scope: Construct, id: string, props: TranscribeWebSocketProps) {
    super(scope, id);

    // コネクション情報を保存するDynamoDBテーブル
    const connectionTable = new dynamodb.Table(this, 'TranscribeConnections', {
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY // 開発環境用
    });

    // セッションIDによる検索を高速化するためのGSI
    connectionTable.addGlobalSecondaryIndex({
      indexName: 'sessionId-index',
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING
      }
    });

    // WebSocket接続ハンドラLambda関数
    const connectHandler = new NodejsFunction(this, 'ConnectHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'connectHandler',
      entry: path.join(__dirname, '../../../lambda/transcribeWebSocket/app.ts'),
      environment: {
        CONNECTION_TABLE_NAME: connectionTable.tableName,
        USER_POOL_ID: props.userPool.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
        SESSIONS_TABLE: props.sessionsTable.tableName,
        SCENARIOS_TABLE: props.scenariosTable.tableName
      }
    });

    // WebSocket切断ハンドラLambda関数
    const disconnectHandler = new NodejsFunction(this, 'DisconnectHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'disconnectHandler',
      entry: path.join(__dirname, '../../../lambda/transcribeWebSocket/app.ts'),
      environment: {
        CONNECTION_TABLE_NAME: connectionTable.tableName,
        SESSIONS_TABLE: props.sessionsTable.tableName,
        SCENARIOS_TABLE: props.scenariosTable.tableName
      }
    });

    // WebSocketデフォルトハンドラLambda関数（音声データ処理）
    const defaultHandler = new NodejsFunction(this, 'DefaultHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'defaultHandler',
      entry: path.join(__dirname, '../../../lambda/transcribeWebSocket/app.ts'),
      environment: {
        CONNECTION_TABLE_NAME: connectionTable.tableName,
        SESSIONS_TABLE: props.sessionsTable.tableName,
        SCENARIOS_TABLE: props.scenariosTable.tableName
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512
    });

    // Lambda関数にDynamoDBテーブルへのアクセス権限を付与
    connectionTable.grantReadWriteData(connectHandler);
    connectionTable.grantReadWriteData(disconnectHandler);
    connectionTable.grantReadWriteData(defaultHandler);

    // セッションとシナリオテーブルへの読み取り権限を付与
    props.sessionsTable.grantReadData(connectHandler);
    props.sessionsTable.grantReadData(disconnectHandler);
    props.sessionsTable.grantReadData(defaultHandler);

    props.scenariosTable.grantReadData(connectHandler);
    props.scenariosTable.grantReadData(disconnectHandler);
    props.scenariosTable.grantReadData(defaultHandler);

    // Transcribeアクセス権限を付与
    defaultHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'transcribe:StartStreamTranscription',
        'transcribe:StartStreamTranscriptionWebSocket'
      ],
      resources: ['*']
    }));

    // WebSocket APIの作成
    this.webSocketApi = new apigatewayv2.CfnApi(this, 'TranscribeWebSocketApi', {
      name: `transcribe-websocket-${props.envId}`,
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.action'
    });

    // WebSocket APIのステージ設定
    const stage = new apigatewayv2.CfnStage(this, 'Stage', {
      apiId: this.webSocketApi.ref,
      stageName: props.stageName,
      autoDeploy: true,
      defaultRouteSettings: {
        dataTraceEnabled: true, // ログ有効化
        throttlingBurstLimit: 100,
        throttlingRateLimit: 100
      }
    });

    // ルートおよびLambda統合の設定
    const connectIntegration = new apigatewayv2.CfnIntegration(this, 'ConnectIntegration', {
      apiId: this.webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${cdk.Stack.of(this).region}:lambda:path/2015-03-31/functions/${connectHandler.functionArn}/invocations`
    });

    const disconnectIntegration = new apigatewayv2.CfnIntegration(this, 'DisconnectIntegration', {
      apiId: this.webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${cdk.Stack.of(this).region}:lambda:path/2015-03-31/functions/${disconnectHandler.functionArn}/invocations`
    });

    const defaultIntegration = new apigatewayv2.CfnIntegration(this, 'DefaultIntegration', {
      apiId: this.webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${cdk.Stack.of(this).region}:lambda:path/2015-03-31/functions/${defaultHandler.functionArn}/invocations`
    });


    // WebSocket Lambda関数にAPIGatewayからの実行権限を付与
    connectHandler.addPermission('ConnectInvokePermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.ref}/*/*`
    });

    disconnectHandler.addPermission('DisconnectInvokePermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.ref}/*/*`
    });

    defaultHandler.addPermission('DefaultInvokePermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.ref}/*/*`
    });

    // 接続ルートの設定 (認証はLambda関数内で実行)
    new apigatewayv2.CfnRoute(this, 'ConnectRoute', {
      apiId: this.webSocketApi.ref,
      routeKey: '$connect',
      authorizationType: 'NONE', // Lambda関数内で認証を実行
      target: 'integrations/' + connectIntegration.ref
    });

    // 切断ルートの設定
    new apigatewayv2.CfnRoute(this, 'DisconnectRoute', {
      apiId: this.webSocketApi.ref,
      routeKey: '$disconnect',
      authorizationType: 'NONE',
      target: 'integrations/' + disconnectIntegration.ref
    });

    // デフォルトルートの設定
    new apigatewayv2.CfnRoute(this, 'DefaultRoute', {
      apiId: this.webSocketApi.ref,
      routeKey: '$default',
      authorizationType: 'NONE',
      target: 'integrations/' + defaultIntegration.ref
    });

    // Lambda関数がWebSocketに返信するための権限を付与
    const policy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.ref}/${stage.stageName}/POST/@connections/*`
      ]
    });

    connectHandler.addToRolePolicy(policy);
    disconnectHandler.addToRolePolicy(policy);
    defaultHandler.addToRolePolicy(policy);

    // WebSocketエンドポイントURLの設定
    this.webSocketApiEndpoint = `wss://${this.webSocketApi.ref}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com/${stage.stageName}`;

    // 出力の作成
    new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
      value: this.webSocketApiEndpoint,
      description: 'WebSocket API Endpoint URL'
    });
  }
}
