import { SQLScript, SQLScriptId } from '@models/sql-script';
import { makeIdFactory } from './new-id';

export const makeSQLScriptId = makeIdFactory<SQLScriptId>();

export function ensureScript(
  sqlScriptOrId: SQLScript | SQLScriptId,
  sqlScripts: Map<SQLScriptId, SQLScript>,
): SQLScript {
  // Get the script object if not passed as an object
  if (typeof sqlScriptOrId === 'string') {
    const fromState = sqlScripts.get(sqlScriptOrId);

    if (!fromState) {
      throw new Error(`SQL script with id ${sqlScriptOrId} not found`);
    }

    return fromState;
  }

  return sqlScriptOrId;
}
