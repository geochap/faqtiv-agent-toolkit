const MODEL_PRICING = {
  // GPT-4o Models
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-2024-11-20': { input: 0.0025, output: 0.01 },
  'gpt-4o-2024-08-06': { input: 0.0025, output: 0.01 },
  'gpt-4o-2024-05-13': { input: 0.005, output: 0.015 },

  // GPT-4o Mini Models
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o-mini-2024-07-18': { input: 0.00015, output: 0.0006 },
  'gpt-4o-mini-audio-preview': { input: 0.00015, output: 0.0006 },
  'gpt-4o-mini-audio-preview-2024-12-17': { input: 0.00015, output: 0.0006 },

  // GPT-3.5 Turbo Models
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },

  // o3 Models
  'o3': { input: 0.015, output: 0.06 },
  'o3-mini': { input: 0.0011, output: 0.0044 }
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
  
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return {
    total_cost: Number((inputCost + outputCost).toFixed(6)),
    input_cost: Number(inputCost.toFixed(6)),
    output_cost: Number(outputCost.toFixed(6)),
    pricing_details: {
      input_price_per_token: pricing.input / 1000,
      output_price_per_token: pricing.output / 1000,
      model
    }
  };
}

module.exports = {
  calculateCost,
  MODEL_PRICING
}; 