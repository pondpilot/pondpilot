import { BackgroundImage, Box, Button, Center, Image, Stack, Text, Title } from '@mantine/core';

import browserNotSupportedImgBsod from '@components/browser-not-supported/assets/bsod.svg';
import CrackDuck from '@components/browser-not-supported/assets/crack-duck.svg';
import browserNotSupportedImgMatrix from '@components/browser-not-supported/assets/matrix.svg';
import browserNotSupportedImgWat from '@components/browser-not-supported/assets/wat.svg';
import { setDataTestId } from '@utils/test-id';

const backgroundImages = [
  browserNotSupportedImgWat,
  browserNotSupportedImgBsod,
  browserNotSupportedImgMatrix,
];

export const MultipleTabsBlocked = () => {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <Box h="100vh" w="100vw" pos="relative" data-testid={setDataTestId('multiple-tabs-blocked')}>
      <BackgroundImage
        className="h-full w-full"
        visibleFrom="desktop"
        src={backgroundImages[Math.floor(Math.random() * backgroundImages.length)]}
      />
      <Center inset={0} pos="absolute" w="100%" h="100%">
        <Box
          w={{ base: 'calc(100% - 80px)', md: 675 }}
          bg={{ base: 'transparent', md: 'background-primary' }}
          className="rounded-2xl pt-8 px-4 pb-14"
        >
          <Stack gap={16} align="center">
            <Title ta="center" order={1} fw={400}>
              Multiple Tabs Detected
            </Title>
            <Text size="md" ta="center">
              PondPilot is already running in another tab. Please use only one tab at a time.
            </Text>
          </Stack>
          <Stack align="center" className="mt-8" gap={16}>
            <Image src={CrackDuck} w={210} h={175} />
            <Title order={2} fw={400}>
              Why only one tab?
            </Title>
            <Text size="md" ta="center">
              PondPilot works with local files and databases. Running multiple tabs simultaneously
              could cause data conflicts and corruption.
            </Text>
            <Button onClick={handleRefresh} size="md" className="mt-4">
              Refresh Page
            </Button>
          </Stack>
        </Box>
      </Center>
    </Box>
  );
};
