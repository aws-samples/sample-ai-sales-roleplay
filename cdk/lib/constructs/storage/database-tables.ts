import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export interface DatabaseTablesProps {
  resourceNamePrefix?: string; // リソース名のプレフィックス
}

/**
 * アプリケーションで使用するDynamoDBテーブルを管理するクラス
 */
export class DatabaseTables extends Construct {
  /** シナリオテーブル */
  public readonly scenariosTable: dynamodb.Table;

  /** セッションテーブル */
  public readonly sessionsTable: dynamodb.Table;

  /** メッセージテーブル */
  public readonly messagesTable: dynamodb.Table;

  /** セッションフィードバックテーブル */
  public readonly sessionFeedbackTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: DatabaseTablesProps) {
    super(scope, id);

    const prefix = props?.resourceNamePrefix || '';

    // シナリオテーブル
    this.scenariosTable = new dynamodb.Table(this, 'ScenariosTable', {
      tableName: `${prefix}AISalesRolePlay-Scenarios`,
      partitionKey: {
        name: 'scenarioId', // フロントエンドとの整合性のために「scenarioId」を使用
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境用設定（本番環境では注意）
    });

    // セッションテーブル
    this.sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: `${prefix}AISalesRolePlay-Sessions`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expireAt', // TTL属性
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境用設定（本番環境では注意）
    });

    // シナリオIDでのクエリを効率化するためのGSIを追加
    this.sessionsTable.addGlobalSecondaryIndex({
      indexName: 'ScenarioSessionsIndex',
      partitionKey: {
        name: 'scenarioId',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // 完了セッションを時刻降順で取得するためのGSI
    this.sessionsTable.addGlobalSecondaryIndex({
      indexName: 'UserCompletedSessionsIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'completedAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // メッセージテーブル
    this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      tableName: `${prefix}AISalesRolePlay-Messages`,
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expireAt', // TTL属性
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境用設定（本番環境では注意）
    });

    // セッションフィードバックテーブル
    this.sessionFeedbackTable = new dynamodb.Table(this, 'SessionFeedbackTable', {
      tableName: `${prefix}AISalesRolePlay-SessionFeedback`,
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expireAt', // TTL属性
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境用設定（本番環境では注意）
    });

    // ランキング用のGSIを追加
    this.sessionFeedbackTable.addGlobalSecondaryIndex({
      indexName: 'scenarioId-overallScore-index',
      partitionKey: {
        name: 'scenarioId',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'overallScore',
        type: dynamodb.AttributeType.NUMBER
      },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['userId', 'sessionId', 'feedbackData', 'createdAt', 'dataType', 'timestamp', 'updatedAt']
    });
  }
}
