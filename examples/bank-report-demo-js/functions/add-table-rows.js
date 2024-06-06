/**
 * Adds rows of data to a specified worksheet starting from a given row and column index.
 *
 * @param {ExcelJS.Worksheet} workSheet - The worksheet to which the data will be added.
 * @param {number} startRow - The starting row index for adding data.
 * @param {number} startCol - The starting column index for adding data.
 * @param {Array<Array>} rows - An array of arrays, each representing a row of data.
 */
function addTableRows(workSheet, startRow, startCol, rows, formats) {
  rows.forEach((rowData, rowIndex) => {
      const currentRow = workSheet.getRow(startRow + rowIndex);
      rowData.forEach((cellData, cellIndex) => {
          const cell = currentRow.getCell(startCol + cellIndex);
          cell.value = cellData;
          if (formats && formats[cellIndex])
              cell.numFmt = formats[cellIndex];
      });
      // Commit the row to ensure it's added to the worksheet
      currentRow.commit();
  });
}