interface SchemaErrorProps {
  error: string;
}

export const SchemaError = ({ error }: SchemaErrorProps) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <div className="text-lg text-red-500 mb-2">Error loading schema</div>
      <div className="text-sm text-slate-600 dark:text-slate-400">{error}</div>
    </div>
  </div>
);
