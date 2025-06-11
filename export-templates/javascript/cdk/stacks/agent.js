const cdk = require('aws-cdk-lib');
const lambdaNode = require('aws-cdk-lib/aws-lambda-nodejs');
const logs = require('aws-cdk-lib/aws-logs');
const lambda = require('aws-cdk-lib/aws-lambda');
const path = require('path');

class AgentStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const {
      aws_env,
      environment,
      publisherId,
      agentId,
      tags = {},
    } = props;

    const agentLambda = new lambdaNode.NodejsFunction(this, `Agent-${agentId}`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/index.js'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 256,
      environment: {},
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const fnUrl = agentLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['content-type'],
      }
    });

    // Export the Function URL for the Gateway stack to use
    this.functionUrl = new cdk.CfnOutput(this, `AgentUrl-${agentId}`, {
      value: fnUrl.url,
      exportName: `AgentUrl-${agentId}`,
    });

    // Export the Agent Lambda Function ARN
    this.agentFunctionArn = new cdk.CfnOutput(this, `AgentFunctionArn-${agentId}`, {
      value: agentLambda.functionArn,
      exportName: `AgentFunctionArn-${agentId}`,
    });

    cdk.Tags.of(this).add('publisher_id', publisherId);
    cdk.Tags.of(this).add('agent_id', agentId);

    for (const [key, value] of Object.entries(tags)) {
      cdk.Tags.of(this).add(key, value);
    }
  }
}

module.exports = { AgentStack };
