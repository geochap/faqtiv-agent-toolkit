const axios = require('axios');

/**
 * Fetches and logs branch data for a given bank ID from the FDIC API.
 *
 * @param {string} bankId - The ID of the bank for which branch information is required.
 */
async function getBankBranches(bankId) {
  const url = `https://banks.data.fdic.gov/api/locations?filters=CERT%3A${bankId}&fields=NAME%2CUNINUM%2CSERVTYPE%2CRUNDATE%2CCITY%2CSTNAME%2CZIP%2CCOUNTY%2CADDRESS%2CMAINOFF&sort_by=NAME&sort_order=DESC&limit=10000&offset=0&format=json&download=false`;
  const response = await axios.get(url);
  return response.data.data.map(branch => {
      return {
          id: branch.data.ID,
          address: branch.data.ADDRESS,
          city: branch.data.CITY,
          county: branch.data.COUNTY,
          state: branch.data.STNAME,
          zip: branch.data.ZIP,
      };
  });
}