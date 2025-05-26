const fs = require('fs/promises');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const prettier = require('prettier');

const inputPath = '..\\audiodg.js';
// Extract base name (without extension) and add ".cleaned.js"
const outputPath = (() => {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, parsed.name + '.cleaned.js');
})();

async function cleanAndBeautify() {
  const code = await fs.readFile(inputPath, 'utf8');

  const ast = parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript'],
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
  });

  const undeclaredNumericAssignments = new Map();

  // Remove unused declared variables
  function removeUnusedBindings(scope) {
    Object.entries(scope.bindings).forEach(([name, binding]) => {
      if (!binding.referenced) {
        const path = binding.path;

        if (path.isVariableDeclarator()) {
          const decl = path.parentPath;
          if (decl.node.declarations.length === 1) {
            decl.remove();
          } else {
            path.remove();
          }
        }

        if (path.isFunctionDeclaration()) {
          path.remove();
        }

        if (path.isImportSpecifier() || path.isImportDefaultSpecifier()) {
          path.remove();
        }
      }
    });
  }

  // 1. Traverse AST to identify undeclared numeric assignments
  traverse(ast, {
    enter(path) {
      if (path.scope && path.scope.bindings) {
        path.scope.crawl();
        removeUnusedBindings(path.scope);
      }
    },

    AssignmentExpression(path) {
      const { left, right } = path.node;

      if (
        path.parentPath.isExpressionStatement() &&
        path.node.operator === '=' &&
        left.type === 'Identifier' &&
        !path.scope.hasBinding(left.name) &&
        right.type === 'NumericLiteral'
      ) {
        const name = left.name;

        // Save for removal if not used later
        undeclaredNumericAssignments.set(name, path);
      }
    },

    Identifier(path) {
      const name = path.node.name;

      // If this identifier is used elsewhere, do not remove
      if (
        undeclaredNumericAssignments.has(name) &&
        !path.parentPath.isAssignmentExpression()
      ) {
        undeclaredNumericAssignments.delete(name);
      }
    }
  });

  // 2. Remove truly unused assignments
  for (const path of undeclaredNumericAssignments.values()) {
    path.remove();
  }

  // 3. Generate code and remove empty lines
  let output = generate(ast, { comments: false }).code;
  output = output
    .split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');

  // 4. Beautify
  output = await prettier.format(output, {
    parser: 'babel',
    semi: true,
    singleQuote: true,
    trailingComma: 'none'
  });

  await fs.writeFile(outputPath, output, 'utf8');
  console.log(`Cleaning and formatting complete → ${outputPath}`);
}

cleanAndBeautify().catch(err => console.error('Error:', err));
