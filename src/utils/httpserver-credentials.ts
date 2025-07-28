import { PersistentDataSourceId } from '../models/data-source';

export interface HTTPServerCredentials {
  password?: string;
  token?: string;
}

// Stub for saving credentials - just logging for now
export function saveHTTPServerCredentials(
  id: PersistentDataSourceId,
  credentials: HTTPServerCredentials,
): void {
  // eslint-disable-next-line no-console
  console.log(`[Stub] Saving credentials for HTTPServer ${id}:`, {
    hasPassword: !!credentials.password,
    hasToken: !!credentials.token,
  });
  // TODO: Implement proper credentials storage
}

// Stubs for other functions
export function getCredentialsForServer(id: PersistentDataSourceId): HTTPServerCredentials | null {
  // eslint-disable-next-line no-console
  console.log(`[Stub] Getting credentials for HTTPServer ${id}`);
  return null;
}

export function removeHTTPServerCredentials(id: PersistentDataSourceId): void {
  // eslint-disable-next-line no-console
  console.log(`[Stub] Removing credentials for HTTPServer ${id}`);
}
