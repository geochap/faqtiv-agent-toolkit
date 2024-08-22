import { OpenAI } from "openai";

class OpenAIModel {
  constructor(config={ apiKey, organization }, mockResponse = false) {
    this.apiKey = config.apiKey;
    this.client = new OpenAI(config);
    this.mockResponse = mockResponse;
  }

  async getChatResponse(model, messages, n = 1) {
    if (!model) throw new Error('No openai model selected for request.');

    const request = {
      model,
      messages,
      n
    };
  
    return this.makeRequest(request);
  }

  async makeRequest(request) {
    if (this.mockResponse) {
      return {
        content: `
        async function doTask() {
          console.log('this is a mock answer function')
        }`
      };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      body: JSON.stringify(request),
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}`}
    });
    const responseJson = await response.json();
  
    if (responseJson.error) {
      if (responseJson.error.code == 'invalid_api_key') throw new Error('Invalid OpenAI api key.')

      throw responseJson.error;
    }
    return responseJson.choices[0].message;
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