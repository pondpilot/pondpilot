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
      }));
    },
  });

export const useTabMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateTab | (UpdateTab & { id: string })): Promise<Tab> => {
      const tabs = await tabStoreApi.getAllTabs();

      if ('id' in params) {
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
      }

      const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((tab) => tab.order)) : -1;

      const newTabWithOrder: CreateTab = {
        ...params,
        order: maxOrder + 1,
      };

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabs'] });
    },
  });
};

export const useTabDeleteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tabStoreApi.deleteTab(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: ['tab', id] });
      queryClient.invalidateQueries({ queryKey: ['tabs'] });
    },
  });
};
