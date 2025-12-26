import * as cdk from 'aws-cdk-lib';
import { CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { Auth } from './constructs/auth';
import { Api } from './constructs/api';
import { CommonWebAcl } from './constructs/common-web-acl';
import { Web } from './constructs/web';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { DatabaseTables } from './constructs/storage/database-tables';
import { GuardrailsConstruct } from './constructs/guardrails';
import { PdfStorageConstruct } from './constructs/storage/pdf-storage';
import { Polly } from './constructs/polly';
import { VectorKB } from './constructs/knowledgebase';
import { BedrockModelsConfig } from './types/bedrock-models';

/**
 * メインインフラストラクチャスタック
 * 
 * Cognitoなどの各種AWSリソースを統合的に管理する
 */
export interface InfrastructureStackProps extends cdk.StackProps {
  webAclId?: string;
  allowedIpV4AddressRanges: string[] | null;
  allowedIpV6AddressRanges: string[] | null;
  allowedCountryCodes: string[] | null;
  envName?: string;
  envId?: string; // 環境識別子
  bedrockModels: BedrockModelsConfig; // フラット化済みBedrockモデル設定
}

export class InfrastructureStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: InfrastructureStackProps) {
    super(scope, id, {
      description: "AI Sales Roleplay Stack (uksb-s467hwtl8y)",
      ...props,
    });

    // 環境識別子を使ってリソース名を構築
    const resourcePrefix = props?.envId ? `${props.envId}-` : '';

    // 環境に応じたコンテキスト設定の取得
    const envId = props?.envId || 'dev';
    const envContextKey = `env:${envId}`;
    const envConfig = this.node.tryGetContext(envContextKey) || {};
    const defaultConfig = this.node.tryGetContext('default') || {};

    // 環境設定とデフォルト設定をマージ
    const config = {
      ...defaultConfig,
      ...envConfig
    };

    const selfSignUpEnabled: boolean = config.selfSignUpEnabled ?? true;
    const allowedSignUpEmailDomains: string[] | null | undefined = config.allowedSignUpEmailDomains;

    const polly = new Polly(this, 'Polly', {
      envId: envId
    })

    const auth = new Auth(this, 'Auth', {
      selfSignUpEnabled,
      allowedIpV4AddressRanges: props?.allowedIpV4AddressRanges || null,
      allowedIpV6AddressRanges: props?.allowedIpV6AddressRanges || null,
      allowedSignUpEmailDomains,
      resourceNamePrefix: resourcePrefix // 環境識別子をリソース名に含める
    });

    // データベーステーブルを作成
    const databaseTables = new DatabaseTables(this, 'DatabaseTables', {
      resourceNamePrefix: resourcePrefix
    });

    // Guardrailsをデプロイ
    const guardrails = new GuardrailsConstruct(this, 'Guardrails', {
      resourceNamePrefix: resourcePrefix
    });

    // PDF資料保存用S3バケット
    const pdfStorage = new PdfStorageConstruct(this, 'PdfStorage', {
      resourceNamePrefix: resourcePrefix
    });

    // knowledge baseをデプロイ
    const kb = new VectorKB(this, "VectorKB", {
      resourceNamePrefix: resourcePrefix,
      dataSourceBucket: pdfStorage.bucket,
    })

    const api = new Api(this, 'API', {
      userPool: auth.userPool,
      userPoolClient: auth.client,
      envId: envId,
      resourceNamePrefix: resourcePrefix, // 環境識別子をリソース名に含める
      databaseTables: databaseTables, // データベーステーブルを渡す
      guardrails: guardrails, // Guardrailsを渡す
      pdfStorageBucket: pdfStorage.bucket,
      knowledgeBaseId: kb.knowledgeBaseId, // Knowledge Base ID
      bedrockModels: props!.bedrockModels, // propsから渡されたフラット化済みBedrockモデル設定を使用
    });

    if (
      props?.allowedIpV4AddressRanges ||
      props?.allowedIpV6AddressRanges ||
      props?.allowedCountryCodes
    ) {
      const regionalWaf = new CommonWebAcl(this, 'RegionalWaf', {
        scope: 'REGIONAL',
        allowedIpV4AddressRanges: props.allowedIpV4AddressRanges,
        allowedIpV6AddressRanges: props.allowedIpV6AddressRanges,
        allowedCountryCodes: props.allowedCountryCodes,
        resourceNamePrefix: resourcePrefix // 環境識別子をリソース名に含める
      });
      new CfnWebACLAssociation(this, 'ApiWafAssociation', {
        resourceArn: api.api.api.deploymentStage.stageArn,
        webAclArn: regionalWaf.webAclArn,
      });
      new CfnWebACLAssociation(this, 'UserPoolWafAssociation', {
        resourceArn: auth.userPool.userPoolArn,
        webAclArn: regionalWaf.webAclArn,
      });
    }

    const web = new Web(this, 'Web', {
      apiEndpointUrl: api.api.api.url,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.client.userPoolClientId,
      idPoolId: auth.idPool.identityPoolId,
      selfSignUpEnabled,
      webAclId: props?.webAclId,
      resourceNamePrefix: resourcePrefix, // 環境識別子をリソース名に含める
      transcribeWebSocketEndpoint: api.transcribeWebSocket.webSocketApiEndpoint // WebSocketエンドポイントを追加
    });

    const prefix = props?.envId ? `${props.envId}-` : '';

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      exportName: `${prefix}UserPoolId`
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: auth.client.userPoolClientId,
      exportName: `${prefix}UserPoolClientId`
    });
    new cdk.CfnOutput(this, 'IdPoolId', {
      value: auth.idPool.identityPoolId,
      exportName: `${prefix}IdPoolId`
    });

    new cdk.CfnOutput(this, 'ApiEndpointOutput', {
      value: api.api.api.url,
      description: 'API Gateway Endpoint URL',
      exportName: `${prefix}ApiEndpoint`
    });

    new cdk.CfnOutput(this, 'TranscribeWebSocketEndpoint', {
      value: api.transcribeWebSocket.webSocketApiEndpoint,
      description: 'WebSocket API Endpoint for Transcribe integration',
      exportName: `${prefix}TranscribeWebSocketEndpoint`
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${web.distribution.domainName}`,
      description: 'CloudFront URL for accessing the application',
      exportName: `${prefix}CloudFrontURL`
    });

    // Lexicon名をエクスポート
    new cdk.CfnOutput(this, 'JapaneseLexiconName', {
      value: `${resourcePrefix}JapaneseLexicon`,
      description: 'Japanese Lexicon Name for Amazon Polly',
      exportName: `${prefix}JapaneseLexiconName`
    });

    new cdk.CfnOutput(this, 'EnglishLexiconName', {
      value: `${resourcePrefix}EnglishLexicon`,
      description: 'English Lexicon Name for Amazon Polly',
      exportName: `${prefix}EnglishLexiconName`
    });

    this.userPool = auth.userPool;
    this.userPoolClient = auth.client;
  }
}
