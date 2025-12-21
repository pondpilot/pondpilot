export type SpotlightView = 'home' | 'dataSources' | 'scripts';

export interface Action {
  id: string;
  label: string;
  handler: () => void;
  icon?: React.ReactNode;
  hotkey?: Array<string | React.ReactNode>;
  disabled?: boolean;
  description?: string;
  metadata?: {
    lastUsed?: number;
  };
}
