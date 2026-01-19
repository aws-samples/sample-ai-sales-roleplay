import * as cdk from 'aws-cdk-lib';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';

export interface AgentCoreMemoryProps {
  envId: string;
  resourceNamePrefix: string;
  memoryName: string;
  description?: string;
  expirationDays?: number;
}

/**
 * AgentCore Memory CDKコンストラクト（L2 Construct版）
 * 会話履歴、メトリクス、セッション状態を統合管理
 */
export class AgentCoreMemory extends Construct {
  public readonly memoryId: string;
  public readonly memoryArn: string;
  public readonly memory: agentcore.Memory;

  constructor(scope: Construct, id: string, props: AgentCoreMemoryProps) {
    super(scope, id);

    // Memory名はアンダースコア区切りに変換
    const memoryName = `${props.resourceNamePrefix}${props.memoryName}`.replace(/-/g, '_');

    // AgentCore Memory (L2 Construct)
    // STM（Short-Term Memory）のみ使用 - 会話履歴の保持
    this.memory = new agentcore.Memory(this, 'Memory', {
      memoryName: memoryName,
      description: props.description || `AgentCore Memory for ${props.memoryName}`,
      expirationDuration: cdk.Duration.days(props.expirationDays || 90),
    });

    this.memoryId = this.memory.memoryId;
    this.memoryArn = this.memory.memoryArn;

    // Export名はアンダースコア禁止のため、ハイフンに変換
    const exportNameBase = `${props.resourceNamePrefix}${props.memoryName}`.replace(/_/g, '-');

    new cdk.CfnOutput(this, 'MemoryId', {
      value: this.memoryId,
      exportName: `${exportNameBase}-memory-id`,
    });

    new cdk.CfnOutput(this, 'MemoryArn', {
      value: this.memoryArn,
      exportName: `${exportNameBase}-memory-arn`,
    });
  }
}
