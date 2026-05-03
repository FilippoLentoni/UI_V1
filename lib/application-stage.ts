import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DocumentArenaStack } from './document-arena-stack';
import { StageConfig } from './config';

export interface DocumentArenaApplicationStageProps extends StageProps {
  readonly stageConfig: StageConfig;
}

export class DocumentArenaApplicationStage extends Stage {
  constructor(scope: Construct, id: string, props: DocumentArenaApplicationStageProps) {
    super(scope, id, props);

    new DocumentArenaStack(this, 'Application', {
      env: props.env,
      stage: props.stageConfig,
    });
  }
}
