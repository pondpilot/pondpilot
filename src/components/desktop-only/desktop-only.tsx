import { Image, Box, Stack, Text, Title, Center } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

import desktopOnly from './assets/desktop-only.svg';

export const DesktopOnly = () => {
  return (
    <Box
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
              PondPilot doesn&apos;t work on mobile.
              <br />
              Please switch to a desktop.
            </Text>
          </Stack>
          <Image src={desktopOnly} />
        </Stack>
      </Center>
    </Box>
  );
};
