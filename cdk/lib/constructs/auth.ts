import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  UserPool,
  UserPoolClient,
  UserPoolOperation,
} from 'aws-cdk-lib/aws-cognito';
import { IdentityPool, UserPoolAuthenticationProvider } from 'aws-cdk-lib/aws-cognito-identitypool';
import { Effect, Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export interface AuthProps {
  selfSignUpEnabled: boolean;
  allowedIpV4AddressRanges: string[] | null;
  allowedIpV6AddressRanges: string[] | null;
  allowedSignUpEmailDomains: string[] | null | undefined;
  resourceNamePrefix?: string; // リソース名のプレフィックス
}

export class Auth extends Construct {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  readonly idPool: IdentityPool;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: props.selfSignUpEnabled,
      signInAliases: {
        username: false,
        email: true,
      },
      passwordPolicy: {
        requireUppercase: true,
        requireSymbols: true,
        requireDigits: true,
        minLength: 8,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        preferredUsername: {
          required: false,
          mutable: true,
        },
      },
      removalPolicy: RemovalPolicy.DESTROY
    });

    const client = userPool.addClient('client', {
      idTokenValidity: Duration.days(1),
    });

    const idPool = new IdentityPool(this, 'IdentityPool', {
      authenticationProviders: {
        userPools: [
          new UserPoolAuthenticationProvider({
            userPool,
            userPoolClient: client,
          }),
        ],
      },
    });

    if (props.allowedIpV4AddressRanges || props.allowedIpV6AddressRanges) {
      const ipRanges = [
        ...(props.allowedIpV4AddressRanges
          ? props.allowedIpV4AddressRanges
          : []),
        ...(props.allowedIpV6AddressRanges
          ? props.allowedIpV6AddressRanges
          : []),
      ];

      idPool.authenticatedRole.attachInlinePolicy(
        new Policy(this, 'SourceIpPolicy', {
          statements: [
            new PolicyStatement({
              effect: Effect.DENY,
              resources: ['*'],
              actions: ['*'],
              conditions: {
                NotIpAddress: {
                  'aws:SourceIp': ipRanges,
                },
              },
            }),
          ],
        })
      );
    }

    // Lambda for email domain check
    if (props.allowedSignUpEmailDomains) {
      const checkEmailDomainFunction = new NodejsFunction(
        this,
        'CheckEmailDomain',
        {
          runtime: Runtime.NODEJS_22_X,
          architecture: Architecture.ARM_64,
          entry: 'lambda/checkEmailDomain.ts',
          timeout: Duration.minutes(15),
          environment: {
            ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR: JSON.stringify(
              props.allowedSignUpEmailDomains
            ),
          },
        }
      );

      userPool.addTrigger(
        UserPoolOperation.PRE_SIGN_UP,
        checkEmailDomainFunction
      );
    }

    // Grant permissions for AI Sales Coach specific services
    idPool.authenticatedRole.attachInlinePolicy(
      new Policy(this, 'GrantAccessBedrock', {
        statements: [
          new PolicyStatement({
            actions: [
              "bedrock:InvokeModel",
              "bedrock:InvokeModelWithResponseStream"
            ],
            resources: [
              "arn:aws:bedrock:*::foundation-model/*",
              "arn:aws:bedrock:*:*:inference-profile/*"
            ],
          }),
        ],
      })
    );

    // Grant permissions for Polly (text-to-speech)
    idPool.authenticatedRole.attachInlinePolicy(
      new Policy(this, 'GrantAccessPolly', {
        statements: [
          new PolicyStatement({
            actions: [
              'polly:SynthesizeSpeech',
              'polly:StartSpeechSynthesisTask',
              'polly:GetSpeechSynthesisTask'
            ],
            resources: ['*'],
          }),
        ],
      })
    );

    this.client = client;
    this.userPool = userPool;
    this.idPool = idPool;
  }
}
