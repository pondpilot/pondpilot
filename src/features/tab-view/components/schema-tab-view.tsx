import { SchemaBrowser } from '@features/schema-browser';
import { SchemaBrowserTab, TabId } from '@models/tab';
import { useTabReactiveState } from '@store/app-store';
import { memo } from 'react';

interface SchemaTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const SchemaTabView = memo(({ tabId }: SchemaTabViewProps) => {
  // Get the reactive portion of tab state
  const tab = useTabReactiveState<SchemaBrowserTab>(tabId, 'schema-browser');

  return <SchemaBrowser tab={tab} />;
});
