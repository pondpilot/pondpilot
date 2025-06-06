import { RemoteDB } from '@models/data-source';
import { IconLoader, IconCircleCheck, IconAlertCircle, IconCircleOff } from '@tabler/icons-react';

interface ConnectionStateIconProps {
  state: RemoteDB['connectionState'];
  error?: string;
}

/**
 * Visual indicator component for remote database connection states
 *
 * Displays appropriate icons and colors for different connection states:
 * - Connected: Green check circle
 * - Connecting: Animated blue spinner
 * - Disconnected: Gray circle
 * - Error: Red alert circle with hover tooltip showing error details
 *
 * Used in the data explorer to provide immediate visual feedback about
 * remote database connectivity status.
 */
export const ConnectionStateIcon = ({ state, error }: ConnectionStateIconProps) => {
  switch (state) {
    case 'connected':
      return <IconCircleCheck size={16} className="text-green-500" />;
    case 'connecting':
      return <IconLoader size={16} className="animate-spin text-blue-500" />;
    case 'disconnected':
      return <IconCircleOff size={16} className="text-gray-400" />;
    case 'error':
      return (
        <div className="flex items-center" title={error}>
          <IconAlertCircle size={16} className="text-red-500" />
        </div>
      );
  }
};
