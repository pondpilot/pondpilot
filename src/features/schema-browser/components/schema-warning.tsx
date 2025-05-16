interface SchemaWarningProps {
  warningMessage?: string;
  limitMessage?: string;
}

export const SchemaWarning = ({ warningMessage, limitMessage }: SchemaWarningProps) => (
  <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded shadow border border-yellow-300 dark:border-yellow-700">
    <div className="text-sm text-yellow-800 dark:text-yellow-200">
      {limitMessage || warningMessage}
    </div>
  </div>
);
