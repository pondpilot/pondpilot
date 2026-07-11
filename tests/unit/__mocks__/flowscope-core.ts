type AnalyzeResult = {
  statements: Array<unknown>;
  nodes: Array<{ statementIds?: number[] }>;
  edges: Array<{ statementIds?: number[] }>;
  issues: Array<unknown>;
  summary: {
    statementCount: number;
    hasErrors: boolean;
  };
};

export const analyzeSql = async (): Promise<AnalyzeResult> => ({
  statements: [],
  nodes: [],
  edges: [],
  issues: [],
  summary: {
    statementCount: 0,
    hasErrors: false,
  },
});

export const initWasm = async (): Promise<void> => {};

export const nodesInStatement = (
  result: AnalyzeResult,
  statementIndex: number,
): AnalyzeResult['nodes'] =>
  result.nodes.filter((node) => node.statementIds?.includes(statementIndex));

export const edgesInStatement = (
  result: AnalyzeResult,
  statementIndex: number,
): AnalyzeResult['edges'] =>
  result.edges.filter((edge) => edge.statementIds?.includes(statementIndex));
