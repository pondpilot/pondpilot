import { SQLScriptId } from '@models/sql-script';
import { makeIdFactory } from './new-id';

export const makeSQLScriptId = makeIdFactory<SQLScriptId>();
