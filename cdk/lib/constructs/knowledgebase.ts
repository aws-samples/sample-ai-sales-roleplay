import {
  aws_s3 as s3,
  aws_iam as iam,
  aws_bedrock as bedrock,
  aws_s3vectors as s3vectors,
  Stack,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface VectorKBProps {
  resourceNamePrefix: string; // リソース名のプレフィックス
  dataSourceBucket: s3.Bucket;
}

export class VectorKB extends Construct {
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly knowledgeBaseId: string;
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: VectorKBProps) {
    super(scope, id);

    const stack = Stack.of(this);

    // S3 Vector Bucketを作成
    const vectorBucket = new s3vectors.CfnVectorBucket(this, 'VectorBucket', {
      vectorBucketName: `${props.resourceNamePrefix.toLowerCase()}ai-sales-roleplay-s3vectors`,
      encryptionConfiguration: {
        sseType: 'AES256'
      }
    });

    // Vector Indexを作成
    const vectorIndex = new s3vectors.CfnIndex(this, 'VectorIndex', {
      vectorBucketName: vectorBucket.vectorBucketName,
      indexName: `${props.resourceNamePrefix.toLowerCase()}ai-sales-roleplay-s3vectors-index`,
      dimension: 1024, // Cohere Embed Multilingual V3の次元数
      dataType: 'float32',
      distanceMetric: 'cosine',
      metadataConfiguration: {
        nonFilterableMetadataKeys: ['chunk_id']
      }
    });

    // Vector IndexはVector Bucketに依存
    vectorIndex.addDependency(vectorBucket);

    // Knowledge Base用のIAMロールを作成
    this.role = new iam.Role(this, 'KnowledgeBaseRole', {
      roleName: `${props.resourceNamePrefix}ai-sales-roleplay-s3vectors-kb-role`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
      ],
    });

    // S3 Vectors用の権限を追加（広範囲）
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3vectors:*',
        ],
        resources: [
          `arn:aws:s3vectors:${stack.region}:${stack.account}:bucket/*`,
        ],
      })
    );

    // データソースS3バケットへの権限を追加
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:ListBucket',
        ],
        resources: [
          props.dataSourceBucket.bucketArn,
          `${props.dataSourceBucket.bucketArn}/*`,
        ],
      })
    );

    // Bedrock Foundation Modelへの権限を追加
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
        ],
        resources: [
          `arn:aws:bedrock:${stack.region}::foundation-model/cohere.embed-multilingual-v3`,
        ],
      })
    );

    // Vector Bucket PolicyでBedrockサービスロールのアクセス権限を設定
    const vectorBucketPolicy = new s3vectors.CfnVectorBucketPolicy(this, 'VectorBucketPolicy', {
      vectorBucketArn: vectorBucket.getAtt('VectorBucketArn').toString(),
      policy: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'BedrockKnowledgeBaseAccess',
            Effect: 'Allow',
            Principal: {
              AWS: this.role.roleArn,
            },
            Action: [
              's3vectors:QueryVectors',
              's3vectors:PutVectors',
              's3vectors:GetVectors',
              's3vectors:DeleteVectors',
              's3vectors:ListVectors',
              's3vectors:GetIndex',
              's3vectors:ListIndexes',
            ],
            Resource: [
              vectorBucket.getAtt('VectorBucketArn').toString(),
              `${vectorBucket.getAtt('VectorBucketArn').toString()}/*`,
            ],
          },
        ],
      },
    });

    // Vector Bucket PolicyはVector BucketとIAMロールに依存
    vectorBucketPolicy.addDependency(vectorBucket);
    vectorBucketPolicy.addDependency(this.role.node.defaultChild as iam.CfnRole);

    // Knowledge Baseを作成
    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: `${props.resourceNamePrefix}ai-sales-roleplay-s3vectors`,
      description: 'AI Sales Roleplay Knowledge Base with S3 Vectors',
      roleArn: this.role.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${stack.region}::foundation-model/cohere.embed-multilingual-v3`,
        },
      },
      storageConfiguration: {
        type: 'S3_VECTORS',
        s3VectorsConfiguration: {
          vectorBucketArn: vectorBucket.getAtt('VectorBucketArn').toString(),
          indexArn: vectorIndex.ref,
        },
      },
    });

    // Knowledge BaseはVector IndexとVector Bucket Policyに依存
    this.knowledgeBase.addDependency(vectorIndex);
    this.knowledgeBase.addDependency(vectorBucketPolicy);

    // S3データソースを作成
    const dataSource = new bedrock.CfnDataSource(this, 'DataSource', {
      knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
      name: `${props.resourceNamePrefix}ai-sales-roleplay-s3vectors-datasource`,
      description: 'S3 Data source for AI Sales Roleplay',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.dataSourceBucket.bucketArn,
          inclusionPrefixes: ['scenarios/'],
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 20,
          },
        },
      },
    });

    // Data SourceはKnowledge Baseに依存
    dataSource.addDependency(this.knowledgeBase);

    // 外部から参照できるようにKnowledge Base IDを設定
    this.knowledgeBaseId = this.knowledgeBase.attrKnowledgeBaseId;
  }
}