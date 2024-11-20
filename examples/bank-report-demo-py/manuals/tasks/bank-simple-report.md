# Financial Report Generation Manual

## Purpose

The task is designed to generate a financial report for a specific bank and output the data to the console. The report includes detailed financial information for the bank, focusing particularly on the total deposits recorded over various reporting dates.

## Inputs

- **Bank Name (bank_name: str):** 
  - This is the name of the bank for which the financial report will be generated. The bank name must be provided as a string to successfully execute the task.

## Outputs

- **Financial Report:**
  - The task outputs the financial report data as JSON to the console. Each entry in the report contains:
    - **Report Date:** The date on which the financial reporting was recorded, formatted as YYYY-MM-DD.
    - **Total Deposits:** The total deposits figure, represented in thousands.

## Usage

To use the task, provide the exact name of the bank as input. The task will retrieve the bank's financial identification, gather the relevant financial data, and output a structured JSON report to the console containing the total deposits for each reporting date available.

This task is useful for quickly accessing and reviewing a bank's historical financial data pertaining to its deposits.