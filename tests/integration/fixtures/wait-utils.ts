import { test as base } from '@playwright/test';

type WaitUtilsFixtures = {
  waitForFilesToBeProcessed: () => Promise<void>;
  waitForSearchDebounce: () => Promise<void>;
  waitForAnimationComplete: () => Promise<void>;
  waitForExplorerReady: () => Promise<void>;
};

export const test = base.extend<WaitUtilsFixtures>({
  waitForFilesToBeProcessed: async ({ page }, use) => {
    await use(async () => {
      // Wait for any loading states to complete
      await page.waitForFunction(
        () => {
          const loadingElements = document.querySelectorAll('[data-loading="true"]');
          const processingElements = document.querySelectorAll('[data-processing="true"]');
          return loadingElements.length === 0 && processingElements.length === 0;
        },
        { timeout: 10000 },
      );

      // Wait for DOM to be ready
      await page.waitForLoadState('domcontentloaded');
    });
  },

  waitForSearchDebounce: async ({ page }, use) => {
    await use(async () => {
      // Wait for search debounce by checking if search results have stabilized
      await page.waitForFunction(
        () => {
          // Store the current DOM state
          const getCurrentNodes = () => {
            const nodes = document.querySelectorAll('[data-testid*="tree-node-"]');
            return Array.from(nodes)
              .map((n) => n.textContent)
              .join(',');
          };

          const initialState = getCurrentNodes();

          return new Promise((resolve) => {
            setTimeout(() => {
              const finalState = getCurrentNodes();
              resolve(initialState === finalState);
            }, 350); // Slightly more than typical debounce time
          });
        },
        { timeout: 5000 },
      );
    });
  },

  waitForAnimationComplete: async ({ page }, use) => {
    await use(async () => {
      // Wait for CSS animations and transitions to complete
      await page.waitForFunction(
        () => {
          const elements = document.querySelectorAll('*');
          for (const element of elements) {
            const animations = element.getAnimations?.() || [];
            if (animations.length > 0) {
              return false;
            }
          }
          return true;
        },
        { timeout: 5000 },
      );
    });
  },

  waitForExplorerReady: async ({ page }, use) => {
    await use(async () => {
      // Wait for the data explorer to be fully loaded
      await page.waitForSelector('[data-testid="data-explorer"]', {
        state: 'visible',
        timeout: 5000,
      });

      // Wait for tree structure to be rendered
      await page.waitForSelector('[role="tree"]', {
        state: 'visible',
        timeout: 5000,
      });
    });
  },
});
