import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { useState, useCallback, useRef } from 'react';

import { CHAT } from '../../../config/constants';
import { useDebounce } from '../../../hooks/use-debounce';
import { escapeSqlString } from '../utils/sql-escape';

export interface MentionSuggestion {
  value: string;
  label: string;
  description?: string;
  type?: 'database' | 'table' | 'view' | 'error' | 'dataset' | 'query';
  contextInfo?: string;
}

export interface MentionState {
  isActive: boolean;
  query: string;
  startPos: number;
  endPos: number;
  suggestions: MentionSuggestion[];
  selectedIndex: number;
}

interface UseMentionsProps {
  connectionPool: AsyncDuckDBConnectionPool | null;
  sqlScripts?: Map<SQLScriptId, SQLScript>;
}

interface UseMentionsReturn {
  mentionState: MentionState;
  handleInput: (text: string, cursorPos: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  applyMention: (suggestion: MentionSuggestion, text: string, cursorPos: number) => string;
  resetMentions: () => void;
  setSelectedIndex: (index: number) => void;
}

const { DEBOUNCE_DELAY } = CHAT;

export const useMentions = ({
  connectionPool,
  sqlScripts,
}: UseMentionsProps): UseMentionsReturn => {
  const [mentionState, setMentionState] = useState<MentionState>({
    isActive: false,
    query: '',
    startPos: 0,
    endPos: 0,
    suggestions: [],
    selectedIndex: 0,
  });

  const requestIdRef = useRef(0);

  // Detect mention trigger
  const detectMentionTrigger = useCallback((text: string, cursorPos: number) => {
    if (cursorPos === 0) return { isTriggered: false, query: '', startPos: 0 };

    // Look backwards from cursor to find @ symbol
    let startPos = cursorPos - 1;
    while (startPos >= 0) {
      const char = text[startPos];

      if (char === '@') {
        // Check if @ is at start or preceded by whitespace/punctuation
        const prevChar = startPos > 0 ? text[startPos - 1] : ' ';
        if (/\s|[,;.!?(){}[\]]/.test(prevChar) || startPos === 0) {
          const query = text.substring(startPos + 1, cursorPos);

          // Check if query contains only valid characters
          if (/^[a-zA-Z0-9_]*$/.test(query)) {
            return { isTriggered: true, query, startPos };
          }
        }
        break;
      }

      // Stop if we hit whitespace or invalid character
      if (!/[a-zA-Z0-9_]/.test(char)) {
        break;
      }

      startPos -= 1;
    }

    return { isTriggered: false, query: '', startPos: 0 };
  }, []);

  // Fetch suggestions
  const fetchSuggestions = useCallback(
    async (query: string, requestId: number) => {
      const suggestions: MentionSuggestion[] = [];

      // Add dataset/query suggestions from sqlScripts
      if (sqlScripts) {
        sqlScripts.forEach((script, id) => {
          if (script.name.toLowerCase().includes(query.toLowerCase())) {
            suggestions.push({
              value: id,
              label: script.name,
              description:
                script.content.slice(0, 100) + (script.content.length > 100 ? '...' : ''),
              type: 'query',
            });
          }
        });
      }

      // Add database, table, and view suggestions
      if (connectionPool) {
        try {
          // First get database suggestions
          // Escape the query to prevent SQL injection
          const escapedQuery = escapeSqlString(query);

          const dbResult = await connectionPool.query(`
          SELECT DISTINCT 
            catalog_name as database_name
          FROM information_schema.schemata
          WHERE LOWER(catalog_name) LIKE LOWER('%${escapedQuery}%')
            AND catalog_name NOT IN ('system', 'temp')
          ORDER BY 
            CASE WHEN LOWER(catalog_name) = LOWER('${escapedQuery}') THEN 0
                 WHEN LOWER(catalog_name) LIKE LOWER('${escapedQuery}%') THEN 1
                 ELSE 2 END,
            catalog_name
          LIMIT 10
        `);

          // Add database suggestions
          const dbRows = dbResult.toArray();
          if (dbRows.length > 0) {
            dbRows.forEach((row: any) => {
              suggestions.push({
                value: row.database_name,
                label: row.database_name,
                type: 'database',
              });
            });
          }

          // Then get table/view suggestions
          const result = await connectionPool.query(`
          SELECT DISTINCT 
            table_catalog || '.' || table_schema as context_info,
            table_name,
            table_type
          FROM information_schema.tables
          WHERE LOWER(table_name) LIKE LOWER('%${escapedQuery}%')
            AND table_schema NOT IN ('information_schema', 'pg_catalog')
          ORDER BY 
            CASE WHEN LOWER(table_name) = LOWER('${escapedQuery}') THEN 0
                 WHEN LOWER(table_name) LIKE LOWER('${escapedQuery}%') THEN 1
                 ELSE 2 END,
            table_name
          LIMIT 20
        `);

          // Convert arrow table to array of objects
          const rows = result.toArray();
          if (rows.length > 0) {
            rows.forEach((row: any) => {
              suggestions.push({
                value: row.table_name,
                label: row.table_name,
                type: row.table_type === 'VIEW' ? 'view' : 'table',
                contextInfo: row.context_info,
              });
            });
          }
        } catch (error) {
          console.error('Failed to fetch table suggestions:', error);
        }
      }

      // Only update if this is still the latest request
      if (requestId === requestIdRef.current) {
        setMentionState((prev) => ({
          ...prev,
          suggestions: suggestions.slice(0, 10), // Limit to 10 suggestions
          selectedIndex: suggestions.length > 0 ? 0 : -1,
        }));
      }
    },
    [connectionPool, sqlScripts],
  );

  // Create debounced version of fetchSuggestions
  const [debouncedFetchSuggestions, cancelDebounce] = useDebounce(fetchSuggestions, DEBOUNCE_DELAY);

  // Handle input changes
  const handleInput = useCallback(
    (text: string, cursorPos: number) => {
      const trigger = detectMentionTrigger(text, cursorPos);

      if (trigger.isTriggered) {
        setMentionState((prev) => ({
          ...prev,
          isActive: true,
          query: trigger.query,
          startPos: trigger.startPos,
          endPos: cursorPos,
        }));

        // Increment request ID
        requestIdRef.current += 1;
        const currentRequestId = requestIdRef.current;

        // Fetch suggestions
        if (trigger.query === '') {
          // Fetch immediately for empty query
          fetchSuggestions(trigger.query, currentRequestId);
        } else {
          // Use debounced version for non-empty queries
          debouncedFetchSuggestions(trigger.query, currentRequestId);
        }
      } else {
        // Cancel any pending requests
        cancelDebounce();
        requestIdRef.current += 1;

        setMentionState({
          isActive: false,
          query: '',
          startPos: 0,
          endPos: 0,
          suggestions: [],
          selectedIndex: 0,
        });
      }
    },
    [detectMentionTrigger, fetchSuggestions, debouncedFetchSuggestions, cancelDebounce],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!mentionState.isActive || mentionState.suggestions.length === 0) {
        return false;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setMentionState((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex + 1) % prev.suggestions.length,
          }));
          return true;

        case 'ArrowUp':
          e.preventDefault();
          setMentionState((prev) => ({
            ...prev,
            selectedIndex:
              prev.selectedIndex === 0 ? prev.suggestions.length - 1 : prev.selectedIndex - 1,
          }));
          return true;

        case 'Enter':
        case 'Tab':
          if (!e.shiftKey) {
            e.preventDefault();
            // Return true to indicate the key was handled
            // The parent component should handle the actual selection
            return true;
          }
          break;

        case 'Escape':
          e.preventDefault();
          setMentionState({
            isActive: false,
            query: '',
            startPos: 0,
            endPos: 0,
            suggestions: [],
            selectedIndex: 0,
          });
          return true;
      }

      return false;
    },
    [mentionState],
  );

  // Apply mention to text
  const applyMention = useCallback(
    (suggestion: MentionSuggestion, text: string, _cursorPos: number): string => {
      const start = Math.min(mentionState.startPos, text.length);
      const end = Math.min(mentionState.endPos, text.length);

      // Use label for all types, with fully qualified name for tables and views
      let insertValue = suggestion.label;
      if ((suggestion.type === 'table' || suggestion.type === 'view') && suggestion.contextInfo) {
        insertValue = `${suggestion.contextInfo}.${suggestion.label}`;
      }

      return `${text.substring(0, start)}@${insertValue} ${text.substring(end)}`;
    },
    [mentionState],
  );

  // Reset mentions
  const resetMentions = useCallback(() => {
    cancelDebounce();
    requestIdRef.current += 1;

    setMentionState({
      isActive: false,
      query: '',
      startPos: 0,
      endPos: 0,
      suggestions: [],
      selectedIndex: 0,
    });
  }, [cancelDebounce]);

  // Cleanup on unmount is handled by the useDebounce hook

  // Function to update selected index (for mouse hover)
  const setSelectedIndex = useCallback((index: number) => {
    setMentionState((prev) => ({
      ...prev,
      selectedIndex: index,
    }));
  }, []);

  return {
    mentionState,
    handleInput,
    handleKeyDown,
    applyMention,
    resetMentions,
    setSelectedIndex,
  };
};
