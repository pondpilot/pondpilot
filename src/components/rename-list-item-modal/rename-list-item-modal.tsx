import { Modal, TextInput, Group, Button } from '@mantine/core';
import React from 'react';

interface RenameListItemModalProps {
  opened: boolean;
  onClose: () => void;
  inputValue: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  handleRenameSubmit: () => void;
  handleRenameCancel: () => void;
  textInputError?: string;
}

export const RenameListItemModal = ({
  opened,
  onClose,
  inputValue,
  onChange,
  handleRenameSubmit,
  handleRenameCancel,
  textInputError,
}: RenameListItemModalProps) => (
  <Modal
    opened={opened}
    keepMounted={false}
    onClose={onClose}
    title="Change name"
    centered
    classNames={{
      title: 'text-sm',
      content: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
      header: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
    }}
  >
    <TextInput
      value={inputValue}
      onChange={onChange}
      placeholder="Enter new name"
      error={textInputError}
      onKeyDown={(event) => event.key === 'Enter' && !textInputError && handleRenameSubmit()}
    />
    <Group justify="end" mt="md">
      <Button variant="default" onClick={handleRenameCancel} className="px-4">
        Cancel
      </Button>
      <Button
        disabled={!!textInputError}
        color="cyan"
        onClick={handleRenameSubmit}
        className="px-4"
      >
        Save
      </Button>
    </Group>
  </Modal>
);
