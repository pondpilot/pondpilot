import { NewId } from './new-id';
import { SQLScriptId } from './sql-script';

export type ScriptVersionId = NewId<'ScriptVersionId'>;
export type VersionType = 'auto' | 'named' | 'run' | 'manual';

export interface ScriptVersion {
  id: ScriptVersionId;
  scriptId: SQLScriptId;
  content: string;
  timestamp: number;
  type: VersionType;
  name?: string;
  description?: string;
  metadata?: {
    linesCount?: number;
    charactersCount?: number;
    executedSuccessfully?: boolean;
  };
}

export interface ScriptVersionGroup {
  date: Date;
  versions: ScriptVersion[];
}

export const SCRIPT_VERSION_TABLE_NAME = 'script_versions';
