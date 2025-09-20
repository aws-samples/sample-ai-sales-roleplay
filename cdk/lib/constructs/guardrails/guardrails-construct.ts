import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

/**
 * GuardrailsConstructの入力プロパティインタフェース
 */
export interface GuardrailsConstructProps {
  /**
   * デプロイ対象のGuardrailsデータを含むJSONファイルへのパス
   * @default 'cdk/data/guardrails.json'
   */
  guardrailsConfigPath?: string;
  
  /**
   * リソース名のプレフィックス（環境識別子）
   * 環境ごとに一意なGuardrail名を生成するために使用
   */
  resourceNamePrefix?: string;
}

/**
 * Guardrailリソース情報を表すインターフェース
 */
export interface GuardrailResource {
  /**
   * GuardrailのID
   */
  id: string;
  
  /**
   * Lambda環境変数用に正規化されたID（ハイフンをアンダースコアに変換）
   */
  normalizedId: string;
  
  /**
   * GuardrailのARN
   */
  arn: string;
  
  /**
   * Guardrailのバージョン
   */
  version: string;
}

/**
 * Amazon Bedrock Guardrailsをデプロイするためのコンストラクト
 */
export class GuardrailsConstruct extends Construct {
  /**
   * デプロイされたGuardrailsのマップ
   * キー: guardrailId, 値: GuardrailResource
   * 注：guardrailIdにハイフンが含まれる場合、Lambda環境変数用に正規化されたIDも保持する
   */
  public readonly guardrails: Record<string, GuardrailResource>;
  
  /**
   * リソース名のプレフィックス（環境識別子）
   */
  private readonly resourceNamePrefix: string;
  
  /**
   * リージョンに基づいてガードレールプロファイルIDを決定する
   * @param region AWS リージョン
   * @returns ガードレールプロファイルID
   */
  private getGuardrailProfileId(region: string): string {
    // US 地域のリージョン
    const usRegions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'];
    
    // EU 地域のリージョン
    const euRegions = ['eu-central-1', 'eu-west-1', 'eu-west-3', 'eu-north-1'];
    
    // APAC 地域のリージョン
    const apacRegions = [
      'ap-south-1', 'ap-northeast-3', 'ap-northeast-2', 'ap-southeast-1',
      'ap-southeast-2', 'ap-southeast-3', 'ap-northeast-1'
    ];
    
    // AWS GovCloud (US) 地域のリージョン
    const govcloudRegions = ['us-gov-east-1', 'us-gov-west-1'];
    
    if (usRegions.includes(region)) {
      return 'us.guardrail.v1:0';
    } else if (euRegions.includes(region)) {
      return 'eu.guardrail.v1:0';
    } else if (apacRegions.includes(region)) {
      return 'apac.guardrail.v1:0';
    } else if (govcloudRegions.includes(region)) {
      return 'us-gov.guardrail.v1:0';
    } else {
      // デフォルトとして US プロファイルを使用するが、警告を出力
      console.warn(`警告: リージョン ${region} に対応するガードレールプロファイルが見つかりません。デフォルトとして us.guardrail.v1:0 を使用します。`);
      return 'us.guardrail.v1:0';
    }
  }
  
  constructor(scope: Construct, id: string, props: GuardrailsConstructProps = {}) {
    super(scope, id);
    
    // デフォルト値の設定
    const guardrailsConfigPath = props.guardrailsConfigPath || 'cdk/data/guardrails.json';
    this.resourceNamePrefix = props.resourceNamePrefix || '';
    
    // Guardrail設定ファイルの読み込み
    const guardrailsConfigFilePath = path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'data', 'guardrails.json');
    const guardrailsConfig = JSON.parse(fs.readFileSync(guardrailsConfigFilePath, 'utf8'));
    
    // Guardrailsリソースのマップを初期化
    this.guardrails = {};
    
    // 設定ファイルから各Guardrailをデプロイ
    for (const guardrailConfig of guardrailsConfig.guardrails) {
      const guardrailId = guardrailConfig.id;
      const guardrail = guardrailConfig.name;
      
      // 環境プレフィックスを適用したGuardrail名を生成
      const prefixedguardrail = this.resourceNamePrefix ? `${this.resourceNamePrefix}${guardrail}` : guardrail;
      
      // CDK公式のCfnGuardrailを使用してGuardrailをデプロイ
      const guardrailResource = this.deployGuardrail(
        guardrailId,
        prefixedguardrail, 
        guardrailConfig
      );
      
      // デプロイされたGuardrailリソース情報を保存
      this.guardrails[guardrailId] = guardrailResource;
      
      // 作成されたGuardrailのARNとバージョンを出力
      new cdk.CfnOutput(this, `${guardrailId}GuardrailArn`, {
        value: guardrailResource.arn,
        description: `ARN of the ${guardrail} guardrail`,
        exportName: `${this.node.addr}-${guardrailId}-guardrail-arn`
      });
      
      new cdk.CfnOutput(this, `${guardrailId}GuardrailVersionOutput`, {
        value: guardrailResource.version,
        description: `Version of the ${guardrail} guardrail`,
        exportName: `${this.node.addr}-${guardrailId}-guardrail-version`
      });
    }
  }
  
  /**
   * CDK公式のCfnGuardrailを使用してGuardrailをデプロイ
   * @param guardrailId Guardrail ID
   * @param guardrail Guardrail名
   * @param guardrailConfig Guardrail設定
   * @returns デプロイされたGuardrailリソース情報
   */
  private deployGuardrail(
    guardrailId: string,
    guardrail: string,
    guardrailConfig: any
  ): GuardrailResource {
    // トピックポリシーの設定
    const topicPolicyConfig = this.createTopicPolicyConfig(guardrailConfig);
    
    // ワードポリシーの設定
    const wordPolicyConfig = this.createWordPolicyConfig(guardrailConfig);
    
    // CDK公式のCfnGuardrailを作成
    const cfnGuardrail = new bedrock.CfnGuardrail(this, `${guardrailId}Guardrail`, {
      name: guardrail,
      description: guardrailConfig.description || `${guardrail}のガードレール`,
      blockedInputMessaging: "コンプライアンス違反が検出されました。表現を見直してください。",
      blockedOutputsMessaging: "コンプライアンス違反が検出されました。表現を見直してください。",
      
      // トピックポリシー設定
      topicPolicyConfig: topicPolicyConfig,
      
      // ワードポリシー設定
      wordPolicyConfig: wordPolicyConfig,
      
      // コンテンツポリシー設定（基本的なフィルター）
      contentPolicyConfig: {
        filtersConfig: [
          {
            type: 'SEXUAL',
            inputStrength: 'MEDIUM',
            outputStrength: 'MEDIUM'
          },
          {
            type: 'HATE',
            inputStrength: 'MEDIUM',
            outputStrength: 'MEDIUM'
          },
          {
            type: 'INSULTS',
            inputStrength: 'MEDIUM',
            outputStrength: 'MEDIUM'
          }
        ],
        contentFiltersTierConfig: {
          tierName: 'STANDARD',
        },
      },
      
      // 機密情報ポリシー設定
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          {
            type: 'EMAIL',
            action: 'BLOCK'
          },
          {
            type: 'PHONE',
            action: 'BLOCK'
          }
        ]
      },

      // クロスリージョン
      crossRegionConfig: {
        guardrailProfileArn: `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:guardrail-profile/${this.getGuardrailProfileId(cdk.Stack.of(this).region)}`
      },

      // Tag
      tags: [
        {
          key: 'environment',
          value: this.resourceNamePrefix.replace("-", ""),
        }
      ]
    });
    
    // CfnGuardrailVersionを作成してバージョンを管理
    const cfnGuardrailVersion = new bedrock.CfnGuardrailVersion(this, `${guardrailId}GuardrailVersion`, {
      guardrailIdentifier: cfnGuardrail.attrGuardrailId,
      description: "compliance check"
    });
    
    // バージョン作成がGuardrail作成後に実行されるように依存関係を設定
    cfnGuardrailVersion.addDependency(cfnGuardrail);
    
    // 正しいARNとバージョンを取得
    const guardrailArn = cfnGuardrail.attrGuardrailArn;
    const guardrailVersion = cfnGuardrailVersion.attrVersion;
    
    // ハイフンをアンダースコアに変換してLambda環境変数に適した形式にする
    const normalizedId = guardrailId.replace(/-/g, '_');
    
    // Parameter Storeにガードレール情報を保存（環境プレフィックスを適用）
    const baseParameterPrefix = '/aisalesroleplay/guardrails';
    const parameterPrefix = this.resourceNamePrefix ? `${baseParameterPrefix}/${this.resourceNamePrefix}` : baseParameterPrefix;
    
    // ARNのパラメータを作成
    new cdk.aws_ssm.StringParameter(this, `${guardrailId}ArnParameter`, {
      parameterName: `${parameterPrefix}/${guardrailId}/arn`,
      stringValue: guardrailArn,
      description: `ARN of the ${guardrail} guardrail for ${this.resourceNamePrefix || 'default'} environment`,
      tier: cdk.aws_ssm.ParameterTier.STANDARD
    });
    
    // バージョンのパラメータを作成
    new cdk.aws_ssm.StringParameter(this, `${guardrailId}VersionParameter`, {
      parameterName: `${parameterPrefix}/${guardrailId}/version`,
      stringValue: guardrailVersion,
      description: `Version of the ${guardrail} guardrail for ${this.resourceNamePrefix || 'default'} environment`,
      tier: cdk.aws_ssm.ParameterTier.STANDARD
    });
    
    return {
      id: guardrailId,
      normalizedId: normalizedId,
      arn: guardrailArn,
      version: guardrailVersion
    };
  }
  
  /**
   * トピックポリシー設定を作成
   */
  private createTopicPolicyConfig(guardrailConfig: any): any {
    const topics = guardrailConfig.topics || [];
    
    if (topics.length === 0) {
      return undefined;
    }
    
    return {
      topicsConfig: topics.map((topic: any) => ({
        name: topic.name,
        definition: topic.definition || '',
        type: 'DENY',
        examples: topic.examples || []
      })),
      topicsTierConfig: {
        tierName: 'STANDARD',
      },
    };
  }
  
  /**
   * ワードポリシー設定を作成
   */
  private createWordPolicyConfig(guardrailConfig: any): any {
    const wordFilters = guardrailConfig.wordFilters || {};
    const exactWords = wordFilters.exact || [];
    const partialWords = wordFilters.partial || [];
    
    const wordsConfig = [];
    
    // 完全一致の禁止語句
    for (const word of exactWords) {
      wordsConfig.push({
        text: word
      });
    }
    
    // 部分一致の禁止語句
    for (const word of partialWords) {
      wordsConfig.push({
        text: word
      });
    }
    
    if (wordsConfig.length === 0) {
      return undefined;
    }
    
    return {
      wordsConfig: wordsConfig,
      managedWordListsConfig: [
        {
          type: 'PROFANITY'
        }
      ]
    };
  }
}
