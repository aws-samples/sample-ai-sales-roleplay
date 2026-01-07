import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';

/**
 * API Gateway REST APIを作成するConstruct
 */
export interface ApiGatewayConstructProps {
  /** Cognito User Pool (認証用) */
  userPool: cognito.UserPool;
  /** Cognito App Client */
  userPoolClient: cognito.UserPoolClient;
  /** Bedrock用Lambda関数 */
  bedrockFunction: lambda.Function;
  /** ランキングLambda関数 (オプション) */
  rankingFunction: lambda.Function;
  /** テキスト→音声変換Lambda関数 */
  textToSpeechFunction: lambda.Function;
  /** スコアリングフィードバックLambda関数 */
  scoringFunction: lambda.Function;
  /** ガードレール管理Lambda関数 */
  guardrailsFunction: lambda.Function;
  /** セッション管理Lambda関数 */
  sessionFunction: lambda.Function;
  /** シナリオ管理Lambda関数 */
  scenarioFunction: lambda.Function;
  /** 動画管理Lambda関数 */
  videosFunction: lambda.Function;
  /** 音声分析Lambda関数 */
  audioAnalysisFunction?: lambda.Function;
  /** セッション分析Lambda関数 */
  sessionAnalysisFunction?: lambda.Function;
}

export class ApiGatewayConstruct extends Construct {
  /** API Gateway REST API */
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    // API Gatewayの作成
    this.api = new apigateway.RestApi(this, 'AIRolePlayApi', {
      restApiName: 'AIRolePlay-API',
      description: 'Unified API for AIRolePlay services including Bedrock, Polly, and scoring',
      deployOptions: {
        stageName: 'api',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // TODO: 本番環境では制限する
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS.concat([
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Requested-With',
          'Accept',
          'Origin',
          'Access-Control-Request-Method',
          'Access-Control-Request-Headers'
        ]),
        allowCredentials: true,
        maxAge: cdk.Duration.days(1),
      },
    });

    // Gateway Responses: エラー時のCORSヘッダー追加
    this.api.addGatewayResponse('Default4XXResponse', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'"
      }
    });

    this.api.addGatewayResponse('Default5XXResponse', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'"
      }
    });

    // 特に401 Unauthorizedエラーへの対応
    this.api.addGatewayResponse('UnauthorizedResponse', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'"
      }
    });

    // Cognitoオーソライザーの作成
    const auth = new apigateway.CognitoUserPoolsAuthorizer(this, 'AIRolePlayApiAuthorizer', {
      cognitoUserPools: [props.userPool],
      authorizerName: 'AIRolePlayApiAuthorizer',
      identitySource: 'method.request.header.Authorization',
    });

    // APIリソースとメソッドの作成
    const bedrockResource = this.api.root.addResource('bedrock');
    const conversationResource = bedrockResource.addResource('conversation');

    // POST /bedrock/conversation - NPCとの対話APIエンドポイント
    conversationResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.bedrockFunction, {
        proxy: true,
      }),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Polly API endpoints (テキスト→音声変換)
    const pollyResource = this.api.root.addResource('polly');
    const convertResource = pollyResource.addResource('convert');

    // POST /polly/convert - テキスト→音声変換エンドポイント
    convertResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.textToSpeechFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Scoring API endpoints (スコアリングAPI)
    const scoringResource = this.api.root.addResource('scoring');
    const realtimeResource = scoringResource.addResource('realtime');

    // POST /scoring/realtime - リアルタイムスコアリングエンドポイント
    realtimeResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.scoringFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Ranking API endpoints (ランキングAPI)
    const rankingsResource = this.api.root.addResource('rankings');

    // GET /rankings - ランキングデータ取得エンドポイント
    rankingsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.rankingFunction),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: auth
      }
    );
    // Videos API endpoints (動画管理・分析API)
    const videosResource = this.api.root.addResource('videos');

    // GET /videos/upload-url - 動画アップロード用署名付きURL生成エンドポイント
    const uploadUrlResource = videosResource.addResource('upload-url');
    uploadUrlResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.videosFunction),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: auth
      }
    );

    // 注意: GET /videos/{sessionId} エンドポイントは削除されました
    // 動画分析結果はStep Functionsで取得され、analysis-results APIで返されます

    // Sessions API endpoints (セッション管理API)
    // セッション一覧のルート
    const sessionsResource = this.api.root.addResource('sessions');

    // GET /sessions - セッション一覧取得
    sessionsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.sessionFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // GET /sessions/{sessionId} - セッション詳細取得
    const sessionDetailResource = sessionsResource.addResource('{session_id}');
    sessionDetailResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.sessionFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // GET /sessions/{sessionId}/messages - セッションメッセージ履歴取得
    const messagesResource = sessionDetailResource.addResource('messages');
    messagesResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.sessionFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // GET /sessions/{sessionId}/analysis-results - セッション分析結果取得（音声分析対応）
    const analysisResultsResource = sessionDetailResource.addResource('analysis-results');
    analysisResultsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.sessionFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // セッション分析API endpoints (Step Functions統合)
    if (props.sessionAnalysisFunction) {
      // POST /sessions/{sessionId}/analyze - セッション分析開始
      const analyzeResource = sessionDetailResource.addResource('analyze');
      analyzeResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(props.sessionAnalysisFunction),
        {
          authorizer: auth,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // GET /sessions/{sessionId}/analysis-status - 分析ステータス取得
      const analysisStatusResource = sessionDetailResource.addResource('analysis-status');
      analysisStatusResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(props.sessionAnalysisFunction),
        {
          authorizer: auth,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // Scenarios API endpoints (シナリオ管理API)
    // シナリオのルート
    const scenariosResource = this.api.root.addResource('scenarios');

    // GET /scenarios - シナリオ一覧取得
    scenariosResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // POST /scenarios - シナリオ作成
    scenariosResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // GET /scenarios/{scenario_id} - シナリオ詳細取得
    const scenarioDetailResource = scenariosResource.addResource('{scenario_id}');
    scenarioDetailResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // PUT /scenarios/{scenario_id} - シナリオ更新
    scenarioDetailResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // DELETE /scenarios/{scenario_id} - シナリオ削除
    scenarioDetailResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // POST /scenarios/{scenario_id}/share - シナリオ共有設定
    const shareResource = scenarioDetailResource.addResource('share');
    shareResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // GET /scenarios/{scenario_id}/export - 単一シナリオエクスポート
    const exportResource = scenarioDetailResource.addResource('export');
    exportResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // POST /scenarios/{scenario_id}/pdf-upload-url - PDFアップロード
    const pdfUploadResource = scenarioDetailResource.addResource('pdf-upload-url');
    pdfUploadResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // DELETE /scenarios/{scenario_id}/files/{file_name} - PDFファイル削除
    const filesResource = scenarioDetailResource.addResource('files');
    const fileResource = filesResource.addResource('{file_name}');
    fileResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // POST /scenarios/import - シナリオインポート
    const importResource = scenariosResource.addResource('import');
    importResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.scenarioFunction),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Guardrails API endpoints (ガードレールAPI)
    if (props.guardrailsFunction) {
      // ガードレールのルート
      const guardrailsResource = this.api.root.addResource('guardrails');

      // GET /guardrails - ガードレール一覧取得
      guardrailsResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(props.guardrailsFunction),
        {
          authorizer: auth,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // 音声分析API endpoints (音声分析API)
    if (props.audioAnalysisFunction) {
      const audioAnalysisResource = this.api.root.addResource('audio-analysis');

      // POST /audio-analysis/upload-url - 音声アップロード用署名付きURL生成
      const audioUploadUrlResource = audioAnalysisResource.addResource('upload-url');
      audioUploadUrlResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(props.audioAnalysisFunction),
        {
          authorizer: auth,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // 音声分析セッション関連API
      const audioSessionResource = audioAnalysisResource.addResource('{session_id}');

      // POST /audio-analysis/{sessionId}/analyze - 音声分析開始
      const analyzeResource = audioSessionResource.addResource('analyze');
      analyzeResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(props.audioAnalysisFunction),
        {
          authorizer: auth,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // GET /audio-analysis/{sessionId}/status - 分析状況確認
      const statusResource = audioSessionResource.addResource('status');
      statusResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(props.audioAnalysisFunction),
        {
          authorizer: auth,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // GET /audio-analysis/{sessionId}/results - 分析結果取得
      const resultsResource = audioSessionResource.addResource('results');
      resultsResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(props.audioAnalysisFunction),
        {
          authorizer: auth,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // APIGatewayロール
    const apiGatewayRole = new iam.Role(this, 'ApiGatewayRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      description: 'Role for API Gateway to execute requests',
    });

    // CloudWatchアクセス権限
    apiGatewayRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs')
    );
  }
}
