import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AddDataSourceProps } from '@models/common';
import { fileHandleStoreApi } from './app-idb-store';

export const useDataSourcesQuery = () =>
  useQuery({
    queryKey: ['dataSources'],
    queryFn: () => fileHandleStoreApi.getDataSources(),
  });

export const useAddDataSourcesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AddDataSourceProps) => {
      await fileHandleStoreApi.addDataSources(data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataSources'] });
    },
  });
};

export const useDeleteDataSourcesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await fileHandleStoreApi.onDeleteDataSource(ids);
      return ids;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataSources'] });
    },
  });
};
