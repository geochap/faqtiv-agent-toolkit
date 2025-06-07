import { OpenAI } from "openai";

//todo:move to config?
import dotenv from 'dotenv';
dotenv.config();


export async function llm(system, user, model = "gpt-4.1-mini") {
  const openai = new OpenAI();

  const completion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: system || 'You are a helpful assistant' },
      { role: 'user', content: user }
    ],
    model: model,
  });

  return completion.choices[0].message.content;
}

export async function getEmbedding(text, embeddingModel = "text-embedding-3-small") {
  const openai = new OpenAI();

  const response = await openai.embeddings.create({
    model: embeddingModel,
    input: text,
  });

  return response.data[0].embedding;
}

export function stripMarkdownFences(text) {
  return text
    .replace(/^```(?:[^\n]*)?\n/, '') // opening triple-backtick (optionally with language spec)
    .replace(/\n```$/, '');          // closing triple-backtick
}
