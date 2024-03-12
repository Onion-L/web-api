import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import * as apig from "aws-cdk-lib/aws-apigateway";
import {reviews} from '../seed/reviews';
import {generateBatch} from '../shared/util';
import { Construct } from 'constructs';

export class WebApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

     // Tables 
     const moviesReviewTable = new dynamodb.Table(this, "MoviesReviewTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "MoviesReview",
    });

    const getAllReviewsFn = new lambdanode.NodejsFunction(this, "getAllReviewsFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/getAllReviews.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesReviewTable.tableName,
        REGION: "eu-west-1",
      },
    });
  
    const getMovieReviewFn = new lambdanode.NodejsFunction(this, "getMovieReviewFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/getMoviesReview.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesReviewTable.tableName,
        REGION: "eu-west-1",
      },
    });

    const getReviewerCommentsFn = new lambdanode.NodejsFunction(this, "getReviewerCommentsFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/getReviewerComments.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesReviewTable.tableName,
        REGION: "eu-west-1",
      },
    });

    const newMovieReviewFn = new lambdanode.NodejsFunction(this, "AddMovieReviewFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambdas/addMovieReview.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesReviewTable.tableName,
        REGION: "eu-west-1",
      },
    });

    const updateMovieReviewFn = new lambdanode.NodejsFunction(this, "updateMovieReviewFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambdas/updateReview.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesReviewTable.tableName,
        REGION: "eu-west-1",
      },
    });

    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [moviesReviewTable.tableName]: generateBatch(reviews),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), 
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [moviesReviewTable.tableArn],  
      }),
    });

    moviesReviewTable.grantReadData(getMovieReviewFn);
    moviesReviewTable.grantReadData(getReviewerCommentsFn);
    moviesReviewTable.grantReadData(getAllReviewsFn);
    moviesReviewTable.grantReadWriteData(newMovieReviewFn);
    moviesReviewTable.grantReadWriteData(updateMovieReviewFn);



    const api = new apig.RestApi(this, "RestAPI", {
      description: "demo api",
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });


    const moviesEndpoint = api.root.addResource("movies");

    const moviesReviewEndpoint = moviesEndpoint.addResource("{movieId}").addResource("reviews");
    moviesReviewEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewFn, { proxy: true })
    );

    const reviewerEndpoint = moviesReviewEndpoint.addResource("{reviewerName}");
    reviewerEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewFn, { proxy: true })
    );
    reviewerEndpoint.addMethod(
      "PUT",
      new apig.LambdaIntegration(updateMovieReviewFn, { proxy: true })
    );

/*    const yearEndpoint = moviesReviewEndpoint.addResource("{year}");
    yearEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewFn, { proxy: true })
    );
*/

    const allMoviesReviewEndpoint = moviesEndpoint.addResource('reviews');
    allMoviesReviewEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(newMovieReviewFn, { proxy: true })
    );
    allMoviesReviewEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getAllReviewsFn, { proxy: true })
    );

    const reviewerCommentEndpoint = api.root.addResource("reviews").addResource("{reviewerName}");
    reviewerCommentEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getReviewerCommentsFn, { proxy: true })
    ); 
  }
}