# Standalone FAQtiv Agent

This is a standalone version of a FAQtiv agent. It includes all the necessary components to run the agent independently.

## Setup

1. Install the required dependencies:

   ```
   {{ installCommand }}
   ```

3. Set up your OpenAI API and model as environment variables:

   ```
   export OPENAI_API_KEY=your_api_key_here
   export OPENAI_MODEL=gpt-4o
   ```

### Other environment variables

- `TOOL_TIMEOUT`: The timeout for tool execution in milliseconds. Defaults to 60000 (60 seconds).

## Running the Agent

You can run the agent in two modes:

### Interactive CLI Mode

To start the agent in interactive CLI mode, run:

```
{{ cliAgentCommand }}
```

You can then interact with the agent by typing your requests. Type 'exit' to quit.

### HTTP Server Mode

To start the agent as an HTTP server, run:

```
{{ httpServerCommand }}
```

By default, the server will run on `http://localhost:8000`. 

For more detailed information on how to use these endpoints, refer to the original FAQtiv Agent Toolkit documentation.

## Note

This standalone agent is a static export and does not have the ability to compile new tasks or modify existing ones. It represents the agent's state at the time of export.