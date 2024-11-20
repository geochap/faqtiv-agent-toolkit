## Financial Report Generation Task

### Overview

The task is designed to generate a financial report for a specified bank, focusing on specific years as provided by the user. This task collates and filters financial data, specifically reporting dates and total deposits, and outputs the data to the console in JSON format.

### Purpose

The primary purpose of the task is to allow users to retrieve and view financial data for a bank for a list of specified years. This is beneficial for financial analysis, historical data comparison, or monitoring trends over selected periods.

### Inputs

The task requires the following inputs:

- **bank_name**: A string representing the name of the bank for which the financial data is to be obtained. This name must match or partially match the official name of the bank as recognized in the banking database.

- **years**: A string containing a list of years, separated by the `|` character. These years determine which financial report dates to include in the output. Only data with report dates matching these years will be considered.

### Outputs

The output of the task is a JSON-formatted string, displayed on the console. The JSON contains a list of objects, each representing a financial record for the specified bank and filtered by the provided years. Each object in the JSON has the following structure:

- **Report Date**: A string representing the date of the financial report in the format YYYY-MM-DD.
  
- **Total Deposits**: An integer representing the total deposits recorded in that financial report, in thousands (i.e., the actual amount is the value multiplied by 1,000).

### Usage

To execute the task, provide the name of the bank and a list of years for which you want the financial data. The task will retrieve financial data for the bank, filter the records to the specified years, and print the relevant data in a JSON format to the console. This output can then be used for further analysis or reporting as needed.