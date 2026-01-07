import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { SessionAnalysisLambdaConstruct } from './api/session-analysis-lambda';

/**
 * セッション分析用Step Functionsコンストラクト
 * 
 * セッション完了後の分析処理を並列実行でオーケストレーションする
 * - フィードバック生成（Bedrock）
 * - 動画分析（Nova Premiere）
 * - 参照資料評価（Knowledge Base）
 */
export interface SessionAnalysisStepFunctionsConstructProps {
  resourceNamePrefix?: string;
  sessionAnalysisLambda: SessionAnalysisLambdaConstruct;
}

export class SessionAnalysisStepFunctionsConstruct extends Construct {
  public readonly stateMachine: stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, props: SessionAnalysisStepFunctionsConstructProps) {
    super(scope, id);

    const resourcePrefix = props.resourceNamePrefix || '';

    // Step Functions用ロググループ
    const logGroup = new logs.LogGroup(this, 'SessionAnalysisLogGroup', {
      logGroupName: `/aws/stepfunctions/${resourcePrefix}SessionAnalysis`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Step 1: 分析開始・データ収集
    const startAnalysisTask = new stepfunctionsTasks.LambdaInvoke(this, 'StartAnalysisTask', {
      lambdaFunction: props.sessionAnalysisLambda.startFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.seconds(120)),
    });

    // Step 2: 並列処理 - フィードバック生成
    const feedbackTask = new stepfunctionsTasks.LambdaInvoke(this, 'FeedbackTask', {
      lambdaFunction: props.sessionAnalysisLambda.feedbackFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(10)),
    });

    // リトライ設定（Bedrock throttling対応）
    feedbackTask.addRetry({
      errors: ['States.ALL'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    // Step 3: 並列処理 - 動画分析
    const videoTask = new stepfunctionsTasks.LambdaInvoke(this, 'VideoTask', {
      lambdaFunction: props.sessionAnalysisLambda.videoFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(15)),
    });

    videoTask.addRetry({
      errors: ['States.ALL'],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    // Step 4: 並列処理 - 参照資料評価
    const referenceTask = new stepfunctionsTasks.LambdaInvoke(this, 'ReferenceTask', {
      lambdaFunction: props.sessionAnalysisLambda.referenceFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(10)),
    });

    referenceTask.addRetry({
      errors: ['States.ALL'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    // 並列処理の定義
    const parallelAnalysis = new stepfunctions.Parallel(this, 'ParallelAnalysis', {
      resultPath: '$.parallelResults',
    });

    // 各分析タスクを並列に追加
    parallelAnalysis.branch(feedbackTask);
    parallelAnalysis.branch(videoTask);
    parallelAnalysis.branch(referenceTask);

    // 並列処理結果を整形するPass状態
    const formatResults = new stepfunctions.Pass(this, 'FormatResults', {
      parameters: {
        'feedbackResult.$': '$.parallelResults[0]',
        'videoResult.$': '$.parallelResults[1]',
        'referenceResult.$': '$.parallelResults[2]',
      },
    });

    // Step 5: 結果保存
    const saveResultsTask = new stepfunctionsTasks.LambdaInvoke(this, 'SaveResultsTask', {
      lambdaFunction: props.sessionAnalysisLambda.saveFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.seconds(120)),
    });

    // 成功状態
    const analysisSucceed = new stepfunctions.Succeed(this, 'AnalysisSucceed');

    // 失敗状態
    const analysisFailed = new stepfunctions.Fail(this, 'AnalysisFailed', {
      cause: 'Session analysis failed',
      error: 'SessionAnalysisFailed',
    });

    // エラーハンドリング用のCatch
    parallelAnalysis.addCatch(analysisFailed, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    // フロー定義
    const definition = startAnalysisTask
      .next(parallelAnalysis)
      .next(formatResults)
      .next(saveResultsTask)
      .next(analysisSucceed);

    // Step Functions実行ロール
    const stateMachineRole = new iam.Role(this, 'SessionAnalysisStateMachineRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
      ],
      inlinePolicies: {
        CloudWatchLogsPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams',
              ],
              resources: [logGroup.logGroupArn + '*'],
            }),
          ],
        }),
      },
    });

    // State Machine作成
    this.stateMachine = new stepfunctions.StateMachine(this, 'SessionAnalysisStateMachine', {
      stateMachineName: `${resourcePrefix}SessionAnalysis`,
      definitionBody: stepfunctions.DefinitionBody.fromChainable(definition),
      role: stateMachineRole,
      timeout: cdk.Duration.hours(1),
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
      },
      tracingEnabled: true,
    });

    // Lambda関数群にStep Functions権限を付与
    props.sessionAnalysisLambda.grantStepFunctionsInvoke(this.stateMachine);

    // 出力
    new cdk.CfnOutput(this, 'SessionAnalysisStateMachineArn', {
      value: this.stateMachine.stateMachineArn,
      description: 'セッション分析Step Functions ARN',
      exportName: `${resourcePrefix}SessionAnalysisStateMachineArn`,
    });
  }
}
