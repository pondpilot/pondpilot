/* eslint-disable no-console */
import { useAppContext } from '@features/app-context';
import { ActionIcon, Group } from '@mantine/core';
import { useAllTabsQuery, useTabDeleteMutation, useTabMutation } from '@store/app-idb-store';
import React from 'react';

export const DataView = () => {
  const { onCreateQueryFile } = useAppContext();
  const { data: tabs = [] } = useAllTabsQuery();
  const { mutate } = useTabMutation();
  const { mutate: deleteTab } = useTabDeleteMutation();

  console.log({
    tabs,
  });
  const onCreateQueryTab = async () => {
    const maxOrder = tabs?.length > 0 ? Math.max(...tabs.map((tab) => tab.order)) : -1;

    await onCreateQueryFile({
      entities: [
        {
          name: `New Query ${maxOrder + 1}`,
        },
      ],
    });
    mutate({
      name: `New Query ${maxOrder + 1}`,
      type: 'query',
      active: true,
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

  const handleDeleteTab = (id: string) => {
    deleteTab(id);
  };

  return (
    <div>
      <Group>
        {tabs?.map((tab) => (
          <div key={tab.id}>
            {tab.name}
            <ActionIcon onClick={() => handleDeleteTab(tab.id)}>X</ActionIcon>
          </div>
        ))}
      </Group>
      <ActionIcon onClick={onCreateQueryTab}>+</ActionIcon>
    </div>
  );
};
