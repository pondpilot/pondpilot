export const formatNumber = (value: number): string => {
  if (Number.isNaN(value as number)) return '';

  const formatter = new Intl.NumberFormat('en-UK', {
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
};
