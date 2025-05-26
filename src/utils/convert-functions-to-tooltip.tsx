import { DBFunctionsMetadata } from '@models/db';

/**
 * Converts DuckDB functions to a format compatible with function tooltips.
 *
 * @param functions - The DuckDB function metadata
 * @returns An object mapping function names to their descriptions and syntax
 *
 */
export function convertFunctionsToTooltips(
  functions: DBFunctionsMetadata[],
): Record<string, { syntax: string; description: string; example?: string }> {
  const cNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  return functions
    .filter((func) => {
      if (func.internal) {
        return cNameRegex.test(func.function_name);
      }
      return true;
    })
    .reduce<Record<string, { syntax: string; description: string; example?: string }>>(
      (acc, func) => {
        const syntax = `${func.function_name}(${func.parameters.join(', ')})`;
        const description = func.description || '';
        const example = func.examples && func.examples.length > 0 ? func.examples[0] : undefined;

        acc[func.function_name] = {
          syntax,
          description,
          ...(example && { example }),
        };
        return acc;
      },
      {},
    );
}
