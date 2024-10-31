const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

function cleanCodeBlock(block) {
  return block
    .replace(/```[\w]*\n?/, '') // Remove the opening code block tag and optional language identifier
    .replace(/```\s*$/, '') // Remove the closing code block tag
    .trim();
}

function extractFunctionCode(inputText, targetFunctionName = 'doTask') {
  const cleanedText = cleanCodeBlock(inputText);
  const ast = parse(cleanedText, {
    sourceType: "module",
    plugins: ["asyncGenerators", "classProperties", "decorators-legacy", "typescript"]
  });
  let functionCode = '';

  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id && path.node.id.name === targetFunctionName) {
        functionCode = cleanedText.substring(path.node.start, path.node.end);
      }
    },
    VariableDeclaration(path) {
      path.traverse({
        VariableDeclarator(varPath) {
          if (varPath.node.id.name === targetFunctionName &&
              (varPath.node.init.type === 'ArrowFunctionExpression' || 
               varPath.node.init.type === 'FunctionExpression')) {
            functionCode = cleanedText.substring(path.node.start, path.node.end);
          }
        }
      });
    },
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        if (path.node.declaration.type === 'FunctionDeclaration' && 
            path.node.declaration.id.name === targetFunctionName) {
          functionCode = cleanedText.substring(path.node.start, path.node.end);
        } else if (path.node.declaration.type === 'VariableDeclaration') {
          path.traverse({
            VariableDeclarator(varPath) {
              if (varPath.node.id.name === targetFunctionName &&
                  (varPath.node.init.type === 'ArrowFunctionExpression' || 
                   varPath.node.init.type === 'FunctionExpression')) {
                functionCode = cleanedText.substring(path.node.start, path.node.end);
              }
            }
          });
        }
      }
    }
  });

  return functionCode;
}

module.exports = {
  extractFunctionCode
};