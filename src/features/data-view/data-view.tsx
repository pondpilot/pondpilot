/* eslint-disable no-console */
import { TabsPane } from '@features/tabs-pane';
import { useAllTabsQuery, useTabMutation } from '@store/app-idb-store';
import { useCreateQueryFileMutation } from '@store/app-idb-store/useEditorFileQuery';
import React from 'react';

export const DataView = () => {
  const { data: tabs = [] } = useAllTabsQuery();
  const { mutate } = useTabMutation();
  const { mutateAsync: createQueryFile } = useCreateQueryFileMutation();

  const onCreateQueryTab = async () => {
    const maxOrder = tabs?.length > 0 ? Math.max(...tabs.map((tab) => tab.order)) : -1;

    const newQueryFile = await createQueryFile({
      name: 'query',
    });

    mutate({
      sourceId: newQueryFile.id,
      name: newQueryFile.name,
      type: 'query',
      active: true,
      stable: true,
      state: 'pending',
      order: maxOrder + 1,
      editor: {
        fullQuery: '',
        lastQuery: '',
        codeSelection: {
          start: 0,
          end: 0,
        },
        undoHistory: [],
      },
      layout: {
        tableColumnWidth: {},
        editorPaneHeight: 0,
        dataViewPaneHeight: 0,
      },
      dataView: {
        data: null,
        rowCount: 0,
        columnCount: 0,
      },
      pagination: {
        page: 0,
        limit: 0,
      },
      sort: {
        column: '',
        order: 'desc',
      },
    });
  };

  return (
    <>
      <TabsPane onAddTabClick={onCreateQueryTab} />
    </>
  );
};
