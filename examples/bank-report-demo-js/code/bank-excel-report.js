
/**
* LIBRARY FUNCTIONS
* Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
 */

function privateFunctionExample() {
  console.log("This function will be included in the task's code but code generation won't be aware of it.");
}
/**
* PUBLIC FUNCTIONS
* Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
 */

function addTableHeader(workSheet, row, col, columnNames) {
  const headerRow = workSheet.getRow(row);
  columnNames.forEach((columnName, index) => {
      // Get the cell at the specified column and row offset by the index
      const cell = headerRow.getCell(col + index);
      cell.value = columnName;
      // Apply styles if needed
      cell.font = {
          bold: true
      };
      cell.alignment = {
          vertical: 'middle',
          horizontal: 'center'
      };
      cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
      };
  });
  // Commit the row to the worksheet
  headerRow.commit();
}

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

function addWorksheet(workbook, sheetName) {
  return workbook.addWorksheet(sheetName)
}

function autoSizeColumnWidth(worksheet) {
  worksheet.columns.forEach(column => {
      const lengths = column.values.map(v => v.toString().length);
      const maxLength = Math.max(...lengths.filter(v => typeof v === 'number'));
      column.width = maxLength;
  });
}

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  return workbook;
}

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

async function getBankIdByName(name) {
  const url = `https://banks.data.fdic.gov/api/institutions?filters=ACTIVE%3A1&search=NAME:${encodeURIComponent(name)}&fields=NAME`;
  const response = await axios.get(url);
//    console.log(JSON.stringify(response.data, null, ' '))
  return response.data.data[0].data.ID;
}
/**
* GENERATED CODE
* This function is the generated code: it's safe to edit.
 */

async function doTask(bankName) {
    // Get the bank ID by name
    const bankId = await getBankIdByName(bankName);
    
    // Fetch financial data for the bank
    const financialData = await getBankFinancials(bankId);
    
    // Create a new workbook and worksheet
    const workbook = createWorkbook();
    const worksheet = addWorksheet(workbook, `${bankName} Financial Report`);
    
    // Define the header for the financial data
    const financialHeader = Object.keys(financialData[0]);
    
    // Add the header row
    addTableHeader(worksheet, 1, 1, financialHeader);
    
    // Add the financial data rows
    const formats = new Array(financialHeader.length).fill('');
    addTableRows(worksheet, 2, 1, financialData, formats);
    
    // Auto-size the column widths based on content
    autoSizeColumnWidth(worksheet);
    
    // Write the workbook to a file
    const fileName = `${bankName}_Financial_Report.xlsx`;
    await workbook.xlsx.writeFile(fileName);
    
    // Output the result to stdout
    console.log(JSON.stringify({
        result: { message: "Financial report generated successfully" },
        files: [fileName]
    }));
}