#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { CloudFrontWafStack } from '../lib/stacks/cloudfront-waf-stack';
import { DataInitializerStack } from '../lib/data-initializer-stack';

const app = new cdk.App();

// 環境の取得 (ENV環境変数またはコンテキストから)
const envId = process.env.ENV || app.node.tryGetContext('env') || 'default';

// 環境に応じたコンテキスト設定の取得
const envContextKey = `env:${envId}`;
const envSpecificContext = app.node.tryGetContext(envContextKey) || {};

// 環境共通のコンテキスト設定と環境固有の設定をマージ
const context = {
  ...app.node.tryGetContext('default') || {},
  ...envSpecificContext
};

// 現在のリージョンに基づいて適切なBedrockモデル設定を選択
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';
const regionType = region.startsWith('us-') ? 'us-regions' 
                : region.startsWith('ap-') ? 'ap-regions'
                : region.startsWith('eu-') ? 'eu-regions'
                : 'us-regions'; // デフォルトはUSリージョン

// リージョンタイプに対応するモデル設定を取得
if (context.bedrockModels && context.bedrockModels[regionType]) {
  // リージョン対応のモデル設定で上書き
  context.bedrockModels = context.bedrockModels[regionType];
} else {
  console.warn(`警告: リージョン ${region} に対応するBedrockモデル設定が見つかりません。デフォルト設定を使用します。`);
}

const allowedIpV4AddressRanges: string[] | null = context.allowedIpV4AddressRanges || app.node.tryGetContext('allowedIpV4AddressRanges');
const allowedIpV6AddressRanges: string[] | null = context.allowedIpV6AddressRanges || app.node.tryGetContext('allowedIpV6AddressRanges');
const allowedCountryCodes: string[] | null = context.allowedCountryCodes || app.node.tryGetContext('allowedCountryCodes');

// 環境に基づいてスタック名を生成
const stackNamePrefix = `AISalesRoleplay-${envId}`;
const infrastructureStackName = `${stackNamePrefix}-InfrastructureStack`;
const cloudFrontWafStackName = `${stackNamePrefix}-CloudFrontWafStack`;

let cloudFrontWafStack: CloudFrontWafStack | undefined;

// IP アドレス範囲(v4もしくはv6のいずれか)か地理的制限が定義されている場合のみ、CloudFrontWafStack をデプロイする
if (
  allowedIpV4AddressRanges ||
  allowedIpV6AddressRanges ||
  allowedCountryCodes
) {
  // WAF v2 は us-east-1 でのみデプロイ可能なため、Stack を分けている
  cloudFrontWafStack = new CloudFrontWafStack(app, cloudFrontWafStackName, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'us-east-1',
    },
    allowedIpV4AddressRanges,
    allowedIpV6AddressRanges,
    allowedCountryCodes,
    envId, // 環境IDを追加
  });
}

const infrastructureStack = new InfrastructureStack(app, infrastructureStackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  webAclId: cloudFrontWafStack
    ? cloudFrontWafStack.webAclArn.value
    : undefined,
  allowedIpV4AddressRanges,
  allowedIpV6AddressRanges,
  allowedCountryCodes,
  crossRegionReferences: true,
  envId, // 環境IDを追加
});

// データ初期化スタックを作成
const dataInitializerStackName = `${stackNamePrefix}-DataInitializerStack`;
const dataInitializerStack = new DataInitializerStack(app, dataInitializerStackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  envName: envId,
  resourceNamePrefix: envId ? `${envId}-` : '',
  scenariosTable: undefined, // インフラストラクチャスタックからの依存関係を切ることを明示
});

// データ初期化スタックがインフラストラクチャスタックに依存するように設定
dataInitializerStack.addDependency(infrastructureStack);

