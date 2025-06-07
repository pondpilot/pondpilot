import { expect, Locator, Page } from '@playwright/test';

import { getNodeDataTestIdPrefix } from '@components/explorer-tree/utils/node-test-id';

export const isExplorerTreeNodeSelected = async (treeNode: Locator): Promise<boolean> => {
  const isSelected = await treeNode.getAttribute('data-selected');
  return isSelected === 'true';
};

export const getAllExplorerTreeNodes = (page: Page, dataTestIdPrefix: string): Locator => {
  return page.getByTestId(
    new RegExp(`^${getNodeDataTestIdPrefix(dataTestIdPrefix, '.*')}-container$`),
  );
};

export const getExplorerTreeNodeByName = (
  page: Page,
  dataTestIdPrefix: string,
  itemName: string,
): Locator => {
  // Find all explorer nodes
  const allNodes = getAllExplorerTreeNodes(page, dataTestIdPrefix);

  // Find the specific node that contains the item name
  return allNodes.filter({
    has: page.locator('p').getByText(itemName, { exact: true }),
  });
};

export const getExplorerTreeNodeByIndex = (
  page: Page,
  dataTestIdPrefix: string,
  index: number,
): Locator => {
  // Find all explorer nodes
  const allNodes = getAllExplorerTreeNodes(page, dataTestIdPrefix);

  // Find the specific node by index
  return allNodes.nth(index);
};

export const getExplorerTreeNodeById = (
  page: Page,
  dataTestIdPrefix: string,
  itemId: string,
): Locator => {
  return page.getByTestId(
    new RegExp(`^${getNodeDataTestIdPrefix(dataTestIdPrefix, itemId)}-container$`),
  );
};

export const getExplorerTreeNodeIdByName = async (
  page: Page,
  dataTestIdPrefix: string,
  itemName: string,
): Promise<string> => {
  // Find the specific node that contains the item name
  const itemNode = getExplorerTreeNodeByName(page, dataTestIdPrefix, itemName);

  // it may be off screen, but should be attached
  await expect(itemNode).toBeAttached();

  // Get the data-value attribute which contains the ID
  const itemId = await itemNode.getAttribute('data-value');

  if (!itemId) {
    throw new Error(`Item with name "${itemName}" not found or has no ID`);
  }

  return itemId;
};

export const assertExplorerItems = async (
  page: Page,
  dataTestIdPrefix: string,
  expected: string[],
) => {
  // Find all explorer nodes
  const allNodes = getAllExplorerTreeNodes(page, dataTestIdPrefix);

  // Check if the number of items matches
  await expect(allNodes).toHaveCount(expected.length);

  // Check if each item matches the expected names
  for (let i = 0; i < expected.length; i += 1) {
    const item = allNodes.nth(i);
    await expect(item).toHaveText(expected[i]);
  }
};

export const clickNodeByIndex = async (
  page: Page,
  dataTestIdPrefix: string,
  index: number,
): Promise<Locator> => {
  const node = getExplorerTreeNodeByIndex(page, dataTestIdPrefix, index);
  await node.click();
  return node;
};

export const clickNodeByName = async (
  page: Page,
  dataTestIdPrefix: string,
  itemName: string,
): Promise<Locator> => {
  const node = getExplorerTreeNodeByName(page, dataTestIdPrefix, itemName);
  await node.click();
  return node;
};

export const selectMultipleNodes = async (
  page: Page,
  dataTestIdPrefix: string,
  indices: number[],
): Promise<Locator[]> => {
  const selectedNodes: Locator[] = [];

  await page.keyboard.down('ControlOrMeta');

  for (const index of indices) {
    const node = await clickNodeByIndex(page, dataTestIdPrefix, index);
    selectedNodes.push(node);
  }

  await page.keyboard.up('ControlOrMeta');

  return selectedNodes;
};

export const assertScriptNodesSelection = async (
  page: Page,
  dataTestIdPrefix: string,
  expectedSelectedIndices: number[],
) => {
  // Find all explorer nodes
  const allNodes = getAllExplorerTreeNodes(page, dataTestIdPrefix);

  // Check that all items are deselected
  const actualSelection = await Promise.all(
    (await allNodes.all()).map((node) => {
      return isExplorerTreeNodeSelected(node);
    }),
  );

  const expectedSelection = actualSelection.every((isSelected, index) => {
    return isSelected
      ? expectedSelectedIndices.includes(index)
      : !expectedSelectedIndices.includes(index);
  });

  expect(expectedSelection).toBe(true);
};

export const renameExplorerItem = async (
  page: Page,
  dataTestIdPrefix: string,
  oldName: string,
  newName: string,
  expectedNameInExplorer?: string,
): Promise<void> => {
  // Find the item in the explorer using existing functions
  const oldNode = getExplorerTreeNodeByName(page, dataTestIdPrefix, oldName);
  const oldItemId = await getExplorerTreeNodeIdByName(page, dataTestIdPrefix, oldName);

  // Double-click to initiate rename
  await oldNode.dblclick();

  // Find and fill the rename input
  const renameInput = page.getByTestId(
    `${getNodeDataTestIdPrefix(dataTestIdPrefix, oldItemId)}-rename-input`,
  );

  await expect(renameInput).toBeVisible();

  await renameInput.fill(newName);

  // Press Enter to confirm
  await page.keyboard.press('Enter');

  // Wait for the renamed item to appear
  const renameNode = getExplorerTreeNodeByName(
    page,
    dataTestIdPrefix,
    expectedNameInExplorer ?? newName,
  );
  await expect(renameNode).toBeVisible();
  await expect(oldNode).toBeHidden();
};

/**
 * Tree node menu
 */

export const getExplorerTreeNodeMenuById = (
  page: Page,
  dataTestIdPrefix: string,
  itemId: string,
): Locator => {
  return page.getByTestId(`${getNodeDataTestIdPrefix(dataTestIdPrefix, itemId)}-context-menu`);
};

export const openExplorerTreeNodeMenuByName = async (
  page: Page,
  dataTestIdPrefix: string,
  itemName: string,
): Promise<Locator> => {
  const itemNode = getExplorerTreeNodeByName(page, dataTestIdPrefix, itemName);

  // Check if the item node is visible (exists)
  await expect(itemNode).toBeVisible();

  // Right-click to open the context menu
  itemNode.click({ button: 'right' });

  // Get the item ID from the node
  const itemId = await getExplorerTreeNodeIdByName(page, dataTestIdPrefix, itemName);
  const menuLocator = getExplorerTreeNodeMenuById(page, dataTestIdPrefix, itemId);

  // Wait for the menu to be visible
  await expect(menuLocator).toBeVisible();

  return menuLocator;
};

export const getAllExplorerTreeNodeMenuItems = async (
  page: Page,
  dataTestIdPrefix: string,
  itemName: string,
) => {
  const menuLocator = await openExplorerTreeNodeMenuByName(page, dataTestIdPrefix, itemName);

  // Get the item ID from the node
  const itemId = await getExplorerTreeNodeIdByName(page, dataTestIdPrefix, itemName);

  return menuLocator.getByTestId(
    new RegExp(
      `^${getNodeDataTestIdPrefix(dataTestIdPrefix, itemId)}-context-menu-item-\\d+-\\d+-.*$`,
    ),
  );
};

export const getExplorerTreeNodeMenuItemByName = async (
  page: Page,
  dataTestIdPrefix: string,
  itemName: string,
  menuItemName: string,
): Promise<Locator> => {
  const allMenuItems = await getAllExplorerTreeNodeMenuItems(page, dataTestIdPrefix, itemName);
  const menuItemLocator = allMenuItems.getByText(menuItemName);

  // Check if the menu item is visible
  await expect(menuItemLocator).toBeVisible();

  return menuItemLocator;
};

export const clickExplorerTreeNodeMenuItemByName = async (
  page: Page,
  dataTestIdPrefix: string,
  itemName: string,
  menuItemName: string,
): Promise<void> => {
  // Get the menu item locator
  const menuItemLocator = await getExplorerTreeNodeMenuItemByName(
    page,
    dataTestIdPrefix,
    itemName,
    menuItemName,
  );

  // Click the menu item
  await menuItemLocator.click();
};

/**
 * Check if an explorer item with the given name exists
 */
export async function checkIfExplorerItemExists(
  page: Page,
  explorerTestIdPrefix: string,
  name: string,
): Promise<boolean> {
  const allNodeContainers = getAllExplorerTreeNodes(page, explorerTestIdPrefix);

  // Extract only the text content from the paragraph elements that contain the node names
  const itemTexts = allNodeContainers.locator('p').getByText(name, { exact: true });

  // Check if the item exists
  return (await itemTexts.count()) > 0;
}
