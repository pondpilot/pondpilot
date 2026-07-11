/**
 * Service injection for AI Assistant
 */

import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';

import { SQLScript } from '../../../models/sql-script';
import { getAIConfig } from '../../../utils/ai-config';
import { AIService, getAIService, AIServiceConfig } from '../../../utils/ai-service';
import {
  SchemaContextService,
  getSchemaContextService,
} from '../../../utils/schema-context-service';

export interface AIAssistantServices {
  aiService: AIService;
  schemaContextService: SchemaContextService;
  connectionPool: AsyncDuckDBConnectionPool | null;
  sqlScripts?: Map<string, SQLScript>;
}

/**
 * Creates AI Assistant services based on current configuration
 */
export function createAIAssistantServices(
  connectionPool?: AsyncDuckDBConnectionPool | null,
  customConfig?: AIServiceConfig,
  sqlScripts?: Map<string, SQLScript>,
): AIAssistantServices {
  const config = customConfig || getAIConfig();
  const aiService = getAIService(config);
  const schemaContextService = getSchemaContextService();

  return {
    aiService,
    schemaContextService,
    connectionPool: connectionPool || null,
    sqlScripts,
  };
}
