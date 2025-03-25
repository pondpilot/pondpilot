import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryStoreApi } from './app-idb-store';

export const useQueryFilesQuery = () =>
  useQuery({
    queryKey: ['queryFiles'],
    queryFn: () => queryStoreApi.getQueryFiles(),
  });

export const useQueryFileQuery = (id: string | undefined) =>
  useQuery({
    queryKey: ['queryFile', id],
    queryFn: async () => {
      const allQueries = await queryStoreApi.getQueryFiles();
      return allQueries.find((query) => query.id === id);
    },
    enabled: !!id,
  });

export const useCreateQueryFileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (props: { name: string; content?: string }) => {
      const data = await queryStoreApi.createQueryFile(props.name, props.content);
      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queryFiles'] });
    },
  });
};

export const useDeleteQueryFilesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await queryStoreApi.deleteQueryFiles(ids);
      return ids;
    },
    onSuccess: (ids) => {
      // Remove individual query cache entries
      ids.forEach((id) => {
        queryClient.removeQueries({ queryKey: ['queryFile', id] });
      });
      // Invalidate the list of query files
      queryClient.invalidateQueries({ queryKey: ['queryFiles'] });
    },
  });
};
export const useRenameQueryFileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await queryStoreApi.renameQueryFile(id, name);
      return { id, name };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queryFile', data.id] });
      queryClient.invalidateQueries({ queryKey: ['queryFiles'] });
      queryClient.invalidateQueries({ queryKey: ['tabs'] });
    },
  });
};

export const useChangeQueryContentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      await queryStoreApi.changeQueryContent(id, content);
      return { id, content };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queryFile', data.id] });
    },
  });
};

export const useCreateMultipleQueryFilesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (props: { entities: { name: string; content: string }[] }) => {
      const data = await queryStoreApi.createMultipleQueryFiles(props.entities);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queryFiles'] });
    },
  });
};
