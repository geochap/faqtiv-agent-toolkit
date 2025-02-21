const axios = require('axios');

/**
 * Retrieves the bank ID for a given bank name by querying the FDIC API.
 * This function logs and returns the ID of the first bank found with a matching name.
 *
 * @param {string} name - The name of the bank to query.
 * @returns {Promise<string>} - A promise that resolves with the bank ID.
 */
async function getBankIdByName(name) {
  const url = `https://banks.data.fdic.gov/api/institutions?filters=ACTIVE%3A1&search=NAME:${encodeURIComponent(name)}&fields=NAME`;
  const response = await axios.get(url);
  // this will be handled as an agent event
  streamWriter.writeEvent(`Found ${response.data.data.length} banks with name ${name}`);
  // this will be inserted into the stream as a raw chunk
  streamWriter.writeRaw(`RAW: Found ${response.data.data.length} banks with name ${name}`);
  return response.data.data[0].data.ID;
}