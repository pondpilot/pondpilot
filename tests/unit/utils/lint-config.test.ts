import { describe, it, expect } from '@jest/globals';
import type { Issue } from '@pondpilot/flowscope-core';
import type { EditorPreferences } from '@store/editor-preferences';
import {
  buildLintConfig,
  collectAllFixEdits,
  getFixableIssues,
  isLintIssue,
  shouldDisplayLintIssue,
} from '@utils/lint-config';

const makePrefs = (overrides: Partial<EditorPreferences> = {}): EditorPreferences => ({
  formatOnRun: false,
  fontSize: 0.875,
  fontWeight: 'regular',
  minimap: false,
  lintEnabled: true,
  lintSeverityFilter: 'all',
  lintDisabledRules: ['LINT_AM_004'],
  ...overrides,
});

describe('buildLintConfig', () => {
  it('returns enabled config with default disabled rules', () => {
    const config = buildLintConfig(makePrefs());
    expect(config).toEqual({ enabled: true, disabledRules: ['LINT_AM_004'] });
  });

  it('returns enabled config with no disabled rules when list is empty', () => {
    const config = buildLintConfig(makePrefs({ lintDisabledRules: [] }));
    expect(config).toEqual({ enabled: true, disabledRules: undefined });
  });

  it('returns disabled config when linting is off', () => {
    const config = buildLintConfig(makePrefs({ lintEnabled: false }));
    expect(config).toEqual({ enabled: false });
  });

  it('includes disabled rules when present', () => {
    const config = buildLintConfig(
      makePrefs({ lintDisabledRules: ['LINT_AM_004', 'LINT_AL_001'] }),
    );
    expect(config).toEqual({
      enabled: true,
      disabledRules: ['LINT_AM_004', 'LINT_AL_001'],
    });
  });
});

describe('isLintIssue', () => {
  it('returns true for codes starting with LINT_', () => {
    expect(isLintIssue('LINT_AM_004')).toBe(true);
    expect(isLintIssue('LINT_AL_001')).toBe(true);
  });

  it('returns false for non-lint codes', () => {
    expect(isLintIssue('PARSE_ERROR')).toBe(false);
    expect(isLintIssue('UNKNOWN_TABLE')).toBe(false);
    expect(isLintIssue('')).toBe(false);
  });
});

describe('shouldDisplayLintIssue', () => {
  describe('filter: errors', () => {
    it('shows error-level issues', () => {
      expect(shouldDisplayLintIssue('error', 'errors')).toBe(true);
    });
    it('hides warning-level issues', () => {
      expect(shouldDisplayLintIssue('warning', 'errors')).toBe(false);
    });
    it('hides info-level issues', () => {
      expect(shouldDisplayLintIssue('info', 'errors')).toBe(false);
    });
  });

  describe('filter: errors-warnings', () => {
    it('shows error-level issues', () => {
      expect(shouldDisplayLintIssue('error', 'errors-warnings')).toBe(true);
    });
    it('shows warning-level issues', () => {
      expect(shouldDisplayLintIssue('warning', 'errors-warnings')).toBe(true);
    });
    it('hides info-level issues', () => {
      expect(shouldDisplayLintIssue('info', 'errors-warnings')).toBe(false);
    });
  });

  describe('filter: all', () => {
    it('shows error-level issues', () => {
      expect(shouldDisplayLintIssue('error', 'all')).toBe(true);
    });
    it('shows warning-level issues', () => {
      expect(shouldDisplayLintIssue('warning', 'all')).toBe(true);
    });
    it('shows info-level issues', () => {
      expect(shouldDisplayLintIssue('info', 'all')).toBe(true);
    });
  });
});

const makeIssue = (overrides: Partial<Issue> & Pick<Issue, 'code'>): Issue => ({
  severity: 'warning',
  message: 'test message',
  span: { start: 0, end: 10 },
  ...overrides,
});

describe('getFixableIssues', () => {
  const fixableLint = makeIssue({
    code: 'LINT_AL_001',
    span: { start: 5, end: 15 },
    autofix: {
      applicability: 'safe',
      edits: [{ span: { start: 5, end: 15 }, replacement: 'FIX' }],
    },
  });

  const unsafeLint = makeIssue({
    code: 'LINT_AM_008',
    span: { start: 5, end: 15 },
    autofix: {
      applicability: 'unsafe',
      edits: [{ span: { start: 5, end: 15 }, replacement: 'FIX' }],
    },
  });

  const displayOnlyLint = makeIssue({
    code: 'LINT_CV_001',
    span: { start: 5, end: 15 },
    autofix: {
      applicability: 'displayOnly',
      edits: [{ span: { start: 5, end: 15 }, replacement: 'FIX' }],
    },
  });

  const noAutofixLint = makeIssue({
    code: 'LINT_AL_002',
    span: { start: 5, end: 15 },
  });

  const nonLintIssue = makeIssue({
    code: 'PARSE_ERROR',
    span: { start: 5, end: 15 },
    autofix: {
      applicability: 'safe',
      edits: [{ span: { start: 5, end: 15 }, replacement: 'FIX' }],
    },
  });

  it('returns fixable lint issues overlapping the marker span', () => {
    const issues = [fixableLint, noAutofixLint, nonLintIssue];
    const result = getFixableIssues(issues, { start: 0, end: 10 });
    expect(result).toEqual([fixableLint]);
  });

  it('includes unsafe applicability issues', () => {
    const issues = [fixableLint, unsafeLint];
    const result = getFixableIssues(issues, { start: 0, end: 20 });
    expect(result).toEqual([fixableLint, unsafeLint]);
  });

  it('excludes displayOnly applicability', () => {
    const issues = [fixableLint, displayOnlyLint];
    const result = getFixableIssues(issues, { start: 0, end: 20 });
    expect(result).toEqual([fixableLint]);
  });

  it('excludes issues without autofix', () => {
    const result = getFixableIssues([noAutofixLint], { start: 0, end: 20 });
    expect(result).toEqual([]);
  });

  it('excludes non-lint issues', () => {
    const result = getFixableIssues([nonLintIssue], { start: 0, end: 20 });
    expect(result).toEqual([]);
  });

  it('excludes issues outside the marker span', () => {
    const result = getFixableIssues([fixableLint], { start: 20, end: 30 });
    expect(result).toEqual([]);
  });

  it('returns empty array for issues without span', () => {
    const noSpan = makeIssue({
      code: 'LINT_AL_001',
      span: undefined,
      autofix: { applicability: 'safe', edits: [{ span: { start: 0, end: 5 }, replacement: 'X' }] },
    });
    const result = getFixableIssues([noSpan], { start: 0, end: 20 });
    expect(result).toEqual([]);
  });
});

describe('collectAllFixEdits', () => {
  it('gathers edits from all fixable lint issues', () => {
    const issues: Issue[] = [
      makeIssue({
        code: 'LINT_AL_001',
        autofix: {
          applicability: 'safe',
          edits: [{ span: { start: 0, end: 6 }, replacement: 'SELECT' }],
        },
      }),
      makeIssue({
        code: 'LINT_AM_008',
        autofix: {
          applicability: 'unsafe',
          edits: [{ span: { start: 20, end: 24 }, replacement: 'FROM' }],
        },
      }),
    ];
    const edits = collectAllFixEdits(issues);
    expect(edits).toEqual([
      { span: { start: 0, end: 6 }, replacement: 'SELECT' },
      { span: { start: 20, end: 24 }, replacement: 'FROM' },
    ]);
  });

  it('excludes displayOnly and non-lint issues', () => {
    const issues: Issue[] = [
      makeIssue({
        code: 'LINT_CV_001',
        autofix: {
          applicability: 'displayOnly',
          edits: [{ span: { start: 0, end: 5 }, replacement: 'X' }],
        },
      }),
      makeIssue({
        code: 'PARSE_ERROR',
        autofix: {
          applicability: 'safe',
          edits: [{ span: { start: 0, end: 5 }, replacement: 'Y' }],
        },
      }),
      makeIssue({ code: 'LINT_AL_002' }),
    ];
    const edits = collectAllFixEdits(issues);
    expect(edits).toEqual([]);
  });

  it('returns empty array when no issues are provided', () => {
    expect(collectAllFixEdits([])).toEqual([]);
  });
});
