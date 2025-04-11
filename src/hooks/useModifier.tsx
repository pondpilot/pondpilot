import { useOs } from '@mantine/hooks';
import { IconCommand } from '@tabler/icons-react';
import { MdKeyboardOptionKey } from 'react-icons/md';
import { CtrlIcon } from '@components/icons/ctrl-icon';
import { AltIcon } from '@components/icons/alt-icon';
import { CtrlArrowIcon } from '@components/icons/ctrl-arrow-icon';

export const useModifier = () => {
  const os = useOs();
  const isMacOS = os === 'macos';
  const command = isMacOS ? <IconCommand stroke={1.5} size={20} /> : <CtrlIcon size={20} />;
  const option = isMacOS ? <MdKeyboardOptionKey size={18} stroke="1.5" /> : <AltIcon size={20} />;
  const control = isMacOS ? <CtrlArrowIcon size={20} /> : <CtrlIcon size={20} />;
  return {
    command,
    option,
    control,
  };
};
