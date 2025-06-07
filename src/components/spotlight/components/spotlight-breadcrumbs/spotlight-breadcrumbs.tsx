import { Group, Text } from '@mantine/core';
import { Fragment } from 'react/jsx-runtime';

import { SpotlightView } from '@components/spotlight/model';
import { getBreadcrumbText } from '@components/spotlight/utlis';
import { cn } from '@utils/ui/styles';

interface BreadcrumbItem {
  label: string;
  view: SpotlightView;
}

export const SpotlightBreadcrumbs = ({
  currentView,
  onNavigate,
}: {
  currentView: SpotlightView;
  onNavigate: (view: SpotlightView) => void;
}) => {
  const getBreadcrumbPath = (): BreadcrumbItem[] => {
    const path: BreadcrumbItem[] = [{ label: getBreadcrumbText('home'), view: 'home' }];

    if (currentView !== 'home') {
      path.push({ label: getBreadcrumbText(currentView), view: currentView });
    }

    return path;
  };

  return (
    <Group className="p-4 gap-2">
      {getBreadcrumbPath().map((item, index) => (
        <Fragment key={item.view}>
          {index > 0 && <Text c="text-secondary">/</Text>}
          <Text
            className={cn('uppercase', item.view === currentView ? '' : ' cursor-pointer')}
            c={item.view === currentView ? 'text-primary' : 'text-secondary'}
            onClick={() => item.view !== currentView && onNavigate(item.view)}
          >
            {item.label}
          </Text>
        </Fragment>
      ))}
    </Group>
  );
};
