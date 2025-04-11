import { AnyTab } from '@models/tab';
import { ScriptTabView } from './script-tab-view';
import { FileDataSourceTabView } from './file-data-source-tab-view';

interface TabFactoryProps {
  tab: AnyTab;
  active: boolean;
}

export const TabFactory = ({ tab, active }: TabFactoryProps) => {
  // Render the appropriate tab component based on type
  if (tab.type === 'script') {
    return <ScriptTabView tab={tab} active={active} />;
  }

  if (tab.type === 'data-source' && tab.dataSourceType === 'file') {
    return <FileDataSourceTabView tab={tab} active={active} />;
  }

  // TODO:
  //   if (tab.type === 'data-source' && tab.dataSourceType === 'db') {
  //     return <AttachedDBDataTabView tab={tab} active={active} />;
  //   }

  return null;
};
