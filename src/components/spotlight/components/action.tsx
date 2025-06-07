import { Group, Text } from '@mantine/core';
import { Spotlight } from '@mantine/spotlight';

import { HotkeyPill } from '@components/hotkey-pill';
import { Action } from '@components/spotlight/model';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

export const renderActions = (actions: Action[]) =>
  actions.map((action) => (
    <Spotlight.Action
      data-testid={setDataTestId(`spotlight-action-${action.id}`)}
      disabled={action.disabled}
      key={action.id}
      onClick={action.handler}
    >
      <Group justify="space-between" className={cn('w-full', action.disabled && 'opacity-50')}>
        <Group className="gap-2">
          {action.icon ? <div>{action.icon}</div> : undefined}
          <Text c="text-secondary" truncate="end" maw={250}>
            {action.label}
          </Text>
        </Group>
        <Group>
          {action.hotkey ? <HotkeyPill variant="secondary" value={action.hotkey} /> : undefined}
        </Group>
      </Group>
    </Spotlight.Action>
  ));

export const renderActionsGroup = (actions: Action[], label: string) => {
  if (!actions.length) {
    return <Spotlight.Empty>Nothing found...</Spotlight.Empty>;
  }
  return (
    <Spotlight.ActionsGroup label={label} className="text-red-200">
      {renderActions(actions)}
    </Spotlight.ActionsGroup>
  );
};
