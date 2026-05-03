import * as path from 'path';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
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

    const logGroup = new logs.LogGroup(this, 'ServiceLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy,
    });

    const vpc = new ec2.Vpc(this, 'Vpc', {
      availabilityZones: [`${props.stage.region}a`, `${props.stage.region}b`],
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });
    vpc.applyRemovalPolicy(removalPolicy);

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'WebService', {
      vpc,
      publicLoadBalancer: true,
      assignPublicIp: true,
      desiredCount: 1,
      minHealthyPercent: 100,
      cpu: 256,
      memoryLimitMiB: 512,
      serviceName: props.stage.serviceName,
      taskImageOptions: {
        image: ecs.ContainerImage.fromDockerImageAsset(image),
        containerPort: 8501,
        logDriver: ecs.LogDrivers.awsLogs({
          logGroup,
          streamPrefix: props.stage.serviceName,
        }),
        environment: {
          APP_STAGE: props.stage.name,
          AWS_REGION: this.region,
          DOCUMENT_BUCKET: documentBucket.bucketName,
          PROMPT_BUCKET: promptBucket.bucketName,
          EVENTS_TABLE: eventsTable.tableName,
          PROCESSING_TABLE: processingTable.tableName,
          MODEL_TABLE: modelTable.tableName,
          MODEL_ID: DEFAULT_MODEL_ID,
        },
      },
    });
    service.targetGroup.configureHealthCheck({
      path: '/_stcore/health',
      healthyHttpCodes: '200',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });
    service.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');

    const taskRole = service.taskDefinition.taskRole;
    documentBucket.grantReadWrite(taskRole);
    promptBucket.grantReadWrite(taskRole);
    eventsTable.grantReadWriteData(taskRole);
    processingTable.grantReadWriteData(taskRole);
    modelTable.grantReadWriteData(taskRole);
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream', 'textract:*'],
        resources: ['*'],
      }),
    );

    service.node.addDependency(logGroup);

    const serviceUrl = `http://${service.loadBalancer.loadBalancerDnsName}`;

    new CfnOutput(this, 'ServiceUrl', { value: serviceUrl });
    new CfnOutput(this, 'DocumentBucketName', { value: documentBucket.bucketName });
    new CfnOutput(this, 'PromptBucketName', { value: promptBucket.bucketName });
    new CfnOutput(this, 'EventsTableName', { value: eventsTable.tableName });
    new CfnOutput(this, 'SmokeTestCommand', {
      value: `python tests/smoke_test.py --url ${serviceUrl}`,
    });
  }
}
