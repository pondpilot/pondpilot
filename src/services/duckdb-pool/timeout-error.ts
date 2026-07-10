export class PoolTimeoutError extends Error {
  constructor() {
    super('Timeout while waiting for a connection');
    this.name = 'PoolTimeoutError';
  }
}
