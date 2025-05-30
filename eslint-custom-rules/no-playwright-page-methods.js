module.exports = {
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
      noPageGoto: 'Direct usage of page.goto() is forbidden. The app is automatically opened in our custom page fixture. Use page.goto() only if you need to navigate to a different URL, otherwise remove this call.',
      noPageReload: 'Direct usage of page.reload() is forbidden. Use reloadPage() from the page fixture instead.',
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
};