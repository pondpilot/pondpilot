import { ComponentType } from 'react';

export interface SettingsSectionBadge {
  text: string;
  color: string;
  variant: string;
}

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  component: ComponentType;
  badge?: SettingsSectionBadge;
}

export interface SettingsBlock {
  id: string;
  title: string;
  icon?: ComponentType;
  sections: SettingsSection[];
}

export interface SettingsConfig {
  blocks: SettingsBlock[];
}

export interface NavigationItem {
  id: string;
  label: string;
}
