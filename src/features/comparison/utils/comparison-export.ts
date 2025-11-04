import { ComparisonConfig, SchemaComparisonResult } from '@models/comparison';

import type { ComparisonRowStatus } from './theme';
import {
  COMPARISON_STATUS_DESCRIPTION,
  COMPARISON_STATUS_LABEL,
  COMPARISON_STATUS_ORDER,
} from '../constants/statuses';
import type { ComparisonResultRow } from '../hooks/use-comparison-results';

const PONDPILOT_LOGO = `
  <svg width="48" height="40" viewBox="0 0 51 42" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M13.5 42C6.04416 42 3.25905e-07 35.9558 0 28.5C-3.25905e-07 21.0442 6.04415 15 13.5 15H25.5C32.9558 15 39 21.0442 39 28.5C39 35.9558 32.9558 42 25.5 42H13.5Z" fill="#212328" fill-opacity="0.32"/>
    <path d="M31.5 27C24.0442 27 18 20.9558 18 13.5C18 6.04416 24.0442 3.25905e-07 31.5 0C38.9558 -3.25905e-07 45 6.04416 45 13.5C45 20.9558 38.9558 27 31.5 27Z" fill="#4CAE4F"/>
    <path d="M43.5 15C44.3284 15 45 14.3284 45 13.5C45 12.6716 44.3284 12 43.5 12C42.6716 12 42 12.6716 42 13.5C42 14.3284 42.6716 15 43.5 15Z" fill="#1B255A"/>
    <path d="M31.5 15C32.3284 15 33 14.3284 33 13.5C33 12.6716 32.3284 12 31.5 12C30.6716 12 30 12.6716 30 13.5C30 14.3284 30.6716 15 31.5 15Z" fill="#1B255A"/>
    <path d="M37.5 24C35.0147 24 33 21.9853 33 19.5C33 17.0147 35.0147 15 37.5 15L46.5 15C48.9853 15 51 17.0147 51 19.5C51 21.9853 48.9853 24 46.5 24H37.5Z" fill="#F4A462"/>
    <path d="M30.8908 28.971C30.7628 30.9568 29.94 32.9063 28.4223 34.424C25.1074 37.7388 19.733 37.7388 16.4181 34.424L10.418 28.4238L16.4179 22.4239C19.7327 19.1091 25.1072 19.1091 28.422 22.4239C30.2181 24.22 31.0411 26.6208 30.8908 28.971Z" fill="#212328" fill-opacity="0.32"/>
  </svg>
`;

const REPORT_CSS = `
    :root {
      color-scheme: light;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #eef1f6;
      color: #1f2430;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 32px;
      background: #eef1f6;
    }
    .report {
      max-width: 1200px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 18px;
      padding: 32px 36px 40px;
      box-shadow: 0 24px 60px rgba(26, 33, 61, 0.08);
    }
    .report-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px 24px;
      margin-bottom: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 200px;
    }
    .brand-link {
      text-decoration: none;
      color: inherit;
    }
    .brand-link:hover .brand-name {
      color: #2b3a8c;
    }
    .brand-link:focus-visible {
      outline: 2px solid rgba(71, 96, 235, 0.6);
      outline-offset: 4px;
      border-radius: 12px;
    }
    .brand-icon {
      width: 48px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .brand-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .brand-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #1f2430;
    }
    .brand-tagline {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #7a82a5;
    }
    .heading {
      flex: 1 1 320px;
    }
    .heading h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      color: #111827;
    }
    .heading-link {
      color: inherit;
      text-decoration: none;
    }
    .heading-link:hover {
      text-decoration: underline;
    }
    .heading-link:focus-visible {
      outline: 2px solid rgba(71, 96, 235, 0.6);
      outline-offset: 4px;
      border-radius: 6px;
    }
    .heading p {
      margin: 6px 0 0;
      color: #505872;
      font-size: 14px;
    }
    .section {
      margin-top: 32px;
    }
    h2 {
      margin: 32px 0 14px;
      font-size: 18px;
      font-weight: 600;
      color: #1f2430;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h3 {
      margin: 24px 0 10px;
      font-size: 15px;
      font-weight: 600;
      color: #1f2430;
    }
    p {
      margin: 0 0 12px;
      color: #414964;
      line-height: 1.6;
    }
    .meta-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px 20px;
      margin: 24px 0 8px;
    }
    .meta-list-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .meta-term {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #6f7791;
      font-weight: 600;
    }
    .meta-value {
      font-size: 13px;
      color: #1f2430;
      line-height: 1.5;
    }
    .value {
      color: inherit;
    }
    .value-strong {
      font-weight: 600;
    }
    .value-empty {
      color: #8c93a9;
      font-style: italic;
    }
    .value-null {
      color: #ca3060;
      font-style: italic;
    }
    .status-chip-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .status-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .status-chip.status-added {
      background: rgba(38, 166, 91, 0.12);
      color: #128455;
    }
    .status-chip.status-removed {
      background: rgba(214, 60, 80, 0.12);
      color: #c1324e;
    }
    .status-chip.status-modified {
      background: rgba(243, 162, 50, 0.16);
      color: #c5740e;
    }
    .status-chip.status-same {
      background: rgba(102, 117, 127, 0.12);
      color: #4d5b63;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.03em;
    }
    .status-pill.status-added {
      background: rgba(38, 166, 91, 0.12);
      color: #128455;
    }
    .status-pill.status-removed {
      background: rgba(214, 60, 80, 0.12);
      color: #c1324e;
    }
    .status-pill.status-modified {
      background: rgba(243, 162, 50, 0.16);
      color: #c5740e;
    }
    .status-pill.status-same {
      background: rgba(102, 117, 127, 0.12);
      color: #4d5b63;
    }
    .key-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 10px;
      background: rgba(71, 96, 235, 0.12);
      color: #2b3a8c;
      font-weight: 600;
      font-size: 12px;
      margin: 2px 6px 0 0;
      letter-spacing: 0.02em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
    }
    thead {
      background: linear-gradient(90deg, rgba(71, 96, 235, 0.12), rgba(23, 201, 100, 0.12));
      color: #1f2430;
    }
    th,
    td {
      padding: 10px 12px;
      border: 1px solid #e4e7f0;
      vertical-align: top;
    }
    th {
      text-align: left;
      font-weight: 600;
      letter-spacing: 0.02em;
      font-size: 12px;
      text-transform: uppercase;
    }
    td.numeric,
    th.numeric {
      text-align: right;
      white-space: nowrap;
    }
    tr.status-added td {
      background: rgba(38, 166, 91, 0.06);
    }
    tr.status-removed td {
      background: rgba(214, 60, 80, 0.06);
    }
    tr.status-modified td {
      background: rgba(243, 162, 50, 0.08);
    }
    tr.status-same td {
      background: rgba(96, 125, 139, 0.04);
    }
    .diff-cell {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .diff-label {
      display: inline-block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6c738b;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .diff-status {
      align-self: flex-start;
      margin-top: 2px;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .diff-status.status-added {
      background: rgba(38, 166, 91, 0.12);
      color: #128455;
    }
    .diff-status.status-removed {
      background: rgba(214, 60, 80, 0.12);
      color: #c1324e;
    }
    .diff-status.status-modified {
      background: rgba(243, 162, 50, 0.16);
      color: #c5740e;
    }
    .diff-status.status-same {
      background: rgba(102, 117, 127, 0.12);
      color: #4d5b63;
    }
    .diff-pair {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .code-block {
      margin: 6px 0 0;
      padding: 10px 12px;
      background: #101322;
      color: #f4f7ff;
      border-radius: 10px;
      font-family: 'JetBrains Mono', 'SFMono-Regular', 'Menlo', monospace;
      font-size: 12px;
      line-height: 1.55;
      max-height: 220px;
      overflow: auto;
    }
    .source-query-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .column-filter-list {
      list-style: none;
      padding: 0;
      margin: 12px 0 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .column-filter-list li {
      display: flex;
      gap: 12px;
      font-size: 13px;
      color: #1f2430;
    }
    .filter-term {
      min-width: 140px;
      font-weight: 600;
      color: #4b5472;
    }
    .filter-value {
      flex: 1 1 auto;
    }
    .table-hint {
      font-size: 12px;
      color: #6c738b;
      margin-bottom: 8px;
    }
    .table-scroll {
      border: 1px solid #e4e7f0;
      border-radius: 12px;
      overflow: auto;
      position: relative;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
    }
    .table-scroll table {
      min-width: 100%;
    }
    .table-scroll::-webkit-scrollbar {
      height: 8px;
    }
    .table-scroll::-webkit-scrollbar-thumb {
      background: rgba(122, 132, 164, 0.45);
      border-radius: 999px;
    }
    .table-scroll::-webkit-scrollbar-track {
      background: rgba(229, 232, 241, 0.6);
      border-radius: 999px;
    }
    footer {
      margin-top: 36px;
      font-size: 12px;
      color: #7d859f;
      text-align: center;
    }
  `;

export type ComparisonHtmlReportColumnFilter = {
  label: string;
  value: string;
};

export type ComparisonHtmlReportColumnDiff = {
  key: string;
  label: string;
  total: number;
  added: number;
  removed: number;
  modified: number;
  same: number;
};

export interface ComparisonHtmlReportOptions {
  comparisonName: string;
  tableName: string;
  generatedAt: Date;
  lastRunAt: string | null;
  executionTimeSeconds: number;
  statusTotals: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    same: number;
  };
  totalRowCount: number;
  filteredRowCount: number;
  rowLimit: number;
  activeStatuses: ComparisonRowStatus[];
  keyColumns: string[];
  compareColumns: Array<{
    key: string;
    label: string;
  }>;
  columnDiffs: ComparisonHtmlReportColumnDiff[];
  rows: ComparisonResultRow[];
  config: ComparisonConfig;
  schemaComparison: SchemaComparisonResult;
  columnFilters: ComparisonHtmlReportColumnFilter[];
}

const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '<span class="value value-null">NULL</span>';
  }

  if (value === '') {
    return '<span class="value value-empty">(empty)</span>';
  }

  return `<span class="value">${escapeHtml(value).replace(/\r?\n/g, '<br />')}</span>`;
};

const formatSource = (source: ComparisonConfig['sourceA'] | ComparisonConfig['sourceB']) => {
  if (!source) {
    return '<span class="value value-empty">Not configured</span>';
  }

  if (source.type === 'table') {
    const schemaName = source.schemaName ?? 'main';
    const databaseName = source.databaseName ?? '';
    const qualifiedName = [databaseName, schemaName, source.tableName]
      .filter(Boolean)
      .map(escapeHtml)
      .join('.');
    return `<span class="value value-strong">${qualifiedName}</span>`;
  }

  if (source.type === 'query') {
    const alias = escapeHtml(source.alias || 'Query');
    const sql = escapeHtml(source.sql || '');
    return `
      <div class="source-query-block">
        <div class="value value-strong">${alias}</div>
        <pre class="code-block">${sql}</pre>
      </div>
    `;
  }

  return '<span class="value value-empty">Unknown source</span>';
};

const _formatFilter = (label: string, value: string | null | undefined) => {
  if (!value?.trim()) {
    return `
      <div class="config-row">
        <span class="config-term">${escapeHtml(label)}</span>
        <span class="config-value value-empty">Not set</span>
      </div>
    `;
  }
  return `
    <div class="config-row">
      <span class="config-term">${escapeHtml(label)}</span>
      <span class="config-value">${escapeHtml(value)}</span>
    </div>
  `;
};

const buildSummaryRow = (status: ComparisonRowStatus, count: number, total: number): string => {
  const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
  return `
    <tr>
      <td><span class="status-pill status-${status}">${COMPARISON_STATUS_LABEL[status]}</span></td>
      <td class="numeric">${count.toLocaleString()}</td>
      <td class="numeric">${percentage}%</td>
      <td>${escapeHtml(COMPARISON_STATUS_DESCRIPTION[status])}</td>
    </tr>
  `;
};

const buildColumnSummaryRow = (diff: ComparisonHtmlReportColumnDiff, totalRows: number) => {
  const changed = diff.added + diff.removed + diff.modified;
  const changePercent = diff.total > 0 ? Math.round((changed / diff.total) * 100) : 0;
  const columnCoveragePercent =
    totalRows > 0 ? Math.round((diff.total / totalRows) * 100) : diff.total > 0 ? 100 : 0;

  return `
    <tr>
      <td>${escapeHtml(diff.label)}</td>
      <td class="numeric">${diff.added.toLocaleString()}</td>
      <td class="numeric">${diff.removed.toLocaleString()}</td>
      <td class="numeric">${diff.modified.toLocaleString()}</td>
      <td class="numeric">${diff.same.toLocaleString()}</td>
      <td class="numeric">${changePercent}%</td>
      <td class="numeric">${columnCoveragePercent}%</td>
    </tr>
  `;
};

const buildRowHtml = (
  row: ComparisonResultRow,
  keyColumns: string[],
  compareColumns: Array<{ key: string; label: string }>,
  rowIndex: number,
): string => {
  const status = (row._row_status ?? 'same') as ComparisonRowStatus;

  const keyCells = keyColumns
    .map((column) => {
      const value = row[`_key_${column}`];
      return `<td>${formatCellValue(value)}</td>`;
    })
    .join('');

  const compareCells = compareColumns
    .map(({ key }) => {
      const valueA = row[`${key}_a`];
      const valueB = row[`${key}_b`];
      const columnStatus = (row[`${key}_status`] ?? 'same') as ComparisonRowStatus;
      return `
        <td>
          <div class="diff-cell">
            <div class="diff-pair">
              <span class="diff-label">Source A</span>
              ${formatCellValue(valueA)}
            </div>
            <div class="diff-pair">
              <span class="diff-label">Source B</span>
              ${formatCellValue(valueB)}
            </div>
            <div class="diff-status status-${columnStatus}">${COMPARISON_STATUS_LABEL[columnStatus]}</div>
          </div>
        </td>
      `;
    })
    .join('');

  return `
    <tr class="status-${status}">
      <td class="numeric">${rowIndex + 1}</td>
      <td><span class="status-pill status-${status}">${COMPARISON_STATUS_LABEL[status]}</span></td>
      ${keyCells}
      ${compareCells}
    </tr>
  `;
};

const buildColumnFiltersList = (filters: ComparisonHtmlReportColumnFilter[]): string => {
  if (filters.length === 0) {
    return '<p class="value value-empty">No column filters applied.</p>';
  }

  const items = filters
    .map(
      (filter) => `
        <li>
          <span class="filter-term">${escapeHtml(filter.label)}</span>
          <span class="filter-value">${escapeHtml(filter.value)}</span>
        </li>
      `,
    )
    .join('');

  return `<ul class="column-filter-list">${items}</ul>`;
};

const buildActiveStatusesHtml = (statuses: ComparisonRowStatus[]): string => {
  if (statuses.length === COMPARISON_STATUS_ORDER.length) {
    return '<span class="value">All row statuses</span>';
  }

  if (statuses.length === 0) {
    return '<span class="value value-empty">No statuses selected (no rows displayed)</span>';
  }

  const items = statuses
    .map(
      (status) =>
        `<span class="status-chip status-${status}">${COMPARISON_STATUS_LABEL[status]}</span>`,
    )
    .join('');

  return `<div class="status-chip-row">${items}</div>`;
};

const renderMetaItem = (label: string, value: string) => `
  <div class="meta-list-item">
    <div class="meta-term">${escapeHtml(label)}</div>
    <div class="meta-value">${value}</div>
  </div>
`;

const buildHeaderSection = (comparisonName: string, tableName: string) => `
      <header class="report-header">
        <a class="brand brand-link" href="https://pondpilot.io" target="_blank" rel="noopener noreferrer">
          <div class="brand-icon">${PONDPILOT_LOGO}</div>
          <div class="brand-text">
            <span class="brand-name">PondPilot</span>
            <span class="brand-tagline">Comparison Report</span>
          </div>
        </a>
        <div class="heading">
          <h1><a class="heading-link" href="https://pondpilot.io" target="_blank" rel="noopener noreferrer">${escapeHtml(comparisonName)}</a></h1>
          <p>Snapshot of comparison table <code>${escapeHtml(tableName)}</code>.</p>
        </div>
      </header>`;

const buildMetaSection = (metaListHtml: string) => `
      <section class="section">
        ${metaListHtml}
      </section>`;

const buildStatusSummarySection = (summaryRows: string) => `
      <section class="section">
        <h2>Comparison Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th class="numeric">Rows</th>
              <th class="numeric">Percent</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>
      </section>`;

const buildColumnDiffsSection = (columnDiffsHtml: string) => `
      <section class="section">
        <h2>Column Differences</h2>
        ${columnDiffsHtml}
      </section>`;

const buildColumnFiltersSection = (filtersHtml: string) => `
      <section class="section">
        <h2>Active Column Filters</h2>
        ${filtersHtml}
      </section>`;

const buildRowsSection = (tableHeaders: string, tableRows: string) => `
      <section class="section">
        <h2>Row-Level Results</h2>
        <p class="table-hint">Scroll horizontally to explore every column.</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                ${tableHeaders}
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </section>`;

const buildFooter = () => `
      <footer>
        Report generated via Pondpilot comparison export.
      </footer>`;

/**
 * Builds a standalone HTML document representing a comparison report.
 */
export const generateComparisonHtmlReport = (options: ComparisonHtmlReportOptions): string => {
  const {
    comparisonName,
    tableName,
    generatedAt,
    lastRunAt,
    executionTimeSeconds,
    statusTotals,
    totalRowCount,
    filteredRowCount,
    rowLimit,
    activeStatuses,
    keyColumns,
    compareColumns,
    columnDiffs,
    rows,
    config,
    schemaComparison: _schemaComparison,
    columnFilters,
  } = options;

  const generatedAtText = generatedAt.toLocaleString();
  const lastRunText = lastRunAt ? new Date(lastRunAt).toLocaleString() : 'Never';
  const truncated =
    totalRowCount > filteredRowCount && filteredRowCount >= rowLimit && rows.length >= rowLimit;

  const statusSummaryRows = COMPARISON_STATUS_ORDER.map((status) =>
    buildSummaryRow(status, statusTotals[status], statusTotals.total),
  ).join('');

  const rowsInReportText = `${rows.length.toLocaleString()}${truncated ? ` (limited to first ${rowLimit.toLocaleString()} rows)` : ''}`;

  const joinKeysHtml =
    keyColumns.length > 0
      ? keyColumns.map((key) => `<span class="key-chip">${escapeHtml(key)}</span>`).join('')
      : '<span class="value value-empty">No join keys selected</span>';

  const metaItems = [
    renderMetaItem('Generated', `<span class="value">${escapeHtml(generatedAtText)}</span>`),
    renderMetaItem('Last run', `<span class="value">${escapeHtml(lastRunText)}</span>`),
    renderMetaItem('Execution', `<span class="value">${executionTimeSeconds.toFixed(1)} s</span>`),
    renderMetaItem(
      'Rows available',
      `<span class="value">${totalRowCount.toLocaleString()}</span>`,
    ),
    renderMetaItem('Rows in report', `<span class="value">${escapeHtml(rowsInReportText)}</span>`),
    renderMetaItem('Status filter', buildActiveStatusesHtml(activeStatuses)),
    renderMetaItem('Source A', formatSource(config.sourceA)),
    renderMetaItem('Source B', formatSource(config.sourceB)),
    renderMetaItem('Join keys', joinKeysHtml),
  ];

  const metaListHtml = `<div class="meta-list">${metaItems.join('')}</div>`;

  const columnDiffsHtml =
    columnDiffs.length > 0
      ? `<div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th class="numeric">Added</th>
                <th class="numeric">Removed</th>
                <th class="numeric">Modified</th>
                <th class="numeric">Unchanged</th>
                <th class="numeric">% Changed</th>
                <th class="numeric">% Coverage</th>
              </tr>
            </thead>
            <tbody>
              ${columnDiffs.map((diff) => buildColumnSummaryRow(diff, rows.length)).join('')}
            </tbody>
          </table>
        </div>`
      : '<p class="value value-empty">No comparison columns selected.</p>';

  const tableHeaders = [
    '<th class="numeric">#</th>',
    '<th>Status</th>',
    ...keyColumns.map((column) => `<th>${escapeHtml(column)}</th>`),
    ...compareColumns.map(({ label }) => `<th>${escapeHtml(label)}</th>`),
  ].join('');

  const tableRows =
    rows.length > 0
      ? rows.map((row, index) => buildRowHtml(row, keyColumns, compareColumns, index)).join('')
      : '<tr><td colspan="100" class="value value-empty">No rows satisfy the current filters.</td></tr>';

  const filtersSection =
    columnFilters.length > 0
      ? buildColumnFiltersSection(buildColumnFiltersList(columnFilters))
      : '';

  const sections = [
    buildHeaderSection(comparisonName, tableName),
    buildMetaSection(metaListHtml),
    buildStatusSummarySection(statusSummaryRows),
    buildColumnDiffsSection(columnDiffsHtml),
    filtersSection,
    buildRowsSection(tableHeaders, tableRows),
    buildFooter(),
  ]
    .filter(Boolean)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(comparisonName)} – Comparison Report</title>
    <style>${REPORT_CSS}</style>
  </head>
  <body>
    <article class="report">
      ${sections}
    </article>
  </body>
</html>`;
};

/**
 * Triggers a download of a comparison report HTML file in the browser.
 */
export const downloadComparisonHtmlReport = (
  options: ComparisonHtmlReportOptions,
  fileName: string = 'comparison-report.html',
): void => {
  const htmlContent = generateComparisonHtmlReport(options);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};
