require('dotenv').config();
const cdk = require('aws-cdk-lib');
const { AgentStack } = require('../stacks/agent.js');

const app = new cdk.App();

// Environment configuration
const environment = app.node.tryGetContext('environment') || 'dev';
const stackPrefix = `faqtiv-agent-${environment}`;

const commonProps = {
  environment,
  aws_env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_REGION,
  },
  tags: {
    Environment: environment,
    Project: 'faqtiv-agent',
    ManagedBy: 'CDK',
  },
};

// Deploy agent stack
new AgentStack(app, `${stackPrefix}-agent`, {
  ...commonProps,
  publisherId: process.env.PUBLISHER_ID,
  agentId: process.env.AGENT_ID,
});

app.synth(); 