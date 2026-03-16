/**
 * Lint configuration utilities for FlowScope SQL linting.
 *
 * Converts editor preferences into FlowScope LintConfig format,
 * and provides helpers for identifying and filtering lint issues.
 */

import type { Issue, IssuePatchEdit, LintConfig, Severity, Span } from '@pondpilot/flowscope-core';
import type { EditorPreferences, LintSeverityFilter } from '@store/editor-preferences';

const LINT_CODE_PREFIX = 'LINT_';

type LintConfigInput = Pick<EditorPreferences, 'lintEnabled' | 'lintDisabledRules'>;

/**
 * Build a FlowScope LintConfig from editor preferences.
 *
 * Returns `{ enabled: false }` when linting is off,
 * otherwise `{ enabled: true, disabledRules }`.
 */
export function buildLintConfig(prefs: LintConfigInput): LintConfig {
  if (!prefs.lintEnabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    disabledRules: prefs.lintDisabledRules.length > 0 ? prefs.lintDisabledRules : undefined,
  };
}

/**
 * Check if an issue code is a lint issue (starts with "LINT_").
 */
export function isLintIssue(code: string): boolean {
  return code.startsWith(LINT_CODE_PREFIX);
}

/**
 * Determine whether a lint issue should be displayed given the severity filter.
 *
 * - 'errors': only show error-level lint issues
 * - 'errors-warnings': show errors and warnings
 * - 'all': show everything (errors, warnings, info)
 */
export function shouldDisplayLintIssue(severity: Severity, filter: LintSeverityFilter): boolean {
  switch (filter) {
    case 'errors':
      return severity === 'error';
    case 'errors-warnings':
      return severity === 'error' || severity === 'warning';
    case 'all':
      return true;
    default:
      return true;
  }
}

/**
 * Check whether two spans overlap (share at least one character position).
 */
function spansOverlap(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Check whether an issue has an applicable autofix (not displayOnly).
 */
function hasApplicableAutofix(issue: Issue): boolean {
  return !!issue.autofix && issue.autofix.applicability !== 'displayOnly';
}

/**
 * Return lint issues that overlap a given span and have an applicable autofix.
 *
 * Used by the code action provider to find fixable issues at a marker range.
 */
export function getFixableIssues(issues: Issue[], markerSpan: Span): Issue[] {
  return issues.filter(
    (issue) =>
      isLintIssue(issue.code) &&
      hasApplicableAutofix(issue) &&
      issue.span != null &&
      spansOverlap(issue.span, markerSpan),
  );
}

/**
 * Collect all patch edits from every fixable lint issue.
 *
 * Returns a flat array of edits suitable for passing to `applyEdits()`.
 */
export function collectAllFixEdits(issues: Issue[]): IssuePatchEdit[] {
  return issues
    .filter((issue) => isLintIssue(issue.code) && hasApplicableAutofix(issue))
    .flatMap((issue) => issue.autofix!.edits);
}
