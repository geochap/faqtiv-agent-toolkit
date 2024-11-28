# Task Manual: Financial Report Generation for Specific Bank

## Overview

The task retrieves financial data for a specified bank over a set of specified years and outputs this information to the console. The user must provide the bank's name and a list of years for which data is to be retrieved. The task integrates with specific functions that interact with financial data through the FDIC API.

## Inputs

- **Bank Name (bankName):** A string representing the exact name of the bank for which the financial report is to be generated. This input is used to retrieve the unique bank ID required to query the financial data.

- **Year List (yearList):** A string where each year is separated by a pipe ('|') character (e.g., "2020|2021|2022"). This input specifies the years for which the financial report should include data. It is essential to format this input correctly, as the task parses it to filter financial data for those specific years.

## Outputs

- **Console Output:** The task outputs a JSON formatted string to the console. This string contains an array of objects, where each object represents a financial reporting period for the specified years. Each object includes:
  - `report_date`: The date of the financial report.
  - `total_deposits`: The total deposits recorded on the report date.

The output provides a clear, structured view of the financial status of the specified bank for the given years, facilitating further analysis or reporting tasks. 

## Usage

- Initiate the task by specifying the bank name and the desired years for financial reporting.
- Ensure the bank name matches the name used in the financial data service to avoid errors.
- Format the year list correctly to ensure accurate data filtering.

By adhering to these instructions, the task will yield a comprehensive financial report for the specified bank over the desired time frame, outputting the results to the console in an easy-to-read JSON format.