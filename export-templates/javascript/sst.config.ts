/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "bank-agent-lambda",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    new sst.aws.Function("AgentLambda", {
      handler: "index.handler",
      bundle: 'dist',
      timeout: "15 minutes",
      memory: "1024 MB",
      environment: {},
      url: {
        cors: {
          allowOrigins: [],
          exposeHeaders: ['Content-Type', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods'],
          allowHeaders: ['Content-Type', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods'],
          allowMethods: ['*'],
          allowCredentials: false,
        }
      },
      streaming: true,
      runtime: "nodejs22.x",
      vpc: {
        privateSubnets: [],
        securityGroups: [],
      },
      copyFiles: [
        { from: "src/examples", to: "examples" },
        { from: "src/data", to: "data" }
      ],
    });
  },
});
