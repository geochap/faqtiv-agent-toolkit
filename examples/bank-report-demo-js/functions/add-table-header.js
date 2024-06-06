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