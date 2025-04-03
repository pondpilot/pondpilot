import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreateTab, Tab, TabMetaInfo, tabStoreApi, UpdateTab } from './app-idb-store';

export const useTabQuery = (id: string) =>
  useQuery({
    queryKey: ['tab', id],
    queryFn: () => tabStoreApi.getTab(id),
  });

export const useAllTabsQuery = () =>
  useQuery({
    queryKey: ['tabs'],
    queryFn: async (): Promise<TabMetaInfo[]> => {
      const tabs = await tabStoreApi.getAllTabs();
      return tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        active: tab.active,
        order: tab.order,
        type: tab.type,
        state: tab.state,
        sourceId: tab.sourceId,
        stable: tab.stable,
        updatedAt: tab.updatedAt,
        createdAt: tab.createdAt,
        query: tab.query,
      }));
    },
  });

export const useCreateTabMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: CreateTab): Promise<Tab> => {
      const tabs = await tabStoreApi.getAllTabs();
      const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((tab) => tab.order)) : -1;

      const newTabWithOrder: Omit<Tab, 'id' | 'createdAt' | 'updatedAt'> = {
        query: {
          state: 'pending',
          originalQuery: '',
        },
        layout: {
          tableColumnWidth: {},
          editorPaneHeight: 0,
          dataViewPaneHeight: 0,
        },
        dataView: {
          data: undefined,
          rowCount: 0,
        },
        pagination: {
          page: 1,
        },
        sort: {
          column: '',
          order: null,
        },
        ...params,
        order: maxOrder + 1,
      };

      const currentActiveTab = tabs.find((tab) => tab.active);
      if (currentActiveTab) {
        await tabStoreApi.updateTab(currentActiveTab.id, (tab) => ({
          ...tab,
          active: false,
        }));
      }

      const createdTab = await tabStoreApi.createTab(newTabWithOrder);
      if (!createdTab) {
        throw new Error('Failed to create tab');
      }

      return createdTab;
    },
    onSuccess: (tab: Tab) => {
      queryClient.setQueryData(['tab', tab.id], tab);
      queryClient.invalidateQueries({ queryKey: ['tabs'] });
    },
  });
};

export const useUpdateTabMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: UpdateTab): Promise<Tab> => {
      const { id, ...updateData } = params;

      await tabStoreApi.updateTab(id, (currentTab) => ({
        ...currentTab,
        ...updateData,
        updatedAt: Date.now(),
      }));

      const updatedTab = await tabStoreApi.getTab(id);
      if (!updatedTab) {
        throw new Error(`Tab with id ${id} not found`);
      }

      return updatedTab;
    },
    onSuccess: (tab: Tab) => {
      queryClient.setQueryData(['tab', tab.id], tab);
      queryClient.invalidateQueries({ queryKey: ['tabs'] });
    },
  });
};

export const useDeleteTabsMutatuion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const tabs = await tabStoreApi.getAllTabs();
      const isDeletingActiveTab = tabs.some((tab) => tab.active && ids.includes(tab.id));

      // If deleting the active tab, set a new active tab
      if (isDeletingActiveTab && tabs.length > ids.length) {
        // Get remaining tabs that won't be deleted
        const remainingTabs = tabs.filter((tab) => !ids.includes(tab.id));
        // Sort by updatedAt to find the most recently updated tab
        const tabsToActivate = [...remainingTabs].sort(
          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
        );

        if (tabsToActivate.length > 0) {
          await tabStoreApi.updateTab(tabsToActivate[0].id, (tab) => ({
            ...tab,
            active: true,
          }));
        }
      }

      return tabStoreApi.deleteTabs(ids);
    },
    onSuccess: (_, ids) => {
      ids.forEach((id) => {
        queryClient.removeQueries({ queryKey: ['tab', id] });
      });
      queryClient.invalidateQueries({ queryKey: ['tabs'] });
    },
  });
};

export const useSetActiveTabMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tabId: string) => {
      const tabs = await tabStoreApi.getAllTabs();
      const currentActiveTab = tabs.find((tab) => tab.active);

      if (currentActiveTab) {
        await tabStoreApi.updateTab(currentActiveTab.id, (tab) => ({
          ...tab,
          active: false,
        }));
      }

      await tabStoreApi.updateTab(tabId, (tab) => ({
        ...tab,
        active: true,
      }));

      return tabId;
    },
    onSuccess: (tabId: string) => {
      queryClient.invalidateQueries({ queryKey: ['tabs'] });
      queryClient.invalidateQueries({ queryKey: ['tab', tabId] });
    },
  });
};
