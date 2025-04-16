import { APP_DB_NAME } from '@models/persisted-store';

/* eslint-disable no-alert */
export const deleteApplicationData = async () => {
  const confirmDelete = window.confirm(
    'Are you sure you want to delete all application data? This action cannot be undone.',
  );

  if (!confirmDelete) {
    return;
  }

  try {
    // TODO: Maybe we should't delete the entire database?
    indexedDB.deleteDatabase(APP_DB_NAME);

    window.location.reload();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete application data: ', error);
  }
};
