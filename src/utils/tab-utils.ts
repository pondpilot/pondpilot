import { Comparison, ComparisonId } from '@models/comparison';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { Notebook, NotebookId } from '@models/notebook';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab } from '@models/tab';
import { getTabName } from '@utils/navigation';

/**
 * Gets a readable tab name from the app store
 * Extracted as a utility function to avoid code duplication
 *
 * @param tabId The ID of the tab
 * @param tabs Map of all tabs in the store
 * @param sqlScripts SQL script store
 * @param dataSources Data source store
 * @param localEntries Local file entries
 * @returns The formatted tab name or a fallback value
 */
export function getTabNameFromStore(
  tabId: string,
  tabs: Map<string, AnyTab>,
  sqlScripts: Map<SQLScriptId, SQLScript>,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
  localEntries: Map<LocalEntryId, LocalEntry>,
  comparisons: Map<ComparisonId, Comparison>,
  notebooks: Map<NotebookId, Notebook>,
): string {
  const tab = tabs.get(tabId);

  return tab
    ? getTabName(tab, sqlScripts, dataSources, localEntries, comparisons, notebooks)
    : 'unknown-tab-export';
}
