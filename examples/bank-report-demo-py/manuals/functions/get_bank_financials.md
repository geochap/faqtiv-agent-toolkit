# Function Manual: `get_bank_financials`

## Overview

The `get_bank_financials` function is designed to retrieve recent financial data for a specific bank, identified by its certification ID, from a public financial database.

## Function Purpose

This function helps users obtain recent financial metrics, specifically the report date and total deposits of a bank. It is useful for financial analysis, bank evaluations, or any situation where understanding a bank's deposit trends over time is necessary.

## Inputs

- **bank_id**: This input is a string or integer representing the unique certification number of the bank (CERT). This ID is specific to each banking institution and is used to filter the financial information retrieved from the database.

## Outputs

The function returns a list of dictionaries, with each dictionary containing the following fields related to the bank's financial data:

- **report_date**: A string representing the date of the financial report. The format is 'YYYY-MM-DD', providing year, month, and day of the report.
- **total_deposits**: An integer representing the total deposits reported in thousands, multiplied by 1000 to reflect actual values in currency units.

## Usage

To use `get_bank_financials`, provide it with a valid `bank_id` which corresponds to the bank you are interested in. The function will query the relevant financial database and extract the top 10 most recent financial entries in descending order of report date. The data is cleaned to present only relevant financial information, ensuring ease of integration into financial systems, reports, or dashboards.

This function is particularly useful for financial analysts, bankers, and other stakeholders who require up-to-date financial insights into banking institutions.