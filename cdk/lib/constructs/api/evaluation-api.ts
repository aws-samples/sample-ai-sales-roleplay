import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * 評価画面API構成のプロパティ
 */
export interface EvaluationApiProps {
  /** 環境識別子 */
  envId: string;
  /** リソース名プレフィックス */
  resourceNamePrefix: string;
  /** セッションデータ保存用S3バケット */
  sessionBucket: s3.IBucket;
  /** 動画保存用S3バケット */
  videoBucket?: s3.IBucket;
  /** API Gateway REST API */
  api: apigateway.RestApi;
  /** Cognito Authorizer */
  authorizer: apigateway.IAuthorizer;
}

/**
 * 評価画面API CDKコンストラクト
 * 
 * AgentCore MemoryとS3からセッションデータを取得するAPIを提供
 */
export class EvaluationApi extends Construct {
  /** Lambda関数 */
  public readonly lambda: PythonFunction;

  constructor(scope: Construct, id: string, props: EvaluationApiProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;

    // Lambda実行ロールの作成
    const lambdaExecutionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Evaluation API Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // AgentCore Memory読み取り権限
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:ListEvents',
        'bedrock-agentcore:GetEvent',
        'bedrock-agentcore:GetMemory',
      ],
      resources: ['*'],
    }));

    // Python Lambda関数作成
    this.lambda = new PythonFunction(this, 'EvaluationApiLambda', {
      functionName: `${props.resourceNamePrefix}evaluation-api`,
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../../../lambda/evaluation-api'),
      index: 'index.py',
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        FEEDBACK_BUCKET: props.sessionBucket.bucketName,
        VIDEO_BUCKET: props.videoBucket?.bucketName || '',
        AGENTCORE_MEMORY_REGION: region,
        ENV_ID: props.envId,
      },
      description: '評価画面API - AgentCore MemoryとS3からセッションデータを取得',
    });

    // S3読み取り権限
    props.sessionBucket.grantRead(this.lambda);
    if (props.videoBucket) {
      props.videoBucket.grantRead(this.lambda);
    }

    // API Gatewayエンドポイント追加
    const evaluationResource = props.api.root.addResource('evaluation');
    const sessionResource = evaluationResource.addResource('{sessionId}');

    // 共通のメソッドオプション
    const methodOptions: apigateway.MethodOptions = {
      authorizer: props.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Lambda統合
    const lambdaIntegration = new apigateway.LambdaIntegration(this.lambda, {
      proxy: true,
    });

    // GET /evaluation/{sessionId}/history - 会話履歴取得
    sessionResource
      .addResource('history')
      .addMethod('GET', lambdaIntegration, methodOptions);

    // GET /evaluation/{sessionId}/metrics - メトリクス履歴取得
    sessionResource
      .addResource('metrics')
      .addMethod('GET', lambdaIntegration, methodOptions);

    // GET /evaluation/{sessionId}/feedback - フィードバック取得
    sessionResource
      .addResource('feedback')
      .addMethod('GET', lambdaIntegration, methodOptions);

    // GET /evaluation/{sessionId}/video-analysis - 動画分析結果取得
    sessionResource
      .addResource('video-analysis')
      .addMethod('GET', lambdaIntegration, methodOptions);

    // GET /evaluation/{sessionId}/audio-analysis - 音声分析結果取得
    sessionResource
      .addResource('audio-analysis')
      .addMethod('GET', lambdaIntegration, methodOptions);
  }
}
