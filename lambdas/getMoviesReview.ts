import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {     // Note change
  try {
    console.log("Event: ", event);
    const parameters = event?.pathParameters;
    const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
    const reviewerName = parameters?.reviewerName;
    
    const queryStringParameters = event?.queryStringParameters;
    const minRating = queryStringParameters?.minRating ? parseInt(queryStringParameters.minRating) : undefined;
    const year = queryStringParameters?.year ? parseInt(queryStringParameters.year) : undefined;


    if (!movieId) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Missing movie Id" }),
      };
    }

    const commandOutput = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { id: movieId },
      })
    );
    console.log("GetCommand response: ", commandOutput);
    if (!commandOutput.Item) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Invalid movie Id" }),
      };
    }
    let reviews = commandOutput.Item.results;
    let body = {
      data: reviews,
    };

    if(minRating) {
      let result = [];
      for (let i = 0; i < reviews.length; i++) {
        if(reviews[i].author_details.rating >= minRating) {
          result.push(reviews[i])
        }
      }
      body.data = result;
    }

    if(reviewerName) {
      let result = [];
      for (let i = 0; i < reviews.length; i++) {
        
        if(reviews[i].author_details.name === reviewerName || reviews[i].author_details.username === reviewerName) {
          result.push(reviews[i])
        }
      }
      body.data = result;
    }

    if(year) {
      let result = [];
      for (let i = 0; i < reviews.length; i++) {
        if(new Date(reviews[i].updated_at).getFullYear() === year) {
          result.push(reviews[i])
        }
      }
      body.data = result;
    }


    // Return Response
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ error }),
    };
  }
};

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
