import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import * as apig from "aws-cdk-lib/aws-apigateway";
import {reviews} from '../seed/reviews';
import {generateBatch} from '../shared/util';
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { AuthApi } from './auth-api'
import { Construct } from 'constructs';

export class WebApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new UserPool(this, "UserPool", {
      signInAliases: { username: true, email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolId = userPool.userPoolId;

    const appClient = userPool.addClient("AppClient", {
      authFlows: { userPassword: true },
    });

    const userPoolClientId = appClient.userPoolClientId;

     // Tables 
     const moviesReviewTable = new dynamodb.Table(this, "MoviesReviewTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "MoviesReview",
    });
   
    const appCommonFnProps =  {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesReviewTable.tableName,
        USER_POOL_ID: userPoolId,
        CLIENT_ID: userPoolClientId,
        REGION: 'eu-west-1',
      }
    }


    const getAllReviewsFn = new lambdanode.NodejsFunction(this, "getAllReviewsFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/getAllReviews.ts`
    });
  
    const getMovieReviewFn = new lambdanode.NodejsFunction(this, "getMovieReviewFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/getMoviesReview.ts`
    });

    const getReviewerCommentsFn = new lambdanode.NodejsFunction(this, "getReviewerCommentsFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/getReviewerComments.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesReviewTable.tableName,
        USER_POOL_ID: userPoolId,
        CLIENT_ID: userPoolClientId,
        REGION: 'eu-west-1',
      }
    });

    const newMovieReviewFn = new lambdanode.NodejsFunction(this, "AddMovieReviewFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/addMovieReview.ts`
    });

    const updateMovieReviewFn = new lambdanode.NodejsFunction(this, "updateMovieReviewFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/updateReview.ts`
    });

    const reviewTranslateFn =new lambdanode.NodejsFunction(this, "reviewTranslateFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/translateReview.ts`
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
    moviesReviewTable.grantReadWriteData(reviewTranslateFn);
    moviesReviewTable.grantReadWriteData(newMovieReviewFn);
    moviesReviewTable.grantReadWriteData(updateMovieReviewFn);



    const authorizerFn = new lambdanode.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: "./lambdas/auth/authorizer.ts",
    });

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

    new AuthApi(this, 'AuthServiceApi', {
      userPoolId: userPoolId,
      userPoolClientId: userPoolClientId,
    });

    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      "RequestAuthorizer",
      {
        identitySources: [apig.IdentitySource.header("cookie")],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      }
    );

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
      new apig.LambdaIntegration(updateMovieReviewFn, { proxy: true }),
      {
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
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
      new apig.LambdaIntegration(newMovieReviewFn, { proxy: true }),
      {
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
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
    const translateEndpoint = reviewerCommentEndpoint.addResource("{movieId}").addResource("translation");
    translateEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(reviewTranslateFn, { proxy: true })

    )
  }
}