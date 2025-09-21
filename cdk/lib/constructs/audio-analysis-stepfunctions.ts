import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AudioAnalysisLambdaConstruct } from './api/audio-analysis-lambda';

/**
 * 音声分析用Step Functionsコンストラクト
 * 
 * 長時間の音声処理を複数のLambda関数に分割し、
 * Step Functionsでオーケストレーションする
 */
export interface AudioAnalysisStepFunctionsConstructProps {
  resourceNamePrefix?: string;
  audioAnalysisLambda: AudioAnalysisLambdaConstruct;
}

export class AudioAnalysisStepFunctionsConstruct extends Construct {
  public readonly stateMachine: stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, props: AudioAnalysisStepFunctionsConstructProps) {
    super(scope, id);

    const resourcePrefix = props.resourceNamePrefix || '';

    // Step Functions用ログググループ
    const logGroup = new logs.LogGroup(this, 'AudioAnalysisLogGroup', {
      logGroupName: `/aws/stepfunctions/${resourcePrefix}AudioAnalysis`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Step 1: 分析開始・検証
    const startAnalysisTask = new stepfunctionsTasks.LambdaInvoke(this, 'StartAnalysisTask', {
      lambdaFunction: props.audioAnalysisLambda.startAnalysisFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.seconds(60)),
    });

    // Step 2: Transcribe開始
    const startTranscribeTask = new stepfunctionsTasks.LambdaInvoke(this, 'StartTranscribeTask', {
      lambdaFunction: props.audioAnalysisLambda.startTranscribeFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.seconds(60)),
    });

    // Step 3: 待機 (30秒)
    const waitForTranscribe = new stepfunctions.Wait(this, 'WaitForTranscribe', {
      time: stepfunctions.WaitTime.duration(cdk.Duration.seconds(30)),
    });

    // Step 4: Transcribe状況確認
    const checkTranscribeTask = new stepfunctionsTasks.LambdaInvoke(this, 'CheckTranscribeTask', {
      lambdaFunction: props.audioAnalysisLambda.checkTranscribeFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.seconds(60)),
    });

    // Step 5: AI分析処理（throttling対応でタイムアウト延長）
    const processAnalysisTask = new stepfunctionsTasks.LambdaInvoke(this, 'ProcessAnalysisTask', {
      lambdaFunction: props.audioAnalysisLambda.processAnalysisFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(15)), // 15分に延長
    });

    // ProcessAnalysisTaskにリトライ設定を追加
    processAnalysisTask.addRetry({
      errors: ['States.ALL'], // States.ALLは単独で使用する必要がある
      interval: cdk.Duration.seconds(5), // throttling対応で少し長めの間隔
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    // Step 6: 結果保存
    const saveResultsTask = new stepfunctionsTasks.LambdaInvoke(this, 'SaveResultsTask', {
      lambdaFunction: props.audioAnalysisLambda.saveResultsFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.seconds(60)),
    });

    // Step 7: Transcribe完了チェック（条件分岐）
    const transcribeComplete = new stepfunctions.Choice(this, 'TranscribeComplete')
      .when(
        stepfunctions.Condition.stringEquals('$.jobStatus', 'COMPLETED'),
        processAnalysisTask.next(saveResultsTask).next(new stepfunctions.Succeed(this, 'AnalysisSucceed'))
      )
      .when(
        stepfunctions.Condition.stringEquals('$.jobStatus', 'FAILED'),
        new stepfunctions.Fail(this, 'TranscribeFailed', {
          cause: 'Transcribe job failed',
          error: 'TranscribeJobFailed',
        })
      )
      .when(
        stepfunctions.Condition.stringEquals('$.jobStatus', 'IN_PROGRESS'),
        waitForTranscribe
      )
      .otherwise(
        new stepfunctions.Fail(this, 'UnknownTranscribeStatus', {
          cause: 'Unknown transcribe job status',
          error: 'UnknownJobStatus',
        })
      );

    // Transcribeポーリングループを構築
    waitForTranscribe.next(checkTranscribeTask.next(transcribeComplete));

    // フロー定義
    const definition = startAnalysisTask
      .next(startTranscribeTask)
      .next(waitForTranscribe);

    // Step Functions実行ロール
    const stateMachineRole = new iam.Role(this, 'AudioAnalysisStateMachineRole', {
      // roleName: `${resourcePrefix}AudioAnalysisStateMachineRole`,
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
    this.stateMachine = new stepfunctions.StateMachine(this, 'AudioAnalysisStateMachine', {
      stateMachineName: `${resourcePrefix}AudioAnalysis`,
      definition: definition,
      role: stateMachineRole,
      timeout: cdk.Duration.hours(2), // 最大2時間
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
      },
      tracingEnabled: true,
    });

    // Lambda関数群にStep Functions権限を付与
    props.audioAnalysisLambda.grantStepFunctionsInvoke(this.stateMachine);

    // 出力
    new cdk.CfnOutput(this, 'AudioAnalysisStateMachineArn', {
      value: this.stateMachine.stateMachineArn,
      description: '音声分析Step Functions ARN',
      exportName: `${resourcePrefix}AudioAnalysisStateMachineArn`
    });
  }
}
