import {
  aws_s3 as s3,
  aws_iam as iam,
  aws_opensearchserverless as opensearch_serverless,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';

export interface VectorKBProps {
  resourceNamePrefix: string; // リソース名のプレフィックス
  dataSourceBucket: s3.Bucket;
}

export class VectorKB extends Construct {
  public readonly knowledgeBase: bedrock.VectorKnowledgeBase;

  constructor(scope: Construct, id: string, props: VectorKBProps) {
    super(scope, id);

    // 埋め込みモデルを定義
    const embeddingModel = bedrock.BedrockFoundationModel.COHERE_EMBED_MULTILINGUAL_V3;

    // // クロスリージョン推論プロファイルを定義
    // const cris = bedrock.CrossRegionInferenceProfile.fromConfig({
    //   geoRegion: bedrock.CrossRegionInferenceProfileRegion.US,
    //   model: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_HAIKU_V1_0,
    // });

    // ナレッジベースを作成（循環依存を避けるため依存関係は設定しない）
    this.knowledgeBase = new bedrock.VectorKnowledgeBase(this, `${props.resourceNamePrefix}KnowledgeBase`, {
      embeddingsModel: embeddingModel,
      name: `${props.resourceNamePrefix}ai-sales-roleplay`,
    });

    // OpenSearch Serverless Collection の冗長構成を無効化
    const kbVectors = this.knowledgeBase.node.tryFindChild("KBVectors");
    if (kbVectors) {
      const vectorCollection = kbVectors.node.tryFindChild("VectorCollection");
      if (vectorCollection) {
        const cfnCollection = vectorCollection as opensearch_serverless.CfnCollection;
        // StandbyReplicasを無効化してコストを削減
        cfnCollection.standbyReplicas = "DISABLED";
      }
    }

    // S3データソースを追加
    this.knowledgeBase.addS3DataSource({
      bucket: props.dataSourceBucket,
      // chunkingStrategy: bedrock.ChunkingStrategy.HIERARCHICAL_COHERE,
      // parsingStrategy: bedrock.ParsingStrategy.foundationModel({
      //   parsingModel: cris
      // }),
    });

    // ナレッジベースロールに必要な権限を追加
    this.knowledgeBase.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:GetInferenceProfile",
          "bedrock:InvokeModel"
        ],
        resources: [
          "arn:aws:bedrock:*:*:inference-profile/*",
          "arn:aws:bedrock:*::foundation-model/*"
        ],
      })
    );
  }
}