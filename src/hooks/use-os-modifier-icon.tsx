import { useOs } from '@mantine/hooks';
import { IconAlt, IconCommand } from '@tabler/icons-react';
import { MdKeyboardOptionKey } from 'react-icons/md';

export const useOsModifierIcon = () => {
  const os = useOs();
  const isMacOS = os === 'macos';
  const command = isMacOS ? <IconCommand stroke={1.5} size={20} /> : 'Ctrl';
  const option = isMacOS ? (
    <MdKeyboardOptionKey size={18} stroke="1.5" />
  ) : (
    <IconAlt stroke={1.5} size={20} />
  );
  return {
    command,
    option,
  };
};
