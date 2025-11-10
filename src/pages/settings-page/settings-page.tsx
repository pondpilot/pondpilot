import { useActiveSection } from '@hooks/use-active-section';
import { ActionIcon, Divider, Stack } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { Fragment, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { SettingsBlock } from './components/settings-block';
import { SettingsNavigation } from './components/settings-navigation';
import { settingsConfig, getNavigationItems } from './settings.config';

export const SettingsPage = () => {
  const navigate = useNavigate();
  const navigationItems = getNavigationItems();
  const sectionIds = navigationItems.map((item) => item.id);
  const activeSection = useActiveSection({ sections: sectionIds });

  const scrollToSection = (sectionId: string) => {
    window.location.hash = sectionId;
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  // Handle initial hash on page load
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const validSectionIds = getNavigationItems().map((item) => item.id);
    if (hash && validSectionIds.includes(hash)) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      }, 100);
    }
  }, []); // Empty dependency array - only run on mount

  return (
    <div
      className="flex flex-1 h-full justify-center overflow-y-auto min-h-0"
      data-testid={setDataTestId('settings-page')}
    >
      <div className="flex relative max-w-[1024px] w-full min-h-0 h-full">
        <SettingsNavigation
          navigationItems={navigationItems}
          activeSection={activeSection}
          onSectionClick={scrollToSection}
        />

        <main className="flex-1 p-4 overflow-y-auto h-full min-h-0 custom-scroll-hidden">
          <div className="max-w-2xl mx-auto min-h-full">
            <Stack gap={32} className="pb-16 min-h-full">
              {settingsConfig.blocks.map((block, index) => (
                <Fragment key={block.id}>
                  {index > 0 && <Divider />}
                  <SettingsBlock {...block} />
                </Fragment>
              ))}
            </Stack>
          </div>
        </main>

        <ActionIcon
          className="absolute -right-12 top-4"
          data-testid={setDataTestId('settings-page-close-button')}
          onClick={() => navigate('/')}
          visibleFrom="lg"
        >
          <IconX />
        </ActionIcon>
      </div>
    </div>
  );
};
