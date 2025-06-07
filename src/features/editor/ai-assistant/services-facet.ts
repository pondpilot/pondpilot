/**
 * CodeMirror Facet-based service injection for AI Assistant
 * This approach allows each editor instance to have its own services
 */

import { Facet, EditorState } from '@codemirror/state';

import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { getAIConfig } from '@utils/ai-config';
import { AIService, getAIService, AIServiceConfig } from '@utils/ai-service';
import { SchemaContextService, getSchemaContextService } from '@utils/schema-context-service';

export interface AIAssistantServices {
  aiService: AIService;
  schemaContextService: SchemaContextService;
  connectionPool: AsyncDuckDBConnectionPool | null;
}

/**
 * Facet for injecting AI Assistant services into editor state
 * Each editor instance can have its own service configuration
 */
export const aiAssistantServicesFacet = Facet.define<AIAssistantServices, AIAssistantServices>({
  combine: (services) => services[0], // Take the first (and should be only) service provider
  static: true,
});

/**
 * Creates AI Assistant services based on current configuration
 */
export function createAIAssistantServices(
  connectionPool?: AsyncDuckDBConnectionPool | null,
  customConfig?: AIServiceConfig,
): AIAssistantServices {
  const config = customConfig || getAIConfig();
  const aiService = getAIService(config);
  const schemaContextService = getSchemaContextService();

  return {
    aiService,
    schemaContextService,
    connectionPool: connectionPool || null,
  };
}

/**
 * Creates a facet extension with services for an editor
 */
export function aiAssistantServicesExtension(
  connectionPool?: AsyncDuckDBConnectionPool | null,
  services?: AIAssistantServices,
) {
  return aiAssistantServicesFacet.of(services || createAIAssistantServices(connectionPool));
}

/**
 * Gets services from editor state (to be used in widgets/plugins)
 */
export function getServicesFromState(state: EditorState): AIAssistantServices {
  return state.facet(aiAssistantServicesFacet);
}
