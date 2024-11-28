# Function Manual: `add_table_rows`

## Overview

The `add_table_rows` function is used to insert data into a specified range of rows in an Excel worksheet. It also supports applying specific formatting to the cells within these rows, enhancing data presentation.

## Function Purpose

The function batches data entry operations by allowing multiple rows and columns of data to be added to a worksheet simultaneously. This feature is highly useful for populating tables or lists quickly within Excel without manually adding data one cell at a time.

## Inputs

- **worksheet**: An instance of the worksheet object from the `openpyxl` library. This worksheet is the target where the data will be inserted.

- **start_row**: An integer representing the row number in the worksheet where data entry should commence. For example, `1` would be the first row.

- **start_col**: An integer representing the column number where data entry should start. This number is 1-based, meaning `1` corresponds to the first column (typically "A" in Excel).

- **rows**: A list of lists, where each sublist represents a row of data to be added to the worksheet. The function iterates over each row and populates them in the worksheet starting from the specified position.

- **formats** (optional): A list of string formats applied to the cells in each row. Each format corresponds to the index position of the cell in the sublists provided in `rows`. Formats are applied using Excel's number formatting options, such as currency, date, or percentage. If no formatting is desired, this parameter can be omitted or set as `None`.

## Outputs

The function does not return any value. It modifies the worksheet object directly by inserting data into the specified cells and applying the given formats.

## Usage

To use `add_table_rows`, provide the function with a worksheet object, the starting coordinates (row and column), the data to be input as a list of lists, and optionally, formats to apply to each column. The function efficiently processes the data rows and makes the worksheet ready for additional modifications or saving.

This function is particularly useful for automated data entry processes in Excel applications, providing a streamlined method to populate large datasets efficiently and apply necessary cell formatting consistently.