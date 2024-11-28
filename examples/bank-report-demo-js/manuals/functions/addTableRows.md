## `addTableRows` Function Manual

### Overview
The `addTableRows` function is designed to add multiple rows of data to a worksheet table. This function supports the addition of formatted data, enabling users to populate tables with varying data styles easily.

### Purpose
The primary purpose of this function is to streamline the process of inserting rows into spreadsheet tables, with the option to format individual cells according to specified styles. This is especially useful in spreadsheet applications where data presentation is as important as the data itself.

### Inputs

1. **workSheet**: This parameter represents the worksheet object where the data rows will be added. It is typically an instance of a worksheet from a JavaScript library such as ExcelJS or similar, which supports row and cell manipulation.

2. **startRow**: A number indicating the starting row index for adding data. Typically, indexing starts at 1, but it may vary based on the library used.

3. **startCol**: A number indicating the starting column index for adding data. As with rows, column indexing usually starts at 1.

4. **rows**: An array of arrays, where each sub-array represents a row of data to insert into the worksheet. Each element in the sub-array corresponds to a cell value in that row.

5. **formats**: (Optional) An array of strings representing the number formatting to apply to each cell in a row. The format for each cell in a row is set based on its corresponding index in this array. If a format is not specified for a cell, it is left in its default format.

### Outputs

The function does not return a value. Instead, it directly modifies the provided worksheet object by populating it with the specified data, potentially with the specified formats. Each row is committed to the worksheet to finalize its addition.

### Usage
To use the `addTableRows` function effectively:
- Ensure the worksheet is initialized and ready for data entry.
- Choose a starting row and column that suit your table's layout.
- Provide a data structure in the form of an array of arrays, aligning with how you want the data to appear in the table.
- Optionally, specify a list of formats to apply custom number formatting to each column in the inserted rows.

This function facilitates the efficient and organized introduction of data into worksheets, alongside optional formatting to meet diverse presentation needs.