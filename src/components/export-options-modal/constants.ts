export const LARGE_DATASET_THRESHOLD = 1000000;

export const formatOptions = [
  { label: 'CSV', value: 'csv' },
  { label: 'TSV', value: 'tsv' },
  { label: 'Excel', value: 'xlsx' },
  { label: 'SQL', value: 'sql' },
  { label: 'XML', value: 'xml' },
  { label: 'Markdown', value: 'md' },
];

export const commonTextInputClassNames = {
  root: 'w-full',
  label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark px-4',
  input:
    'border-borderPrimary-light dark:border-borderPrimary-dark rounded-full px-4 py-4 bg-transparent text-textPrimary-light dark:text-textPrimary-dark text-base',
};

export const commonCheckboxClassNames = {
  root: 'flex items-center',
  label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
};
