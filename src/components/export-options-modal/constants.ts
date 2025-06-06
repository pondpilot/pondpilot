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
  label: 'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
  input: 'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
};

export const commonCheckboxClassNames = {
  root: 'flex items-center',
  label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
};
