
##
# LIBRARY FUNCTIONS
# Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
##

async def private_fn():
  return True

##
# PUBLIC FUNCTIONS
# Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
##

def get_bank_branches(bank_id):
    url = f'https://banks.data.fdic.gov/api/locations?filters=CERT%3A{bank_id}&fields=NAME%2CUNINUM%2CSERVTYPE%2CRUNDATE%2CCITY%2CSTNAME%2CZIP%2CCOUNTY%2CADDRESS%2CMAINOFF&sort_by=NAME&sort_order=DESC&limit=10000&offset=0&format=json&download=false'
    response = requests.get(url)
    response_data = response.json()
    return [
        {
            'id': branch['data']['ID'],
            'address': branch['data']['ADDRESS'],
            'city': branch['data']['CITY'],
            'county': branch['data']['COUNTY'],
            'state': branch['data']['STNAME'],
            'zip': branch['data']['ZIP'],
        } for branch in response_data['data']
    ]



def get_bank_financials(bank_id):
    url = f'https://banks.data.fdic.gov/api/financials?filters=CERT%3A{bank_id}&fields=CERT%2CREPDTE%2CASSET%2CDEP&sort_by=REPDTE&sort_order=DESC&limit=10&offset=0&agg_by=REPDTE&agg_sum_fields=DEP&agg_limit=1000&format=json&download=false&filename=data_file'
    response = requests.get(url)
    response_data = response.json()
    return [
        {
            'report_date': f"{r['data']['REPDTE'][:4]}-{r['data']['REPDTE'][4:6]}-{r['data']['REPDTE'][6:]}",
            'total_deposits': r['data']['sum_DEP'] * 1000
        } for r in response_data['data']
    ]



def get_bank_id_by_name(name):
    url = f'https://banks.data.fdic.gov/api/institutions?filters=ACTIVE%3A1&search=NAME:{requests.utils.quote(name)}&fields=NAME'
    response = requests.get(url)
    response_data = response.json()
    return response_data['data'][0]['data']['ID']


def create_workbook():
    return openpyxl.Workbook()



def auto_size_column_width(worksheet):
    for column in worksheet.columns:
        lengths = [len(str(cell.value)) for cell in column if cell.value]
        max_length = max(lengths, default=10)
        column_letter = column[0].column_letter
        worksheet.column_dimensions[column_letter].width = max_length



def add_worksheet(workbook, sheet_name):
    return workbook.create_sheet(title=sheet_name)



def add_table_rows(worksheet, start_row, start_col, rows, formats=None):
    for row_index, row_data in enumerate(rows):
        current_row = start_row + row_index
        for cell_index, cell_data in enumerate(row_data):
            cell = worksheet.cell(row=current_row, column=start_col + cell_index)
            cell.value = cell_data
            if formats and formats[cell_index]:
                cell.number_format = formats[cell_index]



def add_table_header(worksheet, row, col, column_names):
    for index, column_name in enumerate(column_names):
        cell = worksheet.cell(row=row, column=col + index)
        cell.value = column_name
        cell.font = openpyxl.styles.Font(bold=True)
        cell.alignment = openpyxl.styles.Alignment(vertical='center', horizontal='center')
        cell.border = openpyxl.styles.Border(
            top=openpyxl.styles.Side(style='thin'), 
            left=openpyxl.styles.Side(style='thin'),
            bottom=openpyxl.styles.Side(style='thin'), 
            right=openpyxl.styles.Side(style='thin')
        )

##
# GENERATED CODE
# This function is the generated code: it's safe to edit.
##

def doTask(bank_name: str):
    bank_id = get_bank_id_by_name(bank_name)
    bank_branches = get_bank_branches(bank_id)
    bank_financials = get_bank_financials(bank_id)
    
    # Create a new workbook and worksheets
    workbook = create_workbook()
    branches_sheet = add_worksheet(workbook, "Branches")
    financials_sheet = add_worksheet(workbook, "Financials")
    
    # Add headers for bank branches
    branch_headers = ['Branch ID', 'Branch Name', 'Address', 'City', 'State', 'Zip Code']
    add_table_header(branches_sheet, 1, 1, branch_headers)
    
    # Add branch data rows
    branch_rows = [[branch['branch_id'], branch['branch_name'], branch['address'], branch['city'], branch['state'], branch['zip_code']] for branch in bank_branches]
    add_table_rows(branches_sheet, 2, 1, branch_rows)
    
    # Auto-size columns in the branches sheet
    auto_size_column_width(branches_sheet)
    
    # Add headers for bank financials
    financial_headers = ['Year', 'Total Assets', 'Total Liabilities', 'Net Income']
    add_table_header(financials_sheet, 1, 1, financial_headers)
    
    # Add financial data rows
    financial_rows = [[financial['year'], financial['total_assets'], financial['total_liabilities'], financial['net_income']] for financial in bank_financials]
    add_table_rows(financials_sheet, 2, 1, financial_rows)
    
    # Auto-size columns in the financials sheet
    auto_size_column_width(financials_sheet)
    
    # Save the workbook
    file_name = f"{bank_name.replace(' ', '_')}_Financial_Report.xlsx"
    workbook.save(file_name)
    
    # Output JSON result
    result = {
        "result": "Financial report generated successfully.",
        "files": [file_name]
    }
    
    print(json.dumps(result, indent=2))
