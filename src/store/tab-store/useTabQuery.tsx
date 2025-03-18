import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tab, TabMetaInfo, tabStoreApi } from './tab-store';

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
    mutationFn: async (tab: Tab) => {
      if (tab.id) {
        await tabStoreApi.updateTab(tab.id, () => tab);
        return tab;
      }

      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...tabData } = tab as Tab;
      return tabStoreApi.createTab(tabData);
    },
    onSuccess: (tab) => {
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
