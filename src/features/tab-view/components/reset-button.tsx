import { Button } from '@mantine/core';

import { setDataTestId } from '@utils/test-id';

export const DataViewRestartReadButton = ({
  onClick,
}: {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) => (
  <Button
    onClick={onClick}
    data-testid={setDataTestId('data-view-reset-button')}
    color="background-accent"
    className="rounded-full px-3"
  >
    Restart
  </Button>
);
