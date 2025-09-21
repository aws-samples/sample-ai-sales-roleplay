import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ScenarioDataInitializer } from './constructs/storage/database/scenario-data-initializer';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * データ初期化スタックのプロパティ
 */
export interface DataInitializerStackProps extends cdk.StackProps {
  /**
   * 環境名
   */
  envName: string;

  /**
   * リソース名プレフィックス
   */
  resourceNamePrefix?: string;

  /**
   * シナリオテーブル（インフラストラクチャスタックから渡される）
   * この方法により、テーブルが実際に存在することを保証する
   */
  scenariosTable?: dynamodb.Table;
}

/**
 * データ初期化のためのスタック
 * インフラストラクチャスタックとは別に、データ初期化のみを担当する
 */
export class DataInitializerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DataInitializerStackProps) {
    super(scope, id, props);

    // シナリオテーブルの取得
    // 提供されたテーブルを優先し、なければテーブル名から参照
    const scenariosTable = props.scenariosTable ||
      dynamodb.Table.fromTableName(
        this,
        'ScenariosTableRef',
        `${props.resourceNamePrefix || ''}AISalesRolePlay-Scenarios`
      );

    // シナリオデータを初期化するカスタムリソースを作成
    new ScenarioDataInitializer(this, 'ScenarioDataInitializer', {
      scenariosTable: scenariosTable
    });
  }
}