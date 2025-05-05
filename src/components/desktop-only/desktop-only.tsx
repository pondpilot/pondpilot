import { Image, Box, MantineBreakpoint, Stack, Text, Title, Center } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

import desktopOnly from './assets/desktop-only.svg';

export const DesktopOnly = ({ hiddenFrom }: { hiddenFrom: MantineBreakpoint }) => {
  return (
    <Box
      hiddenFrom={hiddenFrom}
      data-testid={setDataTestId('desktop-only')}
      className="fixed inset-0 z-30"
      h="100vh"
      w="100vw"
      bg="background-primary"
    >
      <Center h="100%">
        <Stack gap={32} h={536}>
          <Stack gap={16}>
            <Title order={1} fw={400} c="text-primary" ta="center">
              Desktop Only
            </Title>
            <Text ta="center">
              Please switch to a desktop view
              <br /> to access PondPilot.
            </Text>
          </Stack>
          <Image src={desktopOnly} />
        </Stack>
      </Center>
    </Box>
  );
};
