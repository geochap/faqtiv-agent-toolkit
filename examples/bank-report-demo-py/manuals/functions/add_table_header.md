# Function Manual: `add_table_header`

## Overview

The `add_table_header` function is designed to insert a formatted header row into an Excel worksheet. This header row can be used to label the columns in a table, enhancing the readability and organization of the data.

## Function Purpose

The function serves to add a row at the top of a table that defines column names. It automatically applies styling to make the header distinguishable and visually appealing, ensuring that it's easily identifiable from the rest of the data.

## Inputs

- **worksheet**: An instance of the worksheet object from the `openpyxl` library where the header will be added. This worksheet must belong to an already created workbook.

- **row**: An integer representing the row number where the header will be inserted. For example, `1` would typically be used to set the first row of the sheet as the header.

- **col**: An integer representing the starting column number for the header. If set to `1`, the header will start from the first column (typically column "A" in Excel).

- **column_names**: A list of strings, each specifying a column name to be included in the header. Each item in the list corresponds to a different column in the header row.

## Outputs

The function does not produce direct output. Instead, it modifies the provided worksheet in place by setting cell values for the header row and applying cell styles such as bold font, centered alignment, and borders.

## Usage

To employ `add_table_header`, supply it with the target worksheet, the starting row and column for the header, and a list of column names. The function iterates over the column names, setting the cell value for each and formatting that cell to be bold and centered with thin borders for visual distinction.

This function is especially useful for Excel sheets that require clear demarcation of data columns, forming part of the setup phase in worksheet preparation before data entry or analysis tasks are performed. It ensures that data consumers can easily interpret what each column represents, supporting better decision-making and data management.