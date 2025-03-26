import { BackgroundImage, Box, Center, Image, Stack, Text, Title } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';
import browserNotSupportedImg from './assets/wat.png';
import CrackDuck from './assets/crack-duck.svg';

export const BrowserNotSupported = () => (
  <Box h="100vh" w="100vw" pos="relative" data-testid={setDataTestId('browser-not-supported')}>
    <BackgroundImage className=" opacity-20 h-[130%] w-[130%]" src={browserNotSupportedImg} />
    <Center pos="absolute" top={0} left={0} w="100%" h="100%">
      <Box w={675} h={480} bg="background-primary" className="rounded-2xl pt-8 px-4 pb-14">
        <Stack gap={16} align="center">
          <Title order={1} fw={400}>
            Unsupported Browser
          </Title>
          <Text size="md">We’re sorry, but you have to use Chrome or Edge to use PondPilot.</Text>
        </Stack>
        <Stack align="center" className="mt-8" gap={16}>
          <Image src={CrackDuck} w={210} h={175} />
          <Title order={2} fw={400}>
            But Why?..
          </Title>
          <Text size="md" ta="center">
            Because web “standards” <span className="text-xl">💀💀💀</span> .<br /> PondPilot uses a
            cutting-edge{' '}
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API"
              target="_blank"
              rel="noreferrer"
              className="text-blue-500"
            >
              direct file access API
            </a>
            , allowing a unique in-browser experience of private access to your local files with no
            overhead.
          </Text>
        </Stack>
      </Box>
    </Center>
  </Box>
);
