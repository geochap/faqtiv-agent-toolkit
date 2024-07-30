import * as babel from '@babel/core';
import _traverse from "@babel/traverse";
import { parse } from "@babel/parser";
import { parse as parsePython } from 'python-ast';
const traverse = _traverse.default;
import * as config from '../config.js';

function getRuntime() {
  return config.project.runtime.runtimeName;
}

// UTILITY FUNCTIONS TO EXTRACT FUNCTION PARAMETERS FOR A SINGLE FUNCTION

export function getPythonFunctionParameters(inputText) {
  const lines = inputText.split('\n');
  const functionDefinitionRegex = /def\s+\w+\s*\(([^)]*)\)/;
  let parameters = [];

  try {
    for (let i = 0; i < lines.length; i++) {
      const match = functionDefinitionRegex.exec(lines[i]);
      if (match) {
        const paramsString = match[1].trim();
        if (paramsString) {
          parameters = paramsString.split(',').map(param => param.split('=')[0].trim().split(':')[0].trim());
        }
        break;
      }
    }
  } catch (e) {
    console.error('Error while extracting function parameters:', e);
  }

  return parameters;
}


export function getJSFunctionParameters(functionCode) {
  const ast = parse(functionCode, {
    sourceType: "module",
    plugins: ["asyncGenerators"]
  });

  const parameters = [];

  traverse(ast, {
    enter(path) {
      if (path.isFunctionDeclaration() || path.isFunctionExpression() || path.isArrowFunctionExpression()) {
        if (path.node.id) {
          extractParametersFromSignature(path, parameters);
          path.stop(); // Stop further traversal once the correct function is found
        }
      }
    }
  });

  return parameters;
}

function extractParametersFromSignature(path, parameters) {
  path.node.params.forEach(param => {
    switch (param.type) {
      case 'Identifier':
        parameters.push(param.name);
        break;
      case 'AssignmentPattern':
        if (param.left.type === 'Identifier') {
          parameters.push(param.left.name); // Handles default parameters
        }
        break;
      case 'ObjectPattern':
        param.properties.forEach(prop => {
          if (prop.key.type === 'Identifier') {
            parameters.push(prop.key.name); // Handles destructured object parameters
          }
        });
        break;
      case 'ArrayPattern':
        param.elements.forEach(element => {
          if (element && element.type === 'Identifier') {
            parameters.push(element.name); // Handles destructured array parameters
          }
        });
        break;
      case 'RestElement':
        parameters.push('...' + param.argument.name); // Handles rest parameters
        break;
    }
  });
}

export function getFunctionParameters(functionCode, runtime) {
  const parsers = {
    javascript: getJSFunctionParameters,
    python: getPythonFunctionParameters
  };
  const code = cleanCodeBlock(functionCode);

  return parsers[runtime || getRuntime()](code);
}


// UTILITY FUNCTIONS TO GET A SINGLE FUNCTION'S CODE FROM A TEXT

export function cleanCodeBlock(block) {
  return block
    .replace(/```[\w]*\n?/, '') // Remove the opening code block tag and optional language identifier
    .replace(/```\s*$/, '')// Remove the closing code block tag
    .trim();
}

export function extractJSFunctionCode(inputText, targetFunctionName) {
  const ast = parse(inputText, {
    sourceType: "module",
    plugins: ["asyncGenerators"]
  });
  let functionCode = '';

  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id.name === targetFunctionName) {
        functionCode = inputText.substring(path.node.start, path.node.end);
      }
    },
    ArrowFunctionExpression(path) {
      if (path.node.id && path.node.id.name === targetFunctionName) {
        functionCode = inputText.substring(path.node.start, path.node.end);
      }
    },
    FunctionExpression(path) {
      if (path.node.id && path.node.id.name === targetFunctionName) {
        functionCode = inputText.substring(path.node.start, path.node.end);
      }
    },
  });
  return functionCode;
}

export function extractPythonFunctionCode(inputText, targetFunctionName) {
  const lines = inputText.split('\n');
  let isCapturingFunction = false;
  let tempCode = '';
  let functionName = null;
  let indentLevel = null;

  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!isCapturingFunction) {
        if ((line.trim().startsWith('def ') || line.trim().startsWith('async def ')) &&
            line.includes(targetFunctionName)) {
          const name = line.split(' ')[1].split('(')[0];
          if (name === targetFunctionName) {
            functionName = name;
            tempCode = line + '\n';
            isCapturingFunction = true;
            indentLevel = line.search(/\S|$/);
          }
        }
      } else {
        const currentIndent = line.search(/\S|$/);
        if (currentIndent <= indentLevel && line.trim() !== '') {
          // Function ended
          try {
            parsePython(tempCode);  // Verify if the function is complete
            return tempCode;
          } catch (e) {
            tempCode += line + '\n';  // Still part of the current function
          }
        } else {
          tempCode += line + '\n';  // Still part of the current function
        }
      }
    }

    // Handle the last function in the text
    if (isCapturingFunction && tempCode) {
      try {
        parsePython(tempCode);  // Verify if the function is complete
        return tempCode;
      } catch (e) {
        // Incomplete function at the end
      }
    }
  } catch (e) {}

  return null;
}

export function extractFunctionCode(inputText, functionName, runtime) {
  const parsers = {
    javascript: extractJSFunctionCode,
    python: extractPythonFunctionCode
  };
  const code = cleanCodeBlock(inputText);

  return parsers[runtime || getRuntime()](code, functionName);
}


// UTILITY FUNCTIONS TO GET A SINGLE FUNCTION'S CALL FROM A TEXT

export function extractJSFunctionCall(inputText, targetFunctionName) {
  const ast = parse(inputText, {
    sourceType: "module",
    plugins: ["asyncGenerators"]
  });
  let functionCall = '';

  traverse(ast, {
    CallExpression(path) {
      if (!functionCall && path.node.callee.name === targetFunctionName) {
        functionCall = inputText.substring(path.node.start, path.node.end);
        path.stop(); // Stop traversal once the first function call is found
      }
    },
    AwaitExpression(path) {
      if (
        !functionCall &&
        path.node.argument.type === "CallExpression" &&
        path.node.argument.callee.name === targetFunctionName
      ) {
        functionCall = inputText.substring(path.node.start, path.node.end);
        path.stop(); // Stop traversal once the first function call is found
      }
    }
  });

  return functionCall;
}

export function extractPythonFunctionCall(inputText, targetFunctionName) {
  const lines = inputText.split('\n');
  const functionCallPattern = new RegExp(`\\b(?:await\\s+)?${targetFunctionName}\\b\\s*\\(`);
  let insideFunctionDefinition = false;
  let functionCall = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('def ') && line.includes(targetFunctionName + '(')) {
      insideFunctionDefinition = true;
    } else if (insideFunctionDefinition && line === '') {
      insideFunctionDefinition = false;
    }

    if (!insideFunctionDefinition && functionCallPattern.test(line)) {
      functionCall = line;
      break;
    }
  }

  return functionCall;
}

export function extractFunctionCall(inputText, functionName, runtime) {
  const parsers = {
    javascript: extractJSFunctionCall,
    python: extractPythonFunctionCall
  };
  const code = cleanCodeBlock(inputText);

  return parsers[runtime || getRuntime()](code, functionName);
}


// UTILITY FUNCTIONS TO READ ALL FUNCTIONS FROM A FILE

export function readPythonFunctionFile(inputText) {
  const lines = inputText.split('\n');
  const functions = [];
  const imports = [];
  let isCapturingFunction = false;
  let tempCode = '';
  let functionName = null;
  let indentLevel = null;

  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for import statements
      if (line.trim().startsWith('import ') || line.trim().startsWith('from ')) {
        imports.push(line);
        continue;
      }

      if (!isCapturingFunction) {
        if (line.trim().startsWith('def ') || line.trim().startsWith('async def ')) {
          functionName = line.split(' ')[1].split('(')[0];  // Extract the function name
          tempCode = line + '\n';
          isCapturingFunction = true;
          indentLevel = line.search(/\S|$/);
        }
      } else {
        const currentIndent = line.search(/\S|$/);
        if (currentIndent <= indentLevel && line.trim() !== '') {
          // Function ended
          try {
            parsePython(tempCode);  // Verify if the function is complete
            functions.push({ name: functionName, code: tempCode });
            isCapturingFunction = false;
            indentLevel = null;
            tempCode = '';
            functionName = null;

            // Check if new function starts here
            if (line.trim().startsWith('def ') || line.trim().startsWith('async def ')) {
              functionName = line.split(' ')[1].split('(')[0];  // Extract the function name
              tempCode = line + '\n';
              isCapturingFunction = true;
              indentLevel = line.search(/\S|$/);
            }
          } catch (e) {
            tempCode += line + '\n';  // Still part of the current function
          }
        } else {
          tempCode += line + '\n';  // Still part of the current function
        }
      }
    }

    // Handle the last function in the text
    if (isCapturingFunction && tempCode) {
      try {
        parsePython(tempCode);  // Verify if the function is complete
        functions.push({ name: functionName, code: tempCode });
      } catch (e) {
        // Incomplete function at the end
      }
    }
  } catch (e) {}

  return { functions, imports };
}

export function readJSFunctionFile(code) {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['asyncGenerators', 'classProperties', 'decorators-legacy', 'typescript']
  });

  const functions = [];
  const imports = [];

  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id) {
        const functionName = path.node.id.name;
        const start = path.node.start;
        const end = path.node.end;
        const functionCode = code.substring(start, end);
        functions.push({ name: functionName, code: functionCode });
      }
    },
    VariableDeclaration(path) {
      path.traverse({
        FunctionExpression(childPath) {
          if (childPath.node.id) {
            const functionName = childPath.node.id.name;
            const start = childPath.node.start;
            const end = childPath.node.end;
            const functionCode = code.substring(start, end);
            functions.push({ name: functionName, code: functionCode });
          }
        },
        ArrowFunctionExpression(childPath) {
          if (childPath.parent.id) {
            const functionName = childPath.parent.id.name;
            const start = childPath.node.start;
            const end = childPath.node.end;
            const functionCode = code.substring(start, end);
            functions.push({ name: functionName, code: functionCode });
          }
        }
      });
    },
    CallExpression(path) {
      if (path.node.callee.name === 'require' && path.node.arguments.length === 1) {
        const parent = path.findParent(p => p.isVariableDeclaration() || p.isExpressionStatement());
        if (parent) {
          const start = parent.node.start;
          const end = parent.node.end;
          const importCode = code.substring(start, end);
          imports.push(importCode);
        }
      }
    }
  });

  return { functions, imports };
}

export function readFunctionFile(code, runtime) {
  const parsers = {
    javascript: readJSFunctionFile,
    python: readPythonFunctionFile
  };
  
  return parsers[runtime || getRuntime()](code);
}

// UTILITY FUNCTIONS TO GET FUNCTION NAME CALLS INSIDE A FUNCTION TEXT


function extractJSFunctionNames(code) {
  const functionNames = new Set();
  
  const ast = babel.parse(code);

  traverse(ast, {
    CallExpression(path) {
      if (path.node.callee.type === 'Identifier') {
        functionNames.add(path.node.callee.name);
      }
    }
  });

  return [...functionNames];
}

function extractPythonFunctionNames(code) {
  const lines = code.split('\n');
  const functionCalls = [];
  const functionCallRegex = /(\w+)\s*\(/g;

  try {
    for (let i = 0; i < lines.length; i++) {
      let match;
      while ((match = functionCallRegex.exec(lines[i])) !== null) {
        functionCalls.push(match[1]);
      }
    }
  } catch (e) {
    console.error('Error while extracting function calls:', e);
  }

  return functionCalls;
}

export function extractFunctionNames(functionCode, runtime) {
  const parsers = {
    javascript: extractJSFunctionNames,
    python: extractPythonFunctionNames
  };
  const code = cleanCodeBlock(functionCode);

  return parsers[runtime || getRuntime()](code);
}