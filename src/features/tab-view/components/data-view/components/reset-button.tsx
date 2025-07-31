import { Button } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

export const DataViewRestartReadButton = ({
  onClick,
  buttonText = 'Restart',
}: {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  buttonText?: string;
}) => (
  <Button
    onClick={onClick}
    data-testid={setDataTestId('data-view-reset-button')}
    color="background-accent"
    className="rounded-full px-3"
  >
    {buttonText}
  </Button>
);
