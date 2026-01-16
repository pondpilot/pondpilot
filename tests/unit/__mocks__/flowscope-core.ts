type AnalyzeResult = {
  statements: Array<unknown>;
  summary: {
    statementCount: number;
    hasErrors: boolean;
  };
};

export const analyzeSql = async (): Promise<AnalyzeResult> => ({
  statements: [],
  summary: {
    statementCount: 0,
    hasErrors: false,
  },
});

export const initWasm = async (): Promise<void> => {};
