import re
import ast

def clean_code_block(block):
    # Remove the opening code block tag and optional language identifier
    block = re.sub(r'```[\w]*\n?', '', block)
    # Remove the closing code block tag
    block = re.sub(r'```\s*$', '', block)
    return block.strip()

def extract_function_code(input_text, target_function_name='doTask'):
    cleaned_text = clean_code_block(input_text)
    tree = ast.parse(cleaned_text)
    
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == target_function_name:
            return ast.get_source_segment(cleaned_text, node)
    
    return ''