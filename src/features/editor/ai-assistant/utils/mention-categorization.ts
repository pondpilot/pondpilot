/**
 * Categorizes raw mention strings into scripts, databases, and tables
 */

import { SQLScript } from '../../../../models/sql-script';
import { DatabaseModel } from '../model';

export interface CategorizedMentions {
  mentionedScriptIds: Set<string>;
  mentionedDbNames: Set<string>;
  mentionedTableNames: Set<string>;
}

/**
 * Categorizes raw mention strings into scripts, databases, and tables.
 * Uses lazy lookup to avoid building full sets of all table names upfront.
 *
 * @param rawMentions - Array of raw mention strings extracted from text
 * @param databaseModel - The database model containing databases and tables
 * @param sqlScripts - Map of SQL scripts
 * @returns Categorized sets of script IDs, database names, and table names
 */
export function categorizeMentions(
  rawMentions: string[],
  databaseModel: DatabaseModel | undefined,
  sqlScripts: Map<string, SQLScript> | undefined,
): CategorizedMentions {
  const mentionedScriptIds = new Set<string>();
  const mentionedDbNames = new Set<string>();
  const mentionedTableNames = new Set<string>();

  if (!databaseModel && !sqlScripts) {
    // If we have no context, assume all mentions are table names
    rawMentions.forEach((mention) => mentionedTableNames.add(mention));
    return { mentionedScriptIds, mentionedDbNames, mentionedTableNames };
  }

  // Build set of database names only (this is O(D) where D = number of databases, usually small)
  const actualDatabases = databaseModel ? new Set(databaseModel.keys()) : new Set<string>();

  // Categorize each mention using lazy lookup
  for (const mention of rawMentions) {
    let categorized = false;

    // Check if it's a script
    if (sqlScripts) {
      for (const [scriptId, script] of sqlScripts.entries()) {
        if (script.name === mention) {
          mentionedScriptIds.add(scriptId);
          categorized = true;
          break;
        }
      }
    }

    if (!categorized) {
      // Check if it's a database
      if (actualDatabases.has(mention)) {
        mentionedDbNames.add(mention);
        categorized = true;
      }
    }

    if (!categorized) {
      // Default to table (the lookup happens only if needed, and only for this specific mention)
      // Note: We don't verify if the table exists because:
      // 1. It's expensive for large databases
      // 2. The user might be mentioning a table that will be created
      // 3. The AI will handle non-existent tables gracefully
      mentionedTableNames.add(mention);
    }
  }

  return { mentionedScriptIds, mentionedDbNames, mentionedTableNames };
}

/**
 * Expands database mentions to include all their tables
 * @param mentionedDbNames - Set of mentioned database names
 * @param databaseModel - The database model containing databases and tables
 * @returns Set of all table names from the mentioned databases
 */
export function expandDatabaseMentions(
  mentionedDbNames: Set<string>,
  databaseModel: DatabaseModel | undefined,
): Set<string> {
  const expandedTables = new Set<string>();

  if (!databaseModel || mentionedDbNames.size === 0) {
    return expandedTables;
  }

  for (const dbName of mentionedDbNames) {
    const database = databaseModel.get(dbName);
    if (database) {
      for (const schema of database.schemas) {
        for (const object of schema.objects) {
          if (object.type === 'table' || object.type === 'view') {
            expandedTables.add(object.name);
          }
        }
      }
    }
  }

  return expandedTables;
}
