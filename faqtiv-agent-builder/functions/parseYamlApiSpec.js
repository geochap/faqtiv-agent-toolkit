/**
 * Parses a YAML API specification from a URL.
 *
 * @param {string} apiUrl - The URL of the YAML API specification.
 * @returns {Promise<object>} A promise that resolves with the parsed API specification.
 * @throws {Error} If there's an error fetching or parsing the specification.
 */
async function parseYamlApiSpec(apiUrl) {
  return await fetchYamlApiSpec(apiUrl);
}