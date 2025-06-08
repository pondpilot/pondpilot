import { DATABASE_LIMITS } from './constants';
import { DatabaseModel, DatabaseModelCache } from './model';
import {
  getDropdownPositionStyles,
  getErrorItemStyles,
  positionDropdown,
} from './utils/dropdown-styles';
import { sanitizeText, getObjectSizeInBytes, bytesToMB } from './utils/sanitization';
import { getDatabaseModel } from '../../../controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '../../duckdb-context/duckdb-connection-pool';

// Constants for fuzzy search scoring
const FUZZY_SCORE = {
  EXACT_MATCH: 1000,
  PREFIX_MATCH_BASE: 900,
  CONTAINS_MATCH_BASE: 700,
  CHAR_MATCH: 100,
  CONSECUTIVE_BONUS: 50,
  WORD_BOUNDARY_BONUS: 30,
  POSITION_PENALTY: 10,
  LENGTH_PENALTY: 2,
} as const;

// UI Constants
const MENTION_UI = {
  MAX_SUGGESTIONS: 15,
  DROPDOWN_MAX_HEIGHT: 200,
  ITEM_HEIGHT: 40,
} as const;

export interface MentionSuggestion {
  value: string;
  label: string;
  type: 'database' | 'table' | 'view' | 'script' | 'error';
  schema?: string;
  database?: string;
  score?: number; // For fuzzy search ranking
  contextInfo?: string; // Database.schema info for display
  scriptId?: string; // ID of the script for retrieval
}

export interface MentionState {
  isActive: boolean;
  query: string;
  startPos: number;
  endPos: number;
  suggestions: MentionSuggestion[];
  selectedIndex: number;
}

export function createInitialMentionState(): MentionState {
  return {
    isActive: false,
    query: '',
    startPos: 0,
    endPos: 0,
    suggestions: [],
    selectedIndex: 0,
  };
}

/**
 * Fuzzy search scoring function for table/database name suggestions.
 *
 * Scoring strategy:
 * - 1000: Exact match (highest priority)
 * - 900-899: Prefix match (penalized by length difference)
 * - 700-X: Contains exact substring (penalized by position and length)
 * - 0-600: Fuzzy character matching with bonuses
 * - 0: No match
 *
 * @param query - The search query from user input
 * @param text - The table/database name to score
 * @returns Score indicating match quality (higher is better)
 */
function fuzzyScore(query: string, text: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  // Exact match gets highest score
  if (lowerText === lowerQuery) return FUZZY_SCORE.EXACT_MATCH;

  // Prefix match gets high score minus length difference
  // Example: query="user" matches "users" with score 895
  if (lowerText.startsWith(lowerQuery)) {
    return FUZZY_SCORE.PREFIX_MATCH_BASE - (lowerText.length - lowerQuery.length);
  }

  // Contains exact substring gets medium score
  // Base score minus position penalty and length difference
  // Example: query="user" in "app_users" (position 4) scores ~650
  if (lowerText.includes(lowerQuery)) {
    const index = lowerText.indexOf(lowerQuery);
    return (
      FUZZY_SCORE.CONTAINS_MATCH_BASE -
      index * FUZZY_SCORE.POSITION_PENALTY -
      (lowerText.length - lowerQuery.length)
    );
  }

  // Fuzzy character-by-character matching for non-exact matches
  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i += 1) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      // Base points for each matched character
      score += FUZZY_SCORE.CHAR_MATCH;

      // Bonus for consecutive character matches
      // Rewards continuous sequences like "use" in "user"
      if (lastMatchIndex === i - 1) {
        score += FUZZY_SCORE.CONSECUTIVE_BONUS;
      }

      // Bonus for matches at word boundaries
      // Rewards camelCase/snake_case matches like "u" matching "user_table"
      if (i === 0 || lowerText[i - 1] === '_' || lowerText[i - 1] === ' ') {
        score += FUZZY_SCORE.WORD_BOUNDARY_BONUS;
      }

      lastMatchIndex = i;
      queryIndex += 1;
    }
  }

  // Only return score if all query characters were matched
  if (queryIndex === lowerQuery.length) {
    // Penalize longer strings to prefer shorter, more relevant matches
    // Example: "user" scores higher for "users" than "user_authentication_tokens"
    score -= lowerText.length * FUZZY_SCORE.LENGTH_PENALTY;
    return score;
  }

  return 0; // No match if not all characters found
}

export async function getTableSuggestions(
  connectionPool: AsyncDuckDBConnectionPool | null,
  query: string,
  sqlScripts?: Map<string, { id: string; name: string; content: string }>,
): Promise<MentionSuggestion[]> {
  const suggestions: MentionSuggestion[] = [];

  // Add script suggestions
  if (sqlScripts) {
    for (const [scriptId, script] of sqlScripts.entries()) {
      const score = fuzzyScore(query, script.name);
      if (score > 0) {
        suggestions.push({
          value: script.name,
          label: script.name,
          type: 'script',
          score,
          scriptId,
          contextInfo: 'SQL Script',
        });
      }
    }
  }

  if (!connectionPool) {
    // If no connection pool, still return script suggestions if any
    return suggestions.length > 0
      ? suggestions.slice(0, MENTION_UI.MAX_SUGGESTIONS)
      : [
          {
            value: '',
            label: 'No database connection available',
            type: 'error' as const,
            score: 0,
          },
        ];
  }

  try {
    const databaseModel = await getCachedDatabaseModel(connectionPool);

    // Count total objects for warning
    let totalObjects = 0;
    for (const [, database] of databaseModel.entries()) {
      for (const schema of database.schemas) {
        totalObjects += schema.objects.length;
      }
    }

    // Add warning if too many objects
    if (totalObjects > DATABASE_LIMITS.LARGE_DB_THRESHOLD) {
      suggestions.push({
        value: '',
        label: `⚠️ Large database (${totalObjects.toLocaleString()} objects) - search may be slow`,
        type: 'error' as const,
        score: Number.MAX_SAFE_INTEGER, // Always show at top
      });
    }

    // Add database suggestions
    for (const [dbName] of databaseModel.entries()) {
      const score = fuzzyScore(query, dbName);
      if (score > 0) {
        suggestions.push({
          value: dbName,
          label: dbName,
          type: 'database',
          score,
        });
      }
    }

    // Add table and view suggestions
    const seenObjects = new Set<string>();
    for (const [dbName, database] of databaseModel.entries()) {
      for (const schema of database.schemas) {
        for (const object of schema.objects) {
          // Create a unique key to prevent duplicates
          const objectKey = `${dbName}.${schema.name}.${object.name}`;

          if (!seenObjects.has(objectKey)) {
            seenObjects.add(objectKey);

            // Calculate fuzzy score
            const score = fuzzyScore(query, object.name);
            if (score > 0) {
              // Create label with database and schema info
              const contextInfo = `${dbName}.${schema.name}`;
              suggestions.push({
                value: object.name,
                label: object.name,
                type: object.type,
                schema: schema.name,
                database: dbName,
                score,
                contextInfo, // Add context info for display
              });
            }
          }
        }
      }
    }

    // Sort by score (highest first), then by type (databases first), then by name
    suggestions.sort((a, b) => {
      // First sort by score
      if (a.score !== b.score) {
        return (b.score || 0) - (a.score || 0);
      }

      // Then by type (scripts first, then databases, then tables, then views)
      const typeOrder = { script: 0, database: 1, table: 2, view: 3, error: 5 };
      const aOrder = typeOrder[a.type] ?? 4;
      const bOrder = typeOrder[b.type] ?? 4;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      // Finally by name
      return a.value.localeCompare(b.value);
    });

    // Note: We cannot add SQL LIMIT when fetching from getDatabaseModel because:
    // 1. We need all metadata to perform fuzzy search across all tables/databases
    // 2. The scoring happens client-side after fetching all objects
    // 3. System catalog tables are typically small enough to fetch entirely
    return suggestions.slice(0, MENTION_UI.MAX_SUGGESTIONS); // Limit results after scoring
  } catch (error) {
    console.error('Error fetching table suggestions:', error);
    // Return user-friendly error message
    return [
      {
        value: '',
        label: error instanceof Error ? `Error: ${error.message}` : 'Error loading suggestions',
        type: 'error' as const,
        score: 0,
      },
    ];
  }
}

export function detectMentionTrigger(
  text: string,
  cursorPos: number,
): {
  isTriggered: boolean;
  startPos: number;
  query: string;
} {
  // Look backwards from cursor to find @
  let i = cursorPos - 1;
  while (i >= 0) {
    const char = text[i];
    if (char === '@') {
      // Check if @ is at start or preceded by whitespace
      if (i === 0 || /\s/.test(text[i - 1])) {
        const query = text.substring(i + 1, cursorPos);
        // Only trigger if query contains valid table name characters
        if (/^[a-zA-Z0-9_]*$/.test(query)) {
          return {
            isTriggered: true,
            startPos: i,
            query,
          };
        }
      }
      break;
    }
    // Stop if we hit whitespace or other special characters
    if (/\s/.test(char)) {
      break;
    }
    i -= 1;
  }

  return {
    isTriggered: false,
    startPos: 0,
    query: '',
  };
}

export interface ExtractedMentions {
  tables: string[];
  databases: string[];
  scripts: string[];
}

export function extractMentions(text: string): ExtractedMentions {
  const mentions = new Set<string>();

  const regex = /@([a-zA-Z0-9_]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    mentions.add(match[1]);
  }

  // We'll need to check against the actual database model and scripts to categorize properly
  // For now, return all as tables (this will be enhanced in ai-assistant-handlers.ts)
  return {
    tables: Array.from(mentions),
    databases: [],
    scripts: [],
  };
}

// Legacy function for backward compatibility
export function extractMentionedTables(text: string): string[] {
  const { tables } = extractMentions(text);
  return tables;
}

// WeakMap to store reposition handlers for dropdowns
type RepositionHandler = () => void;
const dropdownHandlers = new WeakMap<HTMLElement, RepositionHandler>();

let databaseModelCache: DatabaseModelCache | null = null;
const DATABASE_CACHE_TTL_MS = 30000; // 30 seconds

async function getCachedDatabaseModel(
  connectionPool: AsyncDuckDBConnectionPool,
): Promise<DatabaseModel> {
  const now = Date.now();

  // Return cached data if it's still valid and size is acceptable
  if (databaseModelCache && now - databaseModelCache.timestamp < DATABASE_CACHE_TTL_MS) {
    const cacheSizeMB = bytesToMB(getObjectSizeInBytes(databaseModelCache.data));
    if (cacheSizeMB < DATABASE_LIMITS.MAX_CACHE_SIZE_MB) {
      return databaseModelCache.data;
    }
    console.warn(
      `Database model cache exceeded size limit (${cacheSizeMB.toFixed(2)}MB), refreshing...`,
    );
  }

  // Fetch new data and cache it
  const data = (await getDatabaseModel(connectionPool)) as DatabaseModel;

  // Check size before caching
  const newCacheSizeMB = bytesToMB(getObjectSizeInBytes(data));
  if (newCacheSizeMB > DATABASE_LIMITS.MAX_CACHE_SIZE_MB) {
    console.warn(
      `Database model is very large (${newCacheSizeMB.toFixed(2)}MB), caching anyway but performance may be impacted`,
    );
  }

  databaseModelCache = {
    data,
    timestamp: now,
  };

  return data;
}

// Helper function to create icon SVG elements safely
function createIconSvg(type: 'database' | 'table' | 'view' | 'script' | 'error'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  switch (type) {
    case 'error': {
      // Error/warning icon
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '10');
      svg.appendChild(circle);

      const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.setAttribute('x1', '12');
      line1.setAttribute('y1', '8');
      line1.setAttribute('x2', '12');
      line1.setAttribute('y2', '12');
      svg.appendChild(line1);

      const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line2.setAttribute('x1', '12');
      line2.setAttribute('y1', '16');
      line2.setAttribute('x2', '12.01');
      line2.setAttribute('y2', '16');
      svg.appendChild(line2);
      break;
    }

    case 'database': {
      // IconDatabase from Tabler
      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ellipse.setAttribute('cx', '12');
      ellipse.setAttribute('cy', '6');
      ellipse.setAttribute('rx', '8');
      ellipse.setAttribute('ry', '3');
      svg.appendChild(ellipse);

      const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path1.setAttribute('d', 'M4 6v6a8 3 0 0 0 16 0v-6');
      svg.appendChild(path1);

      const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path2.setAttribute('d', 'M4 12v6a8 3 0 0 0 16 0v-6');
      svg.appendChild(path2);
      break;
    }

    case 'table': {
      // IconTable from Tabler
      const tablePath1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tablePath1.setAttribute(
        'd',
        'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z',
      );
      svg.appendChild(tablePath1);

      const tablePath2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tablePath2.setAttribute('d', 'M3 10h18');
      svg.appendChild(tablePath2);

      const tablePath3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tablePath3.setAttribute('d', 'M10 3v18');
      svg.appendChild(tablePath3);
      break;
    }

    case 'view': {
      // IconTableAlias from Tabler
      const viewPaths = [
        'M3 12a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7z',
        'M3 17h18',
        'M10 10v11',
        'M3 5v2',
        'M7 5v2',
        'M11 5v2',
        'M15 5v2',
        'M19 5v2',
        'M21 5v2',
      ];

      viewPaths.forEach((d) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
      });
      break;
    }

    case 'script': {
      // IconFileCode from Tabler
      const scriptPaths = [
        'M14 3v4a1 1 0 0 0 1 1h4',
        'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z',
        'M10 13l-1 2l1 2',
        'M14 13l1 2l-1 2',
      ];

      scriptPaths.forEach((d) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
      });
      break;
    }
  }

  return svg;
}

export function createMentionDropdown(
  suggestions: MentionSuggestion[],
  selectedIndex: number,
  onSelect: (suggestion: MentionSuggestion) => void,
  textarea?: HTMLTextAreaElement,
): HTMLElement {
  const dropdown = document.createElement('div');
  dropdown.className = 'ai-widget-mention-dropdown';

  // Add ARIA attributes for accessibility
  dropdown.setAttribute('role', 'listbox');
  dropdown.id = `ai-mention-listbox-${Date.now()}`; // Generate unique ID

  // Apply inline styles to ensure visibility
  // Note: We need inline styles because the dropdown is appended to document.body,
  // outside the CodeMirror editor scope where theme styles don't apply
  const isDarkMode = document.documentElement.getAttribute('data-mantine-color-scheme') === 'dark';

  Object.assign(dropdown.style, {
    ...getDropdownPositionStyles(),
    background: isDarkMode ? '#1f2937' : '#ffffff',
    border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
    borderRadius: '6px',
    boxShadow: isDarkMode
      ? '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)'
      : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    maxHeight: '200px',
    overflowY: 'auto',
  });

  suggestions.forEach((suggestion, index) => {
    const item = document.createElement('div');
    item.className = 'ai-widget-mention-item';

    // Add ARIA attributes for each option
    item.setAttribute('role', 'option');
    item.id = `ai-mention-option-${index}`;

    const isSelected = index === selectedIndex;
    if (isSelected) {
      item.classList.add('selected');
      item.setAttribute('aria-selected', 'true');
    } else {
      item.setAttribute('aria-selected', 'false');
    }

    // Apply inline styles for menu items
    Object.assign(item.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      cursor: 'pointer',
      transition: 'background-color 0.1s ease',
      fontSize: '14px',
      color: isDarkMode ? '#e5e7eb' : 'var(--mantine-color-text)',
      backgroundColor: isSelected ? (isDarkMode ? '#3b82f6' : '#dbeafe') : 'transparent',
    });

    // Add hover effect
    item.addEventListener('mouseenter', () => {
      if (!item.classList.contains('selected')) {
        item.style.backgroundColor = isDarkMode ? '#374151' : '#f3f4f6';
      }
    });

    item.addEventListener('mouseleave', () => {
      if (!item.classList.contains('selected')) {
        item.style.backgroundColor = 'transparent';
      }
    });

    const icon = document.createElement('span');
    icon.className = 'ai-widget-mention-icon';
    Object.assign(icon.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '16px',
      height: '16px',
      marginRight: '8px',
      color: isSelected && isDarkMode ? '#ffffff' : isDarkMode ? '#9ca3af' : '#6b7280',
    });
    const svgIcon = createIconSvg(suggestion.type);
    icon.appendChild(svgIcon);

    const labelContainer = document.createElement('span');
    labelContainer.className = 'ai-widget-mention-label';
    Object.assign(labelContainer.style, {
      flex: '1',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      overflow: 'hidden',
    });

    const label = document.createElement('span');
    label.className = 'ai-widget-mention-label-text';
    // Sanitize label text for safety
    label.textContent = sanitizeText(suggestion.label);
    Object.assign(label.style, {
      whiteSpace: 'nowrap',
      color: isSelected ? (isDarkMode ? '#ffffff' : '#1e40af') : 'inherit',
    });

    labelContainer.appendChild(label);

    // Add context info for tables and views
    if (suggestion.contextInfo && (suggestion.type === 'table' || suggestion.type === 'view')) {
      const contextSpan = document.createElement('span');
      contextSpan.className = 'ai-widget-mention-context';
      // Sanitize context info for safety
      contextSpan.textContent = sanitizeText(suggestion.contextInfo);
      Object.assign(contextSpan.style, {
        color: isDarkMode ? '#6b7280' : '#9ca3af',
        fontSize: '12px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      });
      labelContainer.appendChild(contextSpan);
    }

    item.appendChild(icon);
    item.appendChild(labelContainer);

    // Only add click handler for non-error items
    if (suggestion.type !== 'error') {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(suggestion);
      });
    } else {
      // Style error items differently
      Object.assign(item.style, getErrorItemStyles());
      item.classList.add('error');
      icon.style.color = isDarkMode ? '#ef4444' : '#dc2626';
    }

    dropdown.appendChild(item);
  });

  // Position the dropdown relative to the textarea
  if (textarea) {
    const updateDropdownPosition = () => {
      const textareaRect = textarea.getBoundingClientRect();

      // Find the AI assistant widget container
      // Look for the widget container that's a child of cm-ai-assistant-widget
      const cmWidget = textarea.closest('.cm-ai-assistant-widget');
      const aiWidgetContainer = cmWidget ? cmWidget.querySelector('.ai-widget-container') : null;
      const windowRect = aiWidgetContainer
        ? aiWidgetContainer.getBoundingClientRect()
        : textareaRect;

      positionDropdown(
        dropdown,
        textareaRect,
        windowRect,
        MENTION_UI.ITEM_HEIGHT,
        MENTION_UI.DROPDOWN_MAX_HEIGHT,
        suggestions.length,
      );

      // Ensure selected item is visible
      const selectedItem = dropdown.querySelector(
        '.ai-widget-mention-item.selected',
      ) as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };

    // Position immediately and after DOM is ready
    updateDropdownPosition();
    setTimeout(updateDropdownPosition, 0);

    // Reposition on scroll or resize
    const repositionHandler = () => updateDropdownPosition();
    window.addEventListener('scroll', repositionHandler, true);
    window.addEventListener('resize', repositionHandler);

    // Store handler in WeakMap for cleanup
    dropdownHandlers.set(dropdown, repositionHandler);
  }

  return dropdown;
}

export function cleanupMentionDropdown(dropdown: HTMLElement) {
  const repositionHandler = dropdownHandlers.get(dropdown);
  if (repositionHandler) {
    window.removeEventListener('scroll', repositionHandler, true);
    window.removeEventListener('resize', repositionHandler);
    dropdownHandlers.delete(dropdown);
  }
  dropdown.remove();
}
