import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AddDataSourceProps } from '@models/common';
import { fileHandleStoreApi } from './app-idb-store';

export const useFileHandlesQuery = () =>
  useQuery({
    queryKey: ['file-handles'],
    queryFn: () => fileHandleStoreApi.getFileHandles(),
  });

export const useAddFileHandlesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AddDataSourceProps) => {
      await fileHandleStoreApi.addFileHandles(data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-handles'] });
    },
  });
};

export const useDeleteFileHandlesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await fileHandleStoreApi.deleteFileHandles(ids);
      return ids;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-handles'] });
    },
  });
};
