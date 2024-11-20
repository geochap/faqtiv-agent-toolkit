# Task Manual: Financial Report Generation

## Purpose

The task is designed to generate a financial report for a specified bank. By utilizing the bank's financial data, the task creates an Excel workbook containing the report and saves it to the current working directory. This task is useful for obtaining a detailed view of the financial holdings, specifically total deposits, of a bank over time.

## Inputs

- **bank_name**: This is a string input representing the name of the bank for which the financial report is to be generated. The task retrieves the bank's unique ID based on this name.

## Process

1. The task retrieves the unique bank ID using the provided `bank_name`.
2. Using this bank ID, it gathers the financial information of the bank, which includes reporting dates and the total deposits for each reporting period.
3. An Excel workbook is created to contain the financial report data.
4. The task then adds a worksheet to the workbook, labeling it as "Financial Report".
5. Headers and data rows are inserted into the worksheet, comprising report dates and corresponding total deposits.
6. The column widths are automatically adjusted for enhanced readability.
7. The workbook is saved as an Excel file with a descriptive name based on the bank name.

## Outputs

The task produces an Excel workbook file containing the financial report. This file is saved in the current working directory with a name formatted as `<bank_name>_Financial_Report.xlsx`, where spaces in the bank name are replaced with underscores.

The task outputs a JSON object to the console with the following structure:

- **result**: A string message indicating the successful generation of the financial report.
- **files**: An array containing a single object with:
  - **path**: The file path of the generated Excel workbook.
  - **mimeType**: The MIME type of the Excel file, specifically `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.