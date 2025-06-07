module.exports = {
  'prefer-absolute-imports': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Enforce absolute imports using path aliases instead of relative imports',
        category: 'Best Practices',
        recommended: true,
      },
      fixable: 'code',
      schema: [],
      messages: {
        preferAbsolute:
          'Use absolute imports with path aliases (e.g., @models/, @utils/) instead of relative imports that traverse parent directories',
      },
    },

    create(context) {
      const path = require('path');
      const fs = require('fs');
      
      // Read tsconfig.json to get path mappings
      const tsconfigPath = path.join(context.getCwd(), 'tsconfig.json');
      let pathMappings = {};
      
      try {
        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
        if (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) {
          // Convert tsconfig paths to a simpler mapping
          Object.entries(tsconfig.compilerOptions.paths).forEach(([alias, [mapping]]) => {
            // Remove the /* from both alias and mapping
            const cleanAlias = alias.replace('/*', '');
            const cleanMapping = mapping.replace('/*', '');
            pathMappings[cleanMapping] = cleanAlias;
          });
        }
      } catch (e) {
        // Fallback to hardcoded mappings if tsconfig.json can't be read
        pathMappings = {
          'pages': '@pages',
          'components': '@components',
          'utils': '@utils',
          'features': '@features',
          'store': '@store',
          'hooks': '@hooks',
          'theme': '@theme',
          'router': '@router',
          'consts': '@consts',
          'controllers': '@controllers',
          'models': '@models',
          'assets': '@assets',
        };
      }

      // Helper function to resolve the absolute path with alias
      const getAbsolutePathWithAlias = (importPath, currentFilePath) => {
        // Get the directory of the current file relative to src
        const srcIndex = currentFilePath.indexOf('/src/');
        if (srcIndex === -1) return null;
        
        const relativeToSrc = currentFilePath.substring(srcIndex + 5);
        const currentDir = path.dirname(relativeToSrc);
        
        // Resolve the import path
        const resolvedPath = path.join(currentDir, importPath);
        const normalizedPath = path.normalize(resolvedPath);
        
        // Find matching alias
        for (const [dir, alias] of Object.entries(pathMappings)) {
          if (normalizedPath.startsWith(dir + '/')) {
            return alias + '/' + normalizedPath.substring(dir.length + 1);
          } else if (normalizedPath === dir) {
            return alias;
          }
        }
        
        return null;
      };

      return {
        ImportDeclaration(node) {
          const importPath = node.source.value;
          
          // Check if the import path contains parent directory traversal
          if (importPath.includes('../')) {
            const filename = context.getFilename();
            const absolutePath = getAbsolutePathWithAlias(importPath, filename);
            
            context.report({
              node,
              messageId: 'preferAbsolute',
              fix: absolutePath ? (fixer) => {
                return fixer.replaceText(node.source, `'${absolutePath}'`);
              } : null,
            });
          }
        },
        ExportNamedDeclaration(node) {
          // Check if it has a source (export from)
          if (node.source && node.source.value.includes('../')) {
            const importPath = node.source.value;
            const filename = context.getFilename();
            const absolutePath = getAbsolutePathWithAlias(importPath, filename);
            
            context.report({
              node,
              messageId: 'preferAbsolute',
              fix: absolutePath ? (fixer) => {
                return fixer.replaceText(node.source, `'${absolutePath}'`);
              } : null,
            });
          }
        },
        ExportAllDeclaration(node) {
          // Check export * from statements
          if (node.source && node.source.value.includes('../')) {
            const importPath = node.source.value;
            const filename = context.getFilename();
            const absolutePath = getAbsolutePathWithAlias(importPath, filename);
            
            context.report({
              node,
              messageId: 'preferAbsolute',
              fix: absolutePath ? (fixer) => {
                return fixer.replaceText(node.source, `'${absolutePath}'`);
              } : null,
            });
          }
        },
      };
    },
  },
  'no-playwright-page-methods': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Forbid direct usage of page.goto() and page.reload() in Playwright tests',
        category: 'Best Practices',
        recommended: true,
      },
      fixable: null,
      schema: [],
      messages: {
        noPageGoto:
          'Direct usage of page.goto() is forbidden. The app is automatically opened in our custom page fixture. Use page.goto() only if you need to navigate to a different URL, otherwise remove this call.',
        noPageReload:
          'Direct usage of page.reload() is forbidden. Use reloadPage() from the page fixture instead.',
      },
    },

    create(context) {
      return {
        CallExpression(node) {
          // Check if it's a member expression (object.method())
          if (node.callee.type === 'MemberExpression') {
            const object = node.callee.object;
            const property = node.callee.property;

            // Check if the object is 'page' and the method is 'goto' or 'reload'
            if (
              object.type === 'Identifier' &&
              object.name === 'page' &&
              property.type === 'Identifier'
            ) {
              if (property.name === 'goto') {
                context.report({
                  node,
                  messageId: 'noPageGoto',
                });
              } else if (property.name === 'reload') {
                context.report({
                  node,
                  messageId: 'noPageReload',
                });
              }
            }
          }
        },
      };
    },
  },
};
