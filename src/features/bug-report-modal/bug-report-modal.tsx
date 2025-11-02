import { showError, showSuccess } from '@components/app-notifications';
import type { FeatureContextType } from '@features/feature-context';
import {
  Stack,
  TextInput,
  Textarea,
  Select,
  Checkbox,
  Button,
  Group,
  Text,
  Anchor,
  Alert,
} from '@mantine/core';
import { APP_OPEN_ISSUES_URL } from '@models/app-urls';
import type { BugReportFormData, BugReportCategory } from '@models/bug-report';
import { BUG_REPORT_CATEGORY_OPTIONS, BUG_REPORT_CATEGORY_META } from '@models/bug-report';
import { sendBugReportToSlack, isSlackIntegrationConfigured } from '@services/slack-bug-report';
import { IconAlertCircle } from '@tabler/icons-react';
import { captureBugReportContext } from '@utils/bug-report-context';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

interface BugReportModalProps {
  onClose: () => void;
  featureContext: FeatureContextType;
}

const CATEGORY_OPTIONS = BUG_REPORT_CATEGORY_OPTIONS.map((opt) => ({
  value: opt.value,
  label: `${BUG_REPORT_CATEGORY_META[opt.value].emoji} ${opt.label}`,
}));

export function BugReportModal({ onClose, featureContext }: BugReportModalProps) {
  const [formData, setFormData] = useState<BugReportFormData>({
    category: 'ui-bug',
    description: '',
    email: '',
    includeContext: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isConfigured = isSlackIntegrationConfigured();

  const updateField = <K extends keyof BugReportFormData>(
    field: K,
    value: BugReportFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length < 10) {
      newErrors.description = 'Please provide a more detailed description (at least 10 characters)';
    }

    if (formData.email && !isValidEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    if (!isConfigured) {
      showError({
        title: 'Bug reporting not configured',
        message: 'Bug report proxy is not configured. Please check your environment settings.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const context = formData.includeContext ? captureBugReportContext(featureContext) : undefined;

      const result = await sendBugReportToSlack({
        formData,
        context,
      });

      if (result.success) {
        showSuccess({
          title: 'Bug report submitted',
          message: 'Thank you for your feedback! Our team will review your report.',
        });
        onClose();
      } else {
        throw new Error(result.error || 'Failed to submit bug report');
      }
    } catch (error) {
      console.error('Error submitting bug report:', error);
      showError({
        title: 'Failed to submit bug report',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Stack gap="md" data-testid={setDataTestId('bug-report-modal')}>
      {!isConfigured && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          data-testid={setDataTestId('bug-report-not-configured-alert')}
        >
          Bug reporting is not configured. Please add VITE_BUG_REPORT_PROXY_URL to your environment
          variables.
        </Alert>
      )}

      <Select
        label="Category"
        placeholder="Select a category"
        data={CATEGORY_OPTIONS}
        value={formData.category}
        onChange={(value) => updateField('category', value as BugReportCategory)}
        data-testid={setDataTestId('bug-report-category-select')}
        required
      />

      <Textarea
        label="Description"
        placeholder="Describe the issue or feature request in detail"
        value={formData.description}
        onChange={(e) => updateField('description', e.currentTarget.value)}
        error={errors.description}
        data-testid={setDataTestId('bug-report-description-input')}
        minRows={6}
        autosize
        required
      />

      <TextInput
        label="Email (optional)"
        placeholder="your.email@example.com"
        value={formData.email}
        onChange={(e) => updateField('email', e.currentTarget.value)}
        error={errors.email}
        data-testid={setDataTestId('bug-report-email-input')}
        description="If you'd like us to follow up with you"
      />

      <Checkbox
        label="Include technical context"
        checked={formData.includeContext}
        onChange={(e) => updateField('includeContext', e.currentTarget.checked)}
        data-testid={setDataTestId('bug-report-include-context-checkbox')}
        description="Browser info, app version, and error details (no personal data)"
      />

      <Text size="xs" c="dimmed">
        For issues with images or videos, please{' '}
        <Anchor
          href={APP_OPEN_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          size="xs"
          c="text-accent"
        >
          create a GitHub issue
        </Anchor>
        .
      </Text>

      <Group justify="flex-end" mt="md">
        <Button
          variant="transparent"
          onClick={onClose}
          disabled={isSubmitting}
          data-testid={setDataTestId('bug-report-cancel-button')}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          loading={isSubmitting}
          data-testid={setDataTestId('bug-report-submit-button')}
        >
          Submit Bug Report
        </Button>
      </Group>
    </Stack>
  );
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
