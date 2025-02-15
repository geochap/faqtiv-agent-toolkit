/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "bank-report-demo-py",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    new sst.aws.Function("BankReportDemoPy", {
      handler: "main.handler",
      runtime: "python3.11",
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
      copyFiles: [
        { from: "dist", to: "." }
      ],
    });
  },
}); 