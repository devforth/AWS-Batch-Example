const AWS = require('aws-sdk');
const md5 = require('md5');
const slsStackOutput = require('./sls-stack-output.json');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startBatchJob(jobInput, jobsCount) {
    const batch = new AWS.Batch();
    const dynamodb = new AWS.DynamoDB.DocumentClient();

    const jobDefinition = slsStackOutput.JobDefinition;
    const jobQueue = slsStackOutput.BatchQueue;
    const dynamoTable = slsStackOutput.DynamoTable;

    const jsonString = JSON.stringify(jobInput);
    const jsonMD5 = md5(jsonString);

    const putObject = await dynamodb.put({
        TableName: dynamoTable,
        Item: {
            ID: jsonMD5,
            TTL: Math.floor(new Date().getTime() / 1000) + (60 * 30), // Delete record from dynamo after 30 minutes
            input: jsonString,
        },
    }).promise();

    console.log("Put: ", JSON.stringify(putObject));

    const submitResult = await batch.submitJob({
        jobDefinition,
        jobQueue,
        jobName: "md5_brute_force",
        arrayProperties: {
            size: jobsCount,
        },
        containerOverrides: {
            environment: [
                {
                    name: "jsonMD5",
                    value: jsonMD5,
                },
                {
                    name: "jobsCount",
                    value: jobsCount.toString()
                }
            ],
        },
    }).promise();

    return { jsonMD5, jobId: submitResult.jobId };
}

async function waitForBatchJob(jobId) {
    const batch = new AWS.Batch();
    let status = '';

    while (!['SUCCEEDED', 'FAILED'].includes(status)) {
        const result = await batch.describeJobs({
            jobs: [jobId]
        }).promise();

        status = result.jobs[0].status;
        const statusSummary = result.jobs[0].arrayProperties ?
            Object.keys(result.jobs[0].arrayProperties.statusSummary).reduce((acc, key) => {
                if (result.jobs[0].arrayProperties.statusSummary[key] > 0) {
                    acc.push(`${key}: ${result.jobs[0].arrayProperties.statusSummary[key]}`);
                }
                return acc;
            }, [])
        : '';
        console.log('Current status', status, statusSummary);
        await sleep(1000);
    }

}

async function retrieveResult(jsonMD5) {
    const dynamo = new AWS.DynamoDB.DocumentClient();

    const result = await dynamo.get({
        TableName: slsStackOutput.DynamoTable,
        Key: { ID: jsonMD5 }
    }).promise();

    return result.Item.password;
}

async function main() {
    const argv = process.argv.slice(2);

    if (argv.length !== 5 && argv.length !== 6) {
        console.log('Not enought arguments. You must supply at least 5 arguments in that order: aws profile, brute force min length, brute force max length, hex formated md5, number of instances to use, <alphabet>.');
        process.exitCode = 1;
    }

    const [profile, minLength, maxLength, md5, instanceCount, alphabet] = argv;

    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile });
    AWS.config.region = slsStackOutput.Region;

    const { jsonMD5, jobId } = await startBatchJob({ minLength, maxLength, md5, alphabet }, instanceCount);
    await waitForBatchJob(jobId);
    const result = await retrieveResult(jsonMD5);

    if (result) {
        console.log('Password is:', result);
    } else {
        console.log('Password wasn\'t found');
    }

}

main();