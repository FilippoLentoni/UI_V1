import { App } from 'aws-cdk-lib';
import { DocumentArenaStack } from '../lib/document-arena-stack';
import { DeploymentPipelineStack } from '../lib/deployment-pipeline-stack';
import { STAGES } from '../lib/config';

const app = new App();

const pipelineRegion = process.env.PIPELINE_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-2';
const pipelineAccount = process.env.PIPELINE_ACCOUNT_ID ?? process.env.CDK_DEFAULT_ACCOUNT ?? '169976659173';

for (const stage of STAGES) {
  new DocumentArenaStack(app, `DocumentArena-${stage.stackSuffix}Stack`, {
    env: {
      account: stage.account,
      region: stage.region,
    },
    stage,
  });
}

new DeploymentPipelineStack(app, 'DocumentArenaPipelineStack', {
  env: {
    account: pipelineAccount,
    region: pipelineRegion,
  },
});
