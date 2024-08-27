import { OpenAI } from "openai";

class OpenAIModel {
  constructor(config={ apiKey, model }, mockResponse = false) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.client = new OpenAI(config);
    this.mockResponse = mockResponse;
  }

  async getChatResponse(messages, n = 1, streamHandler = null, max_tokens = null, temperature = null) {
    if (!this.model) throw new Error('No openai model selected for request.');

    const request = {
      model: this.model,
      messages,
      n,
      stream: !!streamHandler,
    };

    if (max_tokens) request.max_tokens = max_tokens;
    if (temperature !== null) request.temperature = temperature;
  
    return this.makeRequest(request, streamHandler);
  }

  async makeRequest(request, streamHandler = null) {
    if (this.mockResponse) {
      return {
        content: `
        async function doTask() {
          console.log('this is a mock answer function')
        }`
      };
    }

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(request)
    };

    if (streamHandler) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', options);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          const message = line.replace(/^data: /, '');
          if (message === '[DONE]') break;
          try {
            const parsed = JSON.parse(message);
            streamHandler(parsed);
          } catch (error) {
            console.error('Error parsing stream message:', error);
          }
        }
      }
    } else {
      const response = await fetch('https://api.openai.com/v1/chat/completions', options);
      const responseJson = await response.json();
  
      if (responseJson.error) {
        if (responseJson.error.code == 'invalid_api_key') throw new Error('Invalid OpenAI api key.');
        throw responseJson.error;
      }
      return responseJson.choices[0].message;
    }
  }

  async getVector(query){
    const request = {
      "model": "text-embedding-ada-002",
      "input": query,
    };
  
    try {
      const response = await this.client.embeddings.create(request);
      return response.data[0].embedding;
    }
    catch (error) {
      if (error.response) {
        console.error(error.response.status);
        console.error(error.response.data);
      } else {
        console.error(error.message);
      }
      throw error;
    }
  }
}

export default OpenAIModel;