export function getSecretAlias(secretId: string): string {
  return `secret_${secretId.replace(/-/g, '_')}`;
}
