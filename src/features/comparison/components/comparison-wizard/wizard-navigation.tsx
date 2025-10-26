import { Button, Group } from '@mantine/core';

interface WizardNavigationProps {
  onNext?: () => void;
  onBack?: () => void;
  onCancel?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  showNext?: boolean;
  showBack?: boolean;
}

export const WizardNavigation = ({
  onNext,
  onBack,
  nextLabel = 'Next',
  backLabel = 'Back',
  nextDisabled = false,
  showNext = true,
  showBack = true,
}: WizardNavigationProps) => {
  return (
    <Group
      justify="space-between"
      className="pt-4 border-t border-borderPrimary-light dark:border-borderPrimary-dark"
    >
      <div>
        {showBack && onBack && (
          <Button variant="subtle" onClick={onBack}>
            {backLabel}
          </Button>
        )}
      </div>
      <div>
        {showNext && onNext && (
          <Button onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
          </Button>
        )}
      </div>
    </Group>
  );
};
