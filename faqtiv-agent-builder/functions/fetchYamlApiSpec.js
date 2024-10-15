const SwaggerParser = require('swagger-parser');
const fetch = require('node-fetch');
const yaml = require('js-yaml');

/**
 * Fetches the API spec from the given URL and parses it using Swagger-Parser.
 *
 * @param {string} apiUrl - The URL of the API spec to fetch.
 * @returns {Promise<Object>} - The parsed API spec object.
 */
async function fetchYamlApiSpec(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch API spec: ${response.statusText}`);
    }
    const apiSpecText = await response.text();
    const apiSpec = yaml.load(apiSpecText)
    const parsedSpec = SwaggerParser.parse(apiSpec);
    return parsedSpec;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
