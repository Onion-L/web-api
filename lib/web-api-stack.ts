import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import { Construct } from 'constructs';
export class WebApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const WebApiFn = new lambdanode.NodejsFunction(this, "WebApiFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambdas/webApi.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

  }
}