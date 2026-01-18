import { test as base, expect, Locator, Page } from '@playwright/test';

type OpenSpotlightProps = {
  trigger?: 'click' | 'hotkey';
};

type SpotlightActionProps = {
  trigger?: 'mouse' | 'keyboard';
};

type SpotlightFixtures = {
  spotlight: Locator;
  openSpotlight: (v?: OpenSpotlightProps) => Promise<Locator>;
  createScriptViaSpotlight: (v?: SpotlightActionProps) => Promise<void>;
  openSettingsViaSpotlight: (v?: SpotlightActionProps) => Promise<void>;
  addDirectoryViaSpotlight: (v?: SpotlightActionProps) => Promise<void>;
  openImportSharedScriptModalViaSpotlight: (v?: SpotlightActionProps) => Promise<void>;
  searchSpotlightAndRunNamedItem: (name: string, options?: SpotlightActionProps) => Promise<void>;
  closeAllTabsViaSpotlight: (v?: SpotlightActionProps) => Promise<void>;
  closeAllButActiveTabViaSpotlight: (v?: SpotlightActionProps) => Promise<void>;
};

async function selectSpotlightActionByKeyboard(
  page: Page,
  spotlightRoot: Locator,
  spotlightAction: Locator,
) {
  // get the total count of spotlight actions to avoid infinite loop
  const spotlightActionsCount = await spotlightRoot.getByTestId(/^spotlight-action-.*/).count();

  // Select the action using arrow keys
  let i = 0;
  while (i <= spotlightActionsCount) {
    // Depending on action we may or may not be on the first action
    // even before any key press, so start by checking first, key press later
    const isActionSelected = (await spotlightAction.getAttribute('data-selected')) === 'true';

    if (isActionSelected) {
      return;
    }

    await page.keyboard.press('ArrowDown');

    i += 1;
  }

  throw new Error('Spotlight action not found');
}

async function openAndTriggerSpotlightActionById(
  page: Page,
  openSpotlight: (v?: OpenSpotlightProps) => Promise<Locator>,
  actionId: string,
  props?: SpotlightActionProps,
) {
  const useKeyoardOnly = props?.trigger === 'keyboard';

  const spotlightRoot = await openSpotlight({ trigger: useKeyoardOnly ? 'hotkey' : 'click' });

  // Create new query through spotlight
  const spotlightAction = spotlightRoot.getByTestId(`spotlight-action-${actionId}`);

  // Perform action using mouse or keyboard
  if (useKeyoardOnly) {
    await selectSpotlightActionByKeyboard(page, spotlightRoot, spotlightAction);
    await page.keyboard.press('Enter');
  } else {
    await spotlightAction.click();
  }

  // Verify spotlight is closed after performing action
  await expect(spotlightRoot).toBeHidden();
}

export const test = base.extend<SpotlightFixtures>({
  spotlight: async ({ page }, use) => {
    await use(page.getByTestId('spotlight-menu'));
  },

  openSpotlight: async ({ page, spotlight }, use) => {
    await use(async (props) => {
      // Verify spotlight is not visible
      await expect(spotlight).toBeHidden();

      // Open spotlight menu using trigger
      if (props?.trigger === 'hotkey') {
        await page.keyboard.press('ControlOrMeta+k');
      } else {
        await page.getByTestId('spotlight-trigger-input').click();
      }

      // Verify spotlight is visible
      await expect(spotlight).toBeVisible();

      const searchInput = page.getByTestId('spotlight-search');
      await expect(searchInput).toBeVisible();
      await searchInput.fill('');

      return spotlight;
    });
  },

  createScriptViaSpotlight: async ({ page, openSpotlight }, use) => {
    await use(async (props) => {
      await openAndTriggerSpotlightActionById(page, openSpotlight, 'create-new-script', props);
    });
  },

  openSettingsViaSpotlight: async ({ page, openSpotlight }, use) => {
    await use(async (props) => {
      await openAndTriggerSpotlightActionById(page, openSpotlight, 'settings', props);
    });
  },

  addDirectoryViaSpotlight: async ({ page, openSpotlight }, use) => {
    await use(async (props) => {
      await openAndTriggerSpotlightActionById(page, openSpotlight, 'add-folder', props);
    });
  },

  openImportSharedScriptModalViaSpotlight: async ({ page, openSpotlight }, use) => {
    await use(async (props) => {
      await openAndTriggerSpotlightActionById(page, openSpotlight, 'import-script-from-url', props);
    });
  },

  closeAllTabsViaSpotlight: async ({ page, openSpotlight }, use) => {
    await use(async (props) => {
      await openAndTriggerSpotlightActionById(page, openSpotlight, 'close-all-tabs', props);
    });
  },

  closeAllButActiveTabViaSpotlight: async ({ page, openSpotlight }, use) => {
    await use(async (props) => {
      await openAndTriggerSpotlightActionById(
        page,
        openSpotlight,
        'close-all-but-active-tab',
        props,
      );
    });
  },

  searchSpotlightAndRunNamedItem: async ({ page, openSpotlight }, use) => {
    await use(async (name: string, options?: SpotlightActionProps) => {
      const useKeyoardOnly = options?.trigger === 'keyboard';

      const spotlightRoot = await openSpotlight({ trigger: useKeyoardOnly ? 'hotkey' : 'click' });

      // Type the name of the item to search
      await page.keyboard.type(name);

      // Get all visible spotlight actions
      const spotlightActions = spotlightRoot.getByTestId(/^spotlight-action-.*/);

      // Get the first action that matches the name
      const spotlightAction = spotlightActions.filter({
        hasText: new RegExp(`^${name}$`),
      });

      // Perform action using mouse or keyboard
      if (useKeyoardOnly) {
        await selectSpotlightActionByKeyboard(page, spotlightRoot, spotlightAction);
        await page.keyboard.press('Enter');
      } else {
        await spotlightAction.click();
      }

      // Verify spotlight is closed after performing action
      await expect(spotlightRoot).toBeHidden();
    });
  },
});
