import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';

export class CdkPipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const gitHub = codebuild.Source.gitHub({
      owner: 'vasselva',
      repo: 'secure-api-gateway-auth0-lambda-custom-authorizer',
      webhook: false, // optional, default: true if `webhookFilters` were provided, false otherwise
      // webhookFilters: [
      //   codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs('master'),
      // ], // optional, by default all pushes and Pull Requests will trigger a build
    });

    // Build stage codebuild
    const project = new codebuild.Project(this, 'MyProject', {
     source: gitHub
    });

    // Test stage codebuild

     const cfn_nag = new codebuild.Project(this, 'CFN_NAG', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
        privileged: true,
      },
      // secondary sources and artifacts as above...
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'ls -lrt',
              'docker run -v `pwd`:/templates -t stelligent/cfn_nag /templates/secure-apigateway.template.json',
            ],
          },
        },
      }),
    });

    project.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['*'],
      // actions: ["cloudformation:*","s3:Createbucket",
      //           "s3:SetBucketEncryption","s3:DeleteBucket",
      //           "s3:GetEncryptionConfiguration","s3:PutEncryptionConfiguration",
      //           "s3:PutBucketPublicAccessBlock","s3:PutBucket*","s3:GetBucket*","apigateway:*",
      //           "execute-api:*"],
    }));

    //Artifact
    const sourceOutput = new codepipeline.Artifact();
    const cdkBuildOutput = new codepipeline.Artifact('CdkBuildOutput');
    const cfnNagBuildOutput = new codepipeline.Artifact('CfnNagBuildOutput');



    // Codepipeline stack to trigger codebuild
    new codepipeline.Pipeline(this, 'Pipeline', {
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: 'GitHub_Source',
              owner: 'vasselva',
              repo: 'secure-api-gateway-auth0-lambda-custom-authorizer',
              oauthToken: cdk.SecretValue.secretsManager('my-github-token'),
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'CDK_Build',
              project: project,
              input: sourceOutput,
              outputs: [cdkBuildOutput],
            }),
          ],
        },
        {
          stageName: 'Test',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'IntegrationTest',
              project: cfn_nag,
              input: cdkBuildOutput,
              outputs: [cfnNagBuildOutput],
              type: codepipeline_actions.CodeBuildActionType.TEST, // default is BUILD
            }),
          ],
        },
      ],
    });

  }
}

