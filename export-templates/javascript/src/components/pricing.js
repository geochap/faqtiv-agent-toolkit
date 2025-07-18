const MODEL_PRICING = {
  // GPT-4o Models
  'gpt-4o-2024-11-20': { input: 2.5, output: 10 },
  'gpt-4o-2024-08-06': { input: 2.5, output: 10 },
  'gpt-4o-2024-05-13': { input: 5, output: 15 },

  // GPT-4o Mini Models
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-audio-preview': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-audio-preview-2024-12-17': { input: 0.15, output: 0.6 },

  // GPT-3.5 Turbo Models
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'gpt-3.5-turbo-16k': { input: 3, output: 4 },

  // o3 Models
  'o3-2025-04-16': { input: 2, output: 8 },

  // o3-mini Models
  'o3-mini-2025-01-31': { input: 1.1, output: 4.4 },

  // GPT-4.1 Models
  'gpt-4.1-2025-04-14': { input: 2, output: 8 },

  // GPT-4.1 Mini Models
  'gpt-4.1-mini-2025-04-14': { input: 0.4, output: 1.6 },

  // GPT-4.1 Nano Models
  'gpt-4.1-nano-2025-04-14': { input: 0.1, output: 0.4 }
};


function calculateCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  
  if (!pricing) {
    return {
      total_cost: 0,
      input_cost: 0,
      output_cost: 0,
      pricing_details: {
        input_price_per_token: 0,
        output_price_per_token: 0,
        model
      }
    };
  }
  
  const inputCost = (inputTokens / 1000000) * pricing.input;
  const outputCost = (outputTokens / 1000000) * pricing.output;
  return {
    total_cost: Number((inputCost + outputCost).toFixed(6)),
    input_cost: Number(inputCost.toFixed(6)),
    output_cost: Number(outputCost.toFixed(6)),
    pricing_details: {
      input_price_per_token: pricing.input / 1000000,
      output_price_per_token: pricing.output / 1000000,
      model
    }
  };
}

module.exports = {
  calculateCost,
  MODEL_PRICING
}; 