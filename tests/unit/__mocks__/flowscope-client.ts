class MockFlowScopeClient {
  async analyze(): Promise<Record<string, unknown>> {
    return {};
  }

  async split(): Promise<{ statements: Array<{ start: number; end: number }> }> {
    return { statements: [] };
  }

  async completionItems(): Promise<Record<string, unknown>> {
    return {};
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'CancelledError';
  }
}

let clientInstance: MockFlowScopeClient | null = null;

export function getFlowScopeClient(): MockFlowScopeClient {
  if (!clientInstance) {
    clientInstance = new MockFlowScopeClient();
  }
  return clientInstance;
}

export function terminateFlowScopeClient(): void {
  clientInstance = null;
}

export type FlowScopeClient = MockFlowScopeClient;
