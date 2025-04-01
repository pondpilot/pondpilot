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
      const fileHandles = await fileHandleStoreApi.getFileHandles();
      return fileHandles;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['file-handles'] });
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

// const checkForDuplicateHandles = async (
//   newFileHandles: FileSystemFileHandle[],
//   existingHandles: FileSystemFileHandle[],
// ): Promise<void> => {
//   // Check if any of the new file handles have the same name as existing ones
//   for (const handle of newFileHandles) {
//     if (existingHandles.some((existingHandle) => existingHandle.name === handle.name)) {
//       throw new Error(`File "${handle.name}" is already added`);
//     }
//   }

//   const uniqueCheckPromises = existingHandles.flatMap((existingHandle) =>
//     newFileHandles.map(async (newHandle) => {
//       const isSame = await newHandle.isSameEntry(existingHandle);
//       return { isSame, existingHandle };
//     }),
//   );

//   const results = await Promise.all(uniqueCheckPromises);
//   const duplicate = results.find(({ isSame }) => isSame);
//   if (duplicate) {
//     throw new Error(`File "${duplicate.existingHandle.name}" is already added`);
//   }
// };
