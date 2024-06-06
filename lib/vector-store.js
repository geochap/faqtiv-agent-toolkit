import { MemoryVectorStore } from 'langchain/vectorstores/memory';

export default class VectorStore {
  constructor() {
    this.taskVectorStore = new MemoryVectorStore();
    this.functionsVectorStore = new MemoryVectorStore();
  }

  async addTaskVectors(vectors) {
    await this.taskVectorStore.addVectors(vectors.map(x => x.embedding), vectors.map(x => {
      return {
        pageContent: JSON.stringify({
          ...x,
          embedding: undefined
        }),
        metadata: { }
      };
    }));
  }

  async searchByTask(task, k) {
    return await this.taskVectorStore.similaritySearchVectorWithScore(task, k);
  }

  async addFunctionsHeaderVector(vectors) {
    await this.functionsVectorStore.addVectors(vectors.map(x => x.embedding), vectors.map(x => {
      return {
        pageContent: JSON.stringify({
          ...x,
          embedding: undefined
        }),
        metadata: { }
      };
    }));
  }

  async searchByFunctionsHeader(functionsHeader, k) {
    return await this.functionsVectorStore.similaritySearchVectorWithScore(functionsHeader, k);
  }
}