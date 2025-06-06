import { getNodeDataTestIdPrefix } from '@components/explorer-tree/utils/node-test-id';
import { expect, Locator, Page } from '@playwright/test';

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

  // Find root nodes by checking their test ID structure
  // Child nodes have IDs that contain their parent's ID followed by a dot and the child name
  const rootNodes = await allNodes.evaluateAll((nodes) => {
    const rootNodeElements: Element[] = [];

    nodes.forEach((node) => {
      const nodeTestId = node.getAttribute('data-testid') || '';

      // Extract the ID part from the test ID (between "tree-node-" and "-container")
      const match = nodeTestId.match(/tree-node-(.+)-container$/);
      if (!match) return;

      const nodeId = match[1];

      // A root node's ID should not contain a dot followed by more characters
      // Child nodes have IDs like "parent-id.child-name"
      // We need to check if this ID is not a sub-ID of another node in our list
      let isChildOfAnotherNode = false;

      // Check if this node's ID indicates it's a child
      // Child nodes have IDs that contain a dot after the parent ID
      // This works for both UUID-based IDs (databases) and other ID formats
      // We look for any ID that contains a dot not at the beginning
      if (nodeId.includes('.') && !nodeId.startsWith('.')) {
        // Check if the part before the dot could be a valid parent ID
        // by verifying it exists as another node's ID in our list
        const potentialParentId = nodeId.substring(0, nodeId.indexOf('.'));

        // Check if any other node has this exact ID (without the child part)
        for (const otherNode of nodes) {
          const otherTestId = otherNode.getAttribute('data-testid') || '';
          const otherMatch = otherTestId.match(/tree-node-(.+)-container$/);
          if (otherMatch && otherMatch[1] === potentialParentId) {
            isChildOfAnotherNode = true;
            break;
          }
        }
      }

      // If not a child node, it's a root node
      if (!isChildOfAnotherNode) {
        rootNodeElements.push(node);
      }
    });

    return rootNodeElements.map((el) => el.textContent?.trim() || '');
  });

  // Check if the number of root items matches
  expect(rootNodes).toHaveLength(expected.length);

  // Check if each item matches the expected names
  for (let i = 0; i < expected.length; i += 1) {
    expect(rootNodes[i]).toBe(expected[i]);
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

  // First, clear any existing selection to start fresh
  // This ensures we're selecting exactly the nodes specified
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // Select the first node normally (without Ctrl/Cmd)
  if (indices.length > 0) {
    const firstNode = await clickNodeByIndex(page, dataTestIdPrefix, indices[0]);
    selectedNodes.push(firstNode);
    await page.waitForTimeout(100);
  }

  // Then Ctrl/Cmd+Click the remaining nodes
  if (indices.length > 1) {
    await page.keyboard.down('ControlOrMeta');

    for (let i = 1; i < indices.length; i += 1) {
      const node = await clickNodeByIndex(page, dataTestIdPrefix, indices[i]);
      selectedNodes.push(node);
      // Add a small delay between clicks to ensure they register
      await page.waitForTimeout(100);
    }

    await page.keyboard.up('ControlOrMeta');
  }

  // Wait a moment for selection to settle
  await page.waitForTimeout(200);

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

  // Log actual vs expected for debugging
  if (!expectedSelection) {
    // eslint-disable-next-line no-console
    console.log('Selection mismatch:');
    // eslint-disable-next-line no-console
    console.log('Expected indices:', expectedSelectedIndices);
    // eslint-disable-next-line no-console
    console.log(
      'Actual selection:',
      actualSelection.map((sel, idx) => (sel ? idx : -1)).filter((idx) => idx >= 0),
    );
  }

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

  // First, ensure the node is selected
  await oldNode.click();
  await page.waitForTimeout(100);

  // Double-click to initiate rename
  await oldNode.dblclick();

  // Wait a moment for the rename input to appear
  await page.waitForTimeout(500);

  // Find and fill the rename input
  const renameInput = page.getByTestId(
    `${getNodeDataTestIdPrefix(dataTestIdPrefix, oldItemId)}-rename-input`,
  );

  // If double-click didn't work, try via context menu
  const isVisible = await renameInput.isVisible().catch(() => false);
  if (!isVisible) {
    // Try context menu approach
    await oldNode.click({ button: 'right' });
    await page.waitForTimeout(300);

    const renameMenuItem = page.getByRole('menuitem', { name: 'Rename' });
    // Check if the rename menu item is enabled
    const isDisabled = await renameMenuItem.getAttribute('data-disabled');
    if (isDisabled === 'true') {
      throw new Error(`Rename is disabled for ${oldName}. Make sure the item supports renaming.`);
    }

    await renameMenuItem.click();
    await page.waitForTimeout(500);
  }

  await expect(renameInput).toBeVisible({ timeout: 10000 });

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
