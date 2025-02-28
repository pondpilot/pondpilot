/* eslint-disable no-alert */
export const deleteApplicationData = async () => {
  const confirmDelete = window.confirm(
    'Are you sure you want to delete all application data? This action cannot be undone.',
  );

  if (!confirmDelete) {
    return;
  }

  try {
    const rootDirectory = await navigator.storage.getDirectory();
    const entries = rootDirectory.entries();

    for await (const [name] of entries) {
      await rootDirectory.removeEntry(name, { recursive: true });
    }

    indexedDB.deleteDatabase('FileHandlesDB');
    indexedDB.deleteDatabase('TabsDB');

    const isNavigatorStoragePersisted = await navigator.storage.persisted();

    if (isNavigatorStoragePersisted) {
      const storageManager: any = navigator.storage as any;

      if (typeof storageManager.clear === 'function') {
        await storageManager.clear();
      }
    }

    window.location.reload();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete application data: ', error);
  }
};
