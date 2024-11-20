# Financial Report Generation Task Manual

## Overview

The task generates a financial report for a specified bank and writes it to an `.xlsx` workbook file. The report includes financial data retrieved from the FDIC API.

## Inputs

- **Bank Name (string):** The name of the bank for which the financial report is to be generated. This input is crucial as it determines the bank whose data will be fetched.

## Outputs

- The task produces a financial report as an `.xlsx` file located in the current working directory. The file's name is based on the bank name provided, with spaces replaced by underscores, followed by `_Financial_Report.xlsx`.

- **JSON Output:** 
  - `result:object` - A message indicating the successful generation of the financial report.
  - `files:<path:string; mimeType:string>[]` - An array containing details of the generated file with properties:
    - `path`: The path to the generated file.
    - `mimeType`: The MIME type of the file, which is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

## Sequence of Operations

1. **Bank ID Retrieval:** The task starts by querying the FDIC API to retrieve the Bank ID using the specified bank name. This ID is essential for accessing the bank's financial data.

2. **Financial Data Retrieval:** Using the retrieved Bank ID, the task fetches the bank's financial data from the FDIC API. This includes records for the bank's total deposits and report dates.

3. **Data Structuring:** The financial data is structured to create a clear and concise record of each report date and its corresponding total deposits.

4. **Excel File Creation:** The task processes the structured data and writes it to an `.xlsx` workbook. The workbook consists of a single worksheet labeled "Financial Report," which includes:
   - A header row with columns "Report Date" and "Total Deposits."
   - Subsequent rows containing data for each financial record.

5. **File Output:** The generated `.xlsx` file is saved to the current working directory, and its details are output as a JSON object with the result message and file path information.

## Usage Notes

- Ensure that the bank name provided is correctly spelled and matches existing records in the FDIC database to avoid errors in fetching data.
- The task outputs the report in the Excel format, suitable for use in spreadsheet applications such as Microsoft Excel or Google Sheets.
- The JSON output will contain the necessary information to locate and access the generated file for further use.