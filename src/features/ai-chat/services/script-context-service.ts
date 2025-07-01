import { SQLScript, SQLScriptId } from '@models/sql-script';

/**
 * Service for building script context from @query mentions
 */
export class ScriptContextService {
  /**
   * Build script context from @mentions in a message
   */
  static buildScriptContext(
    message: string,
    sqlScripts: Map<SQLScriptId, SQLScript>,
  ): string | undefined {
    // Find all @mentions
    const mentions = message.match(/@(\w+)/g);
    if (!mentions) return undefined;

    const scriptContents: string[] = [];

    // Check each mention against scripts
    for (const mention of mentions) {
      const mentionName = mention.substring(1); // Remove @

      // Find script by name in the Map
      for (const [_scriptId, script] of sqlScripts.entries()) {
        if (script.name.toLowerCase() === mentionName.toLowerCase()) {
          scriptContents.push(`-- Script: ${script.name}\n${script.content}`);
          break;
        }
      }
    }

    if (scriptContents.length > 0) {
      return `Referenced SQL Scripts:\n\n${scriptContents.join('\n\n')}`;
    }

    return undefined;
  }
}
