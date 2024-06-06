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
//    console.log(JSON.stringify(response.data, null, ' '))
  return response.data.data[0].data.ID;
}