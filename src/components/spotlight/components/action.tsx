import { HotkeyPill } from '@components/hotkey-pill';
import { Group, Text } from '@mantine/core';
import { Spotlight } from '@mantine/spotlight';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

import { Action } from '../model';

export const renderActions = (actions: Action[]) =>
  actions.map((action) => (
    <Spotlight.Action
      data-testid={setDataTestId(`spotlight-action-${action.id}`)}
      disabled={action.disabled}
      key={action.id}
      onClick={action.handler}
    >
      <Group justify="space-between" className={cn('w-full', action.disabled && 'opacity-50')}>
        <Group className="gap-2 flex-1 min-w-0">
          {action.icon ? <div>{action.icon}</div> : undefined}
          <Text c="text-secondary" truncate="end" className="flex-1">
            {action.label}
          </Text>
        </Group>
        <Group className="gap-2 flex-shrink-0">
          {action.description ? (
            <Text
              c="dimmed"
              size="xs"
              className="opacity-60 max-w-48"
              truncate="end"
              title={action.description}
            >
              {action.description}
            </Text>
          ) : undefined}
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
