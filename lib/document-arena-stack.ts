import * as path from 'path';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_apprunner as apprunner,
  aws_dynamodb as dynamodb,
  aws_ecr_assets as ecrAssets,
  aws_iam as iam,
  aws_logs as logs,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DEFAULT_MODEL_ID, StageConfig } from './config';

export interface DocumentArenaStackProps extends StackProps {
  readonly stage: StageConfig;
}

export class DocumentArenaStack extends Stack {
  constructor(scope: Construct, id: string, props: DocumentArenaStackProps) {
    super(scope, id, props);

    const removalPolicy =
      props.stage.removalPolicy === 'destroy' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN;
    const autoDeleteObjects = props.stage.removalPolicy === 'destroy';

    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects,
      removalPolicy,
      lifecycleRules: [{ expiration: Duration.days(30) }],
    });

    const promptBucket = new s3.Bucket(this, 'PromptBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects,
      removalPolicy,
      lifecycleRules: [{ expiration: Duration.days(30) }],
    });

    new s3deploy.BucketDeployment(this, 'SamplePrompts', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', 'test-data', 'prompts'))],
      destinationBucket: promptBucket,
      retainOnDelete: props.stage.removalPolicy !== 'destroy',
    });

    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      partitionKey: { name: 'session_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    const processingTable = new dynamodb.Table(this, 'ProcessingTable', {
      partitionKey: { name: 'session_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    const modelTable = new dynamodb.Table(this, 'ModelTable', {
      partitionKey: { name: 'model_name', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    const image = new ecrAssets.DockerImageAsset(this, 'AppImage', {
      directory: path.join(__dirname, '..', 'app'),
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    const accessRole = new iam.Role(this, 'AppRunnerEcrAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
    });
    image.repository.grantPull(accessRole);

    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });
    documentBucket.grantReadWrite(instanceRole);
    promptBucket.grantReadWrite(instanceRole);
    eventsTable.grantReadWriteData(instanceRole);
    processingTable.grantReadWriteData(instanceRole);
    modelTable.grantReadWriteData(instanceRole);
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream', 'textract:*'],
        resources: ['*'],
      }),
    );

    const logGroup = new logs.LogGroup(this, 'ServiceLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy,
    });

    const service = new apprunner.CfnService(this, 'AppRunnerService', {
      serviceName: props.stage.serviceName,
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: image.imageUri,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '8501',
            runtimeEnvironmentVariables: [
              { name: 'APP_STAGE', value: props.stage.name },
              { name: 'AWS_REGION', value: this.region },
              { name: 'DOCUMENT_BUCKET', value: documentBucket.bucketName },
              { name: 'PROMPT_BUCKET', value: promptBucket.bucketName },
              { name: 'EVENTS_TABLE', value: eventsTable.tableName },
              { name: 'PROCESSING_TABLE', value: processingTable.tableName },
              { name: 'MODEL_TABLE', value: modelTable.tableName },
              { name: 'MODEL_ID', value: DEFAULT_MODEL_ID },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: '0.25 vCPU',
        memory: '0.5 GB',
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/_stcore/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      observabilityConfiguration: {
        observabilityEnabled: false,
      },
      tags: [
        { key: 'stage', value: props.stage.name },
        { key: 'app', value: 'document-arena' },
      ],
    });
    service.node.addDependency(accessRole);
    service.node.addDependency(instanceRole);
    service.node.addDependency(logGroup);

    new CfnOutput(this, 'ServiceUrl', { value: `https://${service.attrServiceUrl}` });
    new CfnOutput(this, 'DocumentBucketName', { value: documentBucket.bucketName });
    new CfnOutput(this, 'PromptBucketName', { value: promptBucket.bucketName });
    new CfnOutput(this, 'EventsTableName', { value: eventsTable.tableName });
    new CfnOutput(this, 'SmokeTestCommand', {
      value: `python tests/smoke_test.py --url https://${service.attrServiceUrl}`,
    });
  }
}
