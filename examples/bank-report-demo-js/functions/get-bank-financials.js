/**
 * Retrieves financial data for a specific bank ID from the FDIC API.
 *
 * @param {string} bankId - The ID of the bank for which financial data is required.
 * @returns {Promise<Array>} - A promise that resolves with an array of financial records.
 */
async function getBankFinancials(bankId) {
  const url = `https://banks.data.fdic.gov/api/financials?filters=CERT%3A${bankId}&fields=CERT%2CREPDTE%2CASSET%2CDEP&sort_by=REPDTE&sort_order=DESC&limit=10&offset=0&agg_by=REPDTE&agg_sum_fields=DEP&agg_limit=1000&format=json&download=false&filename=data_file`;
  const response = await axios.get(url);
  return response.data.data.map(r => {
      return {
          report_date: `${r.data.REPDTE.slice(0, 4)}-${r.data.REPDTE.slice(4, 6)}-${r.data.REPDTE.slice(6)}`,
          total_deposits: r.data.sum_DEP * 1000
      }
  });
}