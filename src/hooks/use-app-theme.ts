import { useMantineColorScheme } from '@mantine/core';
import { useColorScheme } from '@mantine/hooks';

export const useAppTheme = () => {
  const { colorScheme } = useMantineColorScheme();
  const systemColorScheme = useColorScheme();

  return colorScheme === 'auto' ? systemColorScheme : colorScheme;
};
