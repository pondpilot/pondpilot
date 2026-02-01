/**
 * Format large numbers with K/M/B suffixes for chart axes.
 * Examples: 1500 → "1.5K", 2500000 → "2.5M", 1000000000 → "1B"
 */
export function formatCompactNumber(value: number): string {
  if (value === 0) return '0';

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000_000) {
    const formatted = (absValue / 1_000_000_000).toFixed(1);
    return `${sign}${formatted.replace(/\.0$/, '')}B`;
  }

  if (absValue >= 1_000_000) {
    const formatted = (absValue / 1_000_000).toFixed(1);
    return `${sign}${formatted.replace(/\.0$/, '')}M`;
  }

  if (absValue >= 1_000) {
    const formatted = (absValue / 1_000).toFixed(1);
    return `${sign}${formatted.replace(/\.0$/, '')}K`;
  }

  // For small numbers, show up to 2 decimal places
  if (absValue < 1 && absValue > 0) {
    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  // For integers or numbers with few decimals
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(1).replace(/\.0$/, '');
}

/**
 * Format number for tooltip display - shows full precision with locale formatting.
 * Examples: 1500 → "1,500", 2500000.50 → "2,500,000.5"
 */
export function formatTooltipNumber(value: number | undefined): string {
  if (value == null) return '';
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }

  // For decimals, show up to 2 decimal places
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
