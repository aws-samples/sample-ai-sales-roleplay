import { Stack, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import { CfnDistribution, Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { NodejsBuild } from 'deploy-time-build';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface WebProps {
  apiEndpointUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  idPoolId: string;
  selfSignUpEnabled: boolean;
  webAclId?: string;
  resourceNamePrefix?: string; // リソース名のプレフィックス
  transcribeWebSocketEndpoint: string; // Transcribe WebSocketエンドポイント
}

export class Web extends Construct {
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);

    const commonBucketProps: s3.BucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      enforceSSL: true,
      versioned: false,
    };

    const { cloudFrontWebDistribution, s3BucketInterface } = new CloudFrontToS3(
      this,
      'Web',
      {
        insertHttpSecurityHeaders: false,
        loggingBucketProps: commonBucketProps,
        bucketProps: commonBucketProps,
        cloudFrontLoggingBucketProps: commonBucketProps,
        cloudFrontDistributionProps: {
          errorResponses: [
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              responsePagePath: '/index.html',
            },
            {
              httpStatus: 404,
              responseHttpStatus: 200,
              responsePagePath: '/index.html',
            },
          ],
        },
      }
    );

    if (props.webAclId) {
      const existingCloudFrontWebDistribution = cloudFrontWebDistribution.node
        .defaultChild as CfnDistribution;
      existingCloudFrontWebDistribution.addPropertyOverride(
        'DistributionConfig.WebACLId',
        props.webAclId
      );
    }

    new NodejsBuild(this, 'BuildWeb', {
      assets: [
        {
          path: '../frontend',
          exclude: [
            'node_modules',
            'dist',
            '.git',
            '.gitignore',
            '*.md',
            'README.md',
          ],
        },
      ],
      destinationBucket: s3BucketInterface,
      distribution: cloudFrontWebDistribution,
      outputSourceDirectory: './dist',
      buildCommands: ['npm install', 'npm run build'],
      nodejsVersion: 22,
      buildEnvironment: {
        VITE_API_GATEWAY_ENDPOINT: props.apiEndpointUrl,
        VITE_API_REGION: Stack.of(this).region,
        VITE_COGNITO_REGION: Stack.of(this).region,
        VITE_COGNITO_USER_POOL_ID: props.userPoolId,
        VITE_COGNITO_USER_POOL_CLIENT_ID: props.userPoolClientId,
        VITE_COGNITO_IDENTITY_POOL_ID: props.idPoolId,
        VITE_APP_SELF_SIGN_UP_ENABLED: props.selfSignUpEnabled.toString(),
        VITE_TRANSCRIBE_WEBSOCKET_URL: props.transcribeWebSocketEndpoint,
      },
    });

    new CfnOutput(this, 'WebUrl', {
      value: `https://${cloudFrontWebDistribution.domainName}`,
    });

    this.distribution = cloudFrontWebDistribution;
  }
}
