import { BackgroundImage, Box, Center, Image, Stack, Text, Title } from '@mantine/core';
import { setAppLoadState } from '@store/app-store';
import { setDataTestId } from '@utils/test-id';
import { useEffect } from 'react';

import browserNotSupportedImgBsod from './assets/bsod.svg';
import CrackDuck from './assets/crack-duck.svg';
import browserNotSupportedImgMatrix from './assets/matrix.svg';
import browserNotSupportedImgWat from './assets/wat.svg';

const backgroundImages = [
  browserNotSupportedImgWat,
  browserNotSupportedImgBsod,
  browserNotSupportedImgMatrix,
];

export const BrowserNotSupported = () => {
  useEffect(() => {
    // Update app state on mount
    setAppLoadState('ready');
  }, []);

  return (
    <Box h="100vh" w="100vw" pos="relative" data-testid={setDataTestId('browser-not-supported')}>
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
              Unsupported Browser
            </Title>
            <Text size="md" ta="center">
              We’re sorry, but you have to use Chrome or Edge to use PondPilot.
            </Text>
          </Stack>
          <Stack align="center" className="mt-8" gap={16}>
            <Image src={CrackDuck} w={210} h={175} />
            <Title order={2} fw={400}>
              But Why?..
            </Title>
            <Text size="md" ta="center">
              Because web “standards” <span className="text-xl">💀💀💀</span> .<br /> PondPilot uses
              a cutting-edge{' '}
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API"
                target="_blank"
                rel="noreferrer"
                className="text-blue-500"
              >
                direct file access API
              </a>
              , allowing a unique in-browser experience of private access to your local files with
              no overhead.
            </Text>
          </Stack>
        </Box>
      </Center>
    </Box>
  );
};
