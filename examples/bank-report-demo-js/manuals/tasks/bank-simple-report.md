# Financial Report Generation Task

## Purpose

The task generates a financial report for a specific bank by retrieving and processing its financial data. It specifically extracts information about the report dates and total deposits, and outputs this data to the console in JSON format.

## Inputs

- **Bank Name (bankName)**: A string representing the name of the bank for which the financial report is to be generated. This input is required to identify the bank within the system and to fetch the associated financial data.

## Outputs

- The task outputs the financial report data to the console. The data is structured in a JSON format, which includes an array of records. Each record contains the following fields:
  - **report_date**: A string representing the date of the financial report.
  - **total_deposits**: A number representing the total deposits recorded in the financial report.

## Usage

To use the task, supply the bank name as an input parameter. The task will query the financial data for the given bank, process the necessary information, and then log the structured financial report data to the console in JSON format. 

The financial report provides insights into the bank's performance by presenting an array of reports with their respective dates and total deposits, allowing for analysis and decision-making based on the presented data.

This task is useful for financial analysts or stakeholders who need to access and understand the financial health and deposit trends of a particular bank.