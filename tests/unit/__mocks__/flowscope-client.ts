type MockFlowScopeClient = {
  analyze: () => Promise<Record<string, unknown>>;
  split: (sql: string) => Promise<{ statements: Array<{ start: number; end: number }> }>;
  completionItems: () => Promise<Record<string, unknown>>;
};

const splitBySemicolon = (sql: string): Array<{ start: number; end: number }> => {
  const statements: Array<{ start: number; end: number }> = [];
  let start = 0;

  for (const part of sql.split(';')) {
    const leading = part.search(/\S/);
    if (leading >= 0) {
      statements.push({ start: start + leading, end: start + part.length });
    }
    start += part.length + 1;
  }

  return statements;
};

const createMockFlowScopeClient = (): MockFlowScopeClient => ({
  analyze: async () => ({}),
  split: async (sql: string) => ({ statements: splitBySemicolon(sql) }),
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
let interactiveClientInstance: MockFlowScopeClient | null = null;

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

export function getInteractiveFlowScopeClient(): MockFlowScopeClient {
  if (!interactiveClientInstance) {
    interactiveClientInstance = createMockFlowScopeClient();
  }
  return interactiveClientInstance;
}

export function terminateFlowScopeClients(): void {
  clientInstance = null;
  completionClientInstance = null;
  interactiveClientInstance = null;
}

export type FlowScopeClient = MockFlowScopeClient;
