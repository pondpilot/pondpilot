type MockFlowScopeClient = {
  analyze: () => Promise<Record<string, unknown>>;
  split: () => Promise<{ statements: Array<{ start: number; end: number }> }>;
  completionItems: () => Promise<Record<string, unknown>>;
};

const createMockFlowScopeClient = (): MockFlowScopeClient => ({
  analyze: async () => ({}),
  split: async () => ({ statements: [] }),
  completionItems: async () => ({}),
});

export class CancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'CancelledError';
  }
}

let clientInstance: MockFlowScopeClient | null = null;
let completionClientInstance: MockFlowScopeClient | null = null;

export function getFlowScopeClient(): MockFlowScopeClient {
  if (!clientInstance) {
    clientInstance = createMockFlowScopeClient();
  }
  return clientInstance;
}

export function getCompletionClient(): MockFlowScopeClient {
  if (!completionClientInstance) {
    completionClientInstance = createMockFlowScopeClient();
  }
  return completionClientInstance;
}

export function terminateFlowScopeClients(): void {
  clientInstance = null;
  completionClientInstance = null;
}

export type FlowScopeClient = MockFlowScopeClient;
