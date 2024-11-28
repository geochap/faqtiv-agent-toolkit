## `addTableHeader` Function Manual

### Overview
The `addTableHeader` function is designed to add a header to a table in a worksheet. This function is particularly useful when working with spreadsheet manipulation libraries in JavaScript, such as ExcelJS, to generate professional-looking tables with styled headers.

### Purpose
The primary purpose of this function is to automate the process of adding and styling header rows in spreadsheet tables. By specifying a row and column as starting points, the function applies specified column names to cells, formats the headers to be bold and centered, and applies a border around each header cell.

### Inputs

1. **workSheet**: This parameter represents the worksheet object where the table header will be added. It is assumed to be an instance of a worksheet from a library that supports row and cell manipulation.

2. **row**: A number specifying the row index where the header will be added. Indexing usually starts at 1, depending on the library being used.

3. **col**: A number indicating the starting column index for the header row. As with the row index, this typically starts at 1.

4. **columnNames**: An array of strings, where each string represents a column name to be added to the header row. These names are displayed in the spreadsheet's header columns.

### Outputs

The function does not return a value. Instead, it performs operations directly on the provided worksheet object by adding a styled header row. This includes setting cell values to the specified column names, applying bold font styles, centering cell text, and drawing borders around each cell in the header.

### Usage
To use the `addTableHeader` function effectively, ensure that the worksheet provided already exists and is properly initialized. This function should be called after creating a worksheet and before inserting any data rows that follow the header. Adjust the `row` and `col` parameters to match your desired starting position for the header. Supply a list of `columnNames` to define the headers you want displayed in the table.

This function simplifies the task of preparing spreadsheet templates with headers, saving time and ensuring consistency across documents.