# Document Arena

Public AWS CDK implementation of a document processing and evaluation UI.

The project replaces an internal Streamlit deployment package with a public AWS-native implementation:

- AWS CDK v2 TypeScript app
- AWS CDK Pipelines backed by CodePipeline and CodeBuild
- Streamlit app deployed on AWS App Runner from a CDK Docker image asset
- S3 buckets for uploaded documents and prompt templates
- DynamoDB tables for processing sessions, events, and model metadata
- Optional Bedrock model calls using the Amazon Nova 2 Lite cross-region inference profile

Default model:

```text
us.amazon.nova-2-lite-v1:0
```

## Manual Setup

Before deploying the CDK Pipeline:

1. Create a GitHub repository for this generated public project.
2. Create and authorize an AWS CodeConnections connection to that repository.
3. Provide the source and connection values:

```bash
export SOURCE_REPO=<github-owner>/<repo-name>
export SOURCE_BRANCH=main
export CODESTAR_CONNECTION_ARN=<codeconnections-arn>
```

For this conversion:

```bash
export SOURCE_REPO=FilippoLentoni/UI_V1
export SOURCE_BRANCH=main
export CODESTAR_CONNECTION_ARN=arn:aws:codeconnections:us-east-2:169976659173:connection/526725bb-a25d-4d67-b9eb-e06dccd1e413
```

If the repository is brand new and empty, create the base `main` branch first with a tiny README. Then push generated code to a feature branch and open a pull request into `main`.

## Quick Deploy

Install dependencies:

```bash
npm install
```

Bootstrap the pipeline and workload account/regions:

```bash
AWS_PROFILE=columbia npx cdk bootstrap aws://169976659173/us-east-2
```

Deploy a personal stack directly for low-cost smoke testing:

```bash
DOCKER_BUILDKIT=1 AWS_PROFILE=columbia APP_REGION=us-east-2 npm run deploy:personal -- --require-approval never
```

On Apple Silicon machines, install Docker Buildx before the direct personal deploy so CDK can build the App Runner image for `linux/amd64`.

Deploy the CDK Pipeline:

```bash
AWS_PROFILE=columbia \
PIPELINE_REGION=us-east-2 \
APP_REGION=us-east-2 \
SOURCE_REPO=<github-owner>/<repo-name> \
SOURCE_BRANCH=main \
CODESTAR_CONNECTION_ARN=<codeconnections-arn> \
npm run deploy:pipeline -- --require-approval never
```

The pipeline deploys alpha automatically, waits for manual approval before gamma, deploys gamma, waits for manual approval before prod, then deploys prod.

## Change Workflow

Do not push directly to `main` for normal development. Use a branch and pull request so peer/code review happens before deployment starts:

```bash
git checkout -b feature/my-change
git add .
git commit -m "Describe the change"
git push -u origin feature/my-change
```

Open a pull request into `main`. After review approval and merge, the CDK Pipeline starts from `main`.

## Stage Configuration

By default, all stages simulate multi-stage deployment in account `169976659173`.

| Stage | Stack | Default region |
| --- | --- | --- |
| personal | `DocumentArena-PersonalStack` | `APP_REGION` or `us-east-2` |
| alpha | `DocumentArena-AlphaStack` | `APP_REGION` or `us-east-2` |
| gamma | `DocumentArena-GammaStack` | `APP_REGION` or `us-east-2` |
| prod | `DocumentArena-ProdStack` | `APP_REGION` or `us-east-2` |

Override accounts and regions with:

```bash
export PERSONAL_ACCOUNT_ID=169976659173
export ALPHA_ACCOUNT_ID=169976659173
export GAMMA_ACCOUNT_ID=169976659173
export PROD_ACCOUNT_ID=169976659173
export APP_REGION=us-east-2
```

For real multi-account deployment, set distinct stage account IDs and bootstrap each target account/region with trust from the pipeline account.

## Commands

Build and run local validation:

```bash
npm test
```

Synthesize CloudFormation:

```bash
npm run synth
```

Run the Streamlit app locally:

```bash
cd app
pip install -r requirements.txt
streamlit run document_arena/Home.py
```

Smoke-test a deployed App Runner service:

```bash
python tests/smoke_test.py --url <service-url>
```

## Internal Mechanisms Replaced

| Internal mechanism | Public replacement |
| --- | --- |
| Internal build workspace and package metadata | `package.json`, `requirements.txt`, Dockerfile |
| Internal container image builder | CDK Docker image asset |
| Internal deployment pipeline constructs | `aws-cdk-lib/pipelines.CodePipeline` |
| Internal domain and auth interceptors | App Runner default HTTPS URL for portable external deployment |
| Internal auth/service onboarding | Public IAM roles scoped to S3, DynamoDB, Bedrock, and Textract |
| Internal stage account maps | Environment-variable driven stage config |
| Internal source review flow | GitHub pull request review before merge to `main` |

## Assumptions

- App Runner is used instead of custom ALB, CloudFront, internal auth, and internal hosted-zone automation to keep the external sample portable.
- The generated app supports document upload, prompt editing, session tracking, and optional Bedrock summarization.
- The smoke test uses App Runner's Streamlit health endpoint and does not require production-sized input data.
- Full Bedrock summarization requires model access for the configured inference profile in the target account.
