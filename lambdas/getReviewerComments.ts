import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand ,ScanCommand} from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {     // Note change
  try {
    console.log("Event: ", event);
    const parameters = event?.pathParameters;
    const reviewerName = parameters?.reviewerName;
    const queryStringParameters = event?.queryStringParameters;
    // const minRating = queryStringParameters?.minRating ? parseInt(queryStringParameters.minRating) : undefined;


    const commandOutput = await ddbDocClient.send(
      new ScanCommand({
        TableName: process.env.TABLE_NAME,
      })
    );
    console.log("GetCommand response: ", commandOutput);
    
    if (!commandOutput.Items) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "review not found" }),
      };
    }
    let reviews = commandOutput.Items;

    let body = {
      data: reviews,
    };

    if(reviewerName) {
      let result = [];
      for (let i = 0; i < reviews.length; i++) {
        for (let j = 0; j < reviews[i].results.length; j++) {
          const authorDetails = reviews[i].results[j].author_details;
          if(authorDetails?.name === reviewerName || authorDetails?.username === reviewerName) {
            result.push(reviews[i].results[j]);
          }
        }
      }
      body.data = result;
    }

    console.log("Table Name:", process.env.TABLE_NAME);
    console.log("Results:", body.data);
    console.log("Command Output:", commandOutput);

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
      body: JSON.stringify({ error: error.message })
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
