const cdk = require('aws-cdk-lib');
const lambdaNode = require('aws-cdk-lib/aws-lambda-nodejs');
const logs = require('aws-cdk-lib/aws-logs');
const lambda = require('aws-cdk-lib/aws-lambda');
const path = require('path');
const secretsmanager = require('aws-cdk-lib/aws-secretsmanager');

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

    // NOTE: unsafePlainText should not be used in production, secrets should be created in the AWS console
    const openaiKeySecret = new secretsmanager.Secret(this, 'OpenAIApiKeySecret', {
      secretName: `${agentId}-openai-key-${environment}`,
      secretStringValue: cdk.SecretValue.unsafePlainText(process.env.OPENAI_API_KEY || ''),
    });

    let agentGatewayTokenSecret = null;
    if (process.env.AGENT_GATEWAY_TOKEN) {
      agentGatewayTokenSecret = new secretsmanager.Secret(this, 'AgentGatewayTokenSecret', {
        secretName: `${agentId}-agent-gateway-token-${environment}`,
        secretStringValue: cdk.SecretValue.unsafePlainText(process.env.AGENT_GATEWAY_TOKEN || ''),
      });
    }

    const agentLambda = new lambdaNode.NodejsFunction(this, `Agent-${agentId}`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/index.js'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 256,
      environment: {
        OPENAI_API_KEY_SECRET_NAME: openaiKeySecret.secretName,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
        AGENT_GATEWAY_URL: process.env.AGENT_GATEWAY_URL,
        AGENT_GATEWAY_TOKEN_SECRET_NAME: agentGatewayTokenSecret ? agentGatewayTokenSecret.secretName : null,
        AWS_XRAY_ENABLED: process.env.AWS_XRAY_ENABLED || 'false'
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        commandHooks: {
          beforeBundling(inputDir, outputDir) {
            return [
              // Copy examples and data directories into the output bundle
              `cp -r ${inputDir}/src/examples ${outputDir}/examples`,
              `cp -r ${inputDir}/src/data ${outputDir}/data`
            ];
          },
          afterBundling() {
            return [];
          },
          beforeInstall() {
            return [];
          }
        }
      },
      tracing: lambda.Tracing.ACTIVE,
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
