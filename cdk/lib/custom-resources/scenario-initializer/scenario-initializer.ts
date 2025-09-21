import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * シナリオデータをDynamoDBに初期化するためのConstructのプロパティ
 */
export interface ScenarioInitializerProps {
  /**
   * シナリオデータを登録するDynamoDBテーブル
   * Table または ITable のいずれかを受け付ける
   */
  scenariosTable: dynamodb.ITable;
}

/**
 * シナリオデータをDynamoDBに初期化するためのConstruct
 */
export class ScenarioInitializer extends Construct {
  constructor(scope: Construct, id: string, props: ScenarioInitializerProps) {
    super(scope, id);

    // シナリオデータをDynamoDBに登録するためのLambda関数
    const initializerFunction = new lambdaNodejs.NodejsFunction(this, 'ScenarioInitializer', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, 'scenario-initializer-handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      description: 'Lambda function to initialize scenario data in DynamoDB',
      bundling: {
        nodeModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'], // AWS SDK v3モジュールを明示的に含める
        externalModules: [],
        minify: true,
        sourceMap: false,
        commandHooks: {
          beforeBundling(inputDir: string, outputDir: string): string[] {
            // 入力パスの検証
            if (!inputDir || !outputDir) {
              throw new Error('無効なディレクトリパスです');
            }

            // 固定ファイル名を使用してパストラバーサルを防ぐ
            const SCENARIOS_FILENAME = 'scenarios.json';
            const DATA_DIR_NAME = 'data';

            // 安全なパス構築
            // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
            const dataDir = path.resolve(outputDir, DATA_DIR_NAME);
            // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
            const sourceFile = path.resolve(inputDir, DATA_DIR_NAME, SCENARIOS_FILENAME);
            // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
            const targetFile = path.resolve(dataDir, SCENARIOS_FILENAME);

            return [
              `mkdir -p "${dataDir}"`,
              `cp "${sourceFile}" "${targetFile}"`
            ];
          },
          afterBundling(_inputDir: string, _outputDir: string): string[] {
            return [];
          },
          beforeInstall() {
            return [];
          },
        },
      },
    });

    // Lambdaに必要なIAMポリシーを付与（読み取り権限も追加 - Update時のScan処理で必要）
    props.scenariosTable.grantReadWriteData(initializerFunction);

    // scenarios.jsonファイルのハッシュを計算して変更検知に使用
    const scenariosFilePath = path.join(__dirname, '../../../data/scenarios.json');
    const scenariosContent = fs.readFileSync(scenariosFilePath, 'utf8');
    const scenariosHash = crypto.createHash('sha256').update(scenariosContent).digest('hex');

    // カスタムリソースを使用してLambdaを呼び出し、シナリオデータを初期化
    new cr.AwsCustomResource(this, 'Resource', {
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [initializerFunction.functionArn],
        }),
      ]),
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: initializerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Create',
            ResourceProperties: {
              TableName: props.scenariosTable.tableName,
              UseDirectFileLoading: true,
              ScenariosHash: scenariosHash,
            }
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of('scenario-data-initializer'),
      },
      // 更新イベントでもシナリオデータを更新する
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: initializerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Update',
            ResourceProperties: {
              TableName: props.scenariosTable.tableName,
              UseDirectFileLoading: true,
              ScenariosHash: scenariosHash,
            }
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of('scenario-data-initializer'),
      },
      onDelete: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: initializerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Delete',
            ResourceProperties: {}
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of('scenario-data-initializer'),
      },
      serviceTimeout: cdk.Duration.minutes(5),
      timeout: cdk.Duration.minutes(4),
    });
  }
}
