export interface StageConfig {
  readonly name: 'personal' | 'alpha' | 'gamma' | 'prod';
  readonly stackSuffix: 'Personal' | 'Alpha' | 'Gamma' | 'Prod';
  readonly account: string;
  readonly region: string;
  readonly removalPolicy: 'destroy' | 'retain';
  readonly serviceName: string;
}

const defaultAccount = process.env.CDK_DEFAULT_ACCOUNT ?? '169976659173';
const defaultRegion = process.env.APP_REGION ?? 'us-east-2';

export const STAGES: StageConfig[] = [
  {
    name: 'personal',
    stackSuffix: 'Personal',
    account: process.env.PERSONAL_ACCOUNT_ID ?? defaultAccount,
    region: process.env.PERSONAL_REGION ?? defaultRegion,
    removalPolicy: 'destroy',
    serviceName: 'document-arena-personal',
  },
  {
    name: 'alpha',
    stackSuffix: 'Alpha',
    account: process.env.ALPHA_ACCOUNT_ID ?? defaultAccount,
    region: process.env.ALPHA_REGION ?? defaultRegion,
    removalPolicy: 'retain',
    serviceName: 'document-arena-alpha',
  },
  {
    name: 'gamma',
    stackSuffix: 'Gamma',
    account: process.env.GAMMA_ACCOUNT_ID ?? defaultAccount,
    region: process.env.GAMMA_REGION ?? defaultRegion,
    removalPolicy: 'retain',
    serviceName: 'document-arena-gamma',
  },
  {
    name: 'prod',
    stackSuffix: 'Prod',
    account: process.env.PROD_ACCOUNT_ID ?? defaultAccount,
    region: process.env.PROD_REGION ?? defaultRegion,
    removalPolicy: 'retain',
    serviceName: 'document-arena-prod',
  },
];

export const DEFAULT_MODEL_ID = process.env.DOCUMENT_ARENA_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
