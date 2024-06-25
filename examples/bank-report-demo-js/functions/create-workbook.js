const ExcelJS = require('exceljs');

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  return workbook;
}