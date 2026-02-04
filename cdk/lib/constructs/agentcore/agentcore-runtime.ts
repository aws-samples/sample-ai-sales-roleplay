import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { Construct } from 'constructs';

export interface AgentCoreRuntimeProps {
  envId: string;
  resourceNamePrefix: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  agentCodePath: string;
  agentName: string;
  description?: string;
  enableJwtAuth: boolean;
  additionalPolicies?: iam.PolicyStatement[];
  additionalEnvironmentVariables?: Record<string, string>; // 追加の環境変数
  sessionBucket?: s3.IBucket;
  memoryId?: string; // AgentCore Memory ID
}

/**
 * AgentCore Runtime CDKコンストラクト（L2 Construct版）
 * @aws-cdk/aws-bedrock-agentcore-alphaを使用
 */
export class AgentCoreRuntime extends Construct {
  public readonly runtimeArn: string;
  public readonly runtimeId: string;
  public readonly endpointArn: string;
  public readonly role: iam.IRole;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    // Runtime名はアンダースコア区切りに変換（ハイフンは使用不可）
    // L2 Construct用にサフィックスを追加して既存リソースとの競合を回避
    const runtimeName = `${props.resourceNamePrefix}${props.agentName}_l2`.replace(/-/g, '_');

    // JWT認証設定（L2 Construct API）
    const authorizerConfiguration = props.enableJwtAuth
      ? agentcore.RuntimeAuthorizerConfiguration.usingJWT(
        `https://cognito-idp.${region}.amazonaws.com/${props.cognitoUserPoolId}/.well-known/openid-configuration`,
        [props.cognitoClientId]
      )
      : agentcore.RuntimeAuthorizerConfiguration.usingIAM();

    // AgentCore Runtime (L2 Construct)
    const runtime = new agentcore.Runtime(this, 'Runtime', {
      runtimeName: runtimeName,
      description: props.description,
      agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromAsset(props.agentCodePath, {
        platform: ecr_assets.Platform.LINUX_ARM64, // arm64プラットフォームを明示的に指定
      }),
      authorizerConfiguration,
      environmentVariables: {
        AWS_DEFAULT_REGION: region,
        ...(props.memoryId && { AGENTCORE_MEMORY_ID: props.memoryId }),
        ...(props.additionalEnvironmentVariables || {}),
      },
    });

    // Runtime Endpointを追加
    runtime.addEndpoint('DefaultEndpoint', {});

    // Bedrock InvokeModel権限を付与
    runtime.addToRolePolicy(new iam.PolicyStatement({
      sid: 'BedrockModelInvocation',
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['arn:aws:bedrock:*::foundation-model/*', `arn:aws:bedrock:${region}:${account}:*`],
    }));

    // AgentCore Memory権限を付与（Memory IDが指定されている場合）
    if (props.memoryId) {
      runtime.addToRolePolicy(new iam.PolicyStatement({
        sid: 'AgentCoreMemoryAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:CreateEvent',
          'bedrock-agentcore:GetEvent',
          'bedrock-agentcore:ListEvents',
          'bedrock-agentcore:GetMemory',
        ],
        resources: [`arn:aws:bedrock-agentcore:${region}:${account}:memory/${props.memoryId}`],
      }));
    }

    // 追加ポリシーを付与
    props.additionalPolicies?.forEach((policy) => {
      runtime.addToRolePolicy(policy);
    });

    // セッションバケットへのアクセス権限
    if (props.sessionBucket) {
      runtime.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
        resources: [props.sessionBucket.bucketArn, `${props.sessionBucket.bucketArn}/*`],
      }));
    }

    // L2 Constructのプロパティ名に合わせる
    this.runtimeArn = runtime.agentRuntimeArn;
    this.runtimeId = runtime.agentRuntimeId;
    this.endpointArn = runtime.agentRuntimeArn;
    this.role = runtime.role;

    new cdk.CfnOutput(this, 'RuntimeArn', {
      value: this.runtimeArn,
      exportName: `${props.resourceNamePrefix}${props.agentName}-runtime-arn`,
    });
  }
}
