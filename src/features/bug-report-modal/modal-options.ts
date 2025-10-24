import type { ModalSettings } from '@mantine/modals/lib/context';

export const BUG_REPORT_MODAL_OPTIONS: ModalSettings = {
  size: 600,
  styles: {
    body: { paddingBottom: 0 },
    header: { paddingInlineEnd: 16 },
  },
  withCloseButton: true,
  centered: true,
  closeOnClickOutside: false,
  title: 'Report a Bug or Request a Feature',
};
