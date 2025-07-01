import { VegaLiteSpec, isValidVegaLiteSpec } from '@models/vega-lite';
import { getAIConfig } from '@utils/ai-config';
import { getAIService } from '@utils/ai-service';

import { formatResultsForContext } from '../utils';

/**
 * Service for generating Vega-Lite chart specifications from query results
 */
export class ChartGenerationService {
  /**
   * Generate a Vega-Lite chart specification from query results
   */
  static async generateChartFromResults(
    query: string,
    results: any,
    userIntent: string,
  ): Promise<VegaLiteSpec | null> {
    const config = getAIConfig();
    const aiService = getAIService(config);

    const chartPrompt = `Given this SQL query and its results, create a Vega-Lite visualization.

User's request: ${userIntent}

SQL Query:
${query}

Query Results:
${formatResultsForContext(results)}

Generate ONLY a Vega-Lite specification that best visualizes this data. Consider:
- The user's intent and what they're trying to understand
- The data types and structure
- The most appropriate chart type (bar, line, scatter, etc.)
- Clear titles and axis labels

Respond with ONLY the JSON specification, no explanation:`;

    const response = await aiService.generateSQLAssistance({
      prompt: chartPrompt,
      useStructuredResponse: false,
      schemaContext: '',
    });

    if (!response.success || !response.content) {
      return null;
    }

    try {
      // Try to parse the JSON directly
      const cleanContent = response.content.trim();
      // Remove markdown code block if present
      const jsonContent = cleanContent.replace(/```json\n?|\n?```/g, '').trim();

      let parsedSpec;
      try {
        parsedSpec = JSON.parse(jsonContent);
      } catch (parseError) {
        console.error('Failed to parse chart specification JSON:', parseError);
        console.error('Raw content:', `${jsonContent.substring(0, 200)}...`);
        return null;
      }

      // Validate the spec structure
      if (!isValidVegaLiteSpec(parsedSpec)) {
        console.error('Invalid Vega-Lite specification structure:', {
          hasSchema: !!parsedSpec.$schema,
          schemaValue: parsedSpec.$schema,
          hasMark: !!parsedSpec.mark,
          markValue: parsedSpec.mark,
        });
        return null;
      }

      return parsedSpec as VegaLiteSpec;
    } catch (e) {
      console.error('Unexpected error processing chart specification:', e);
      return null;
    }
  }
}
