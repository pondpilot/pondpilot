/**
 * Set data-testid attribute only in development environment
 * @param value - value of data-testid attribute
 * @returns value if in development environment, otherwise undefined
 */
export const setDataTestId = (value: string): string | undefined =>
  import.meta.env.DEV || __INTEGRATION_TEST__ ? value : undefined;
