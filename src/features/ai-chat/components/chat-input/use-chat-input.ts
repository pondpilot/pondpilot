import { useMentions } from '@components/ai-shared';
import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useAppStore } from '@store/app-store';
import { useState, useRef, useEffect, useCallback } from 'react';

interface UseChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

interface MentionSuggestion {
  value: string;
  label: string;
  description?: string;
  type?: 'database' | 'table' | 'view' | 'error' | 'dataset' | 'query';
  contextInfo?: string;
  startPos?: number;
  endPos?: number;
}

export const useChatInput = ({ onSendMessage, isLoading }: UseChatInputProps) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaRect, setTextareaRect] = useState<DOMRect | undefined>();
  const [hasMultipleRows, setHasMultipleRows] = useState(false);

  const connectionPool = useDuckDBConnectionPool();
  const sqlScripts = useAppStore((state) => state.sqlScripts);

  const {
    mentionState,
    handleInput,
    handleKeyDown: handleMentionKeyDown,
    resetMentions,
    setSelectedIndex,
  } = useMentions({
    connectionPool,
    sqlScripts,
  });

  // Handle mention selection
  const handleMentionSelect = useCallback(
    (suggestion: MentionSuggestion) => {
      if (textareaRef.current) {
        const start = suggestion.startPos ?? mentionState.startPos;
        const end = suggestion.endPos ?? mentionState.endPos;

        let insertValue = suggestion.label;
        if (
          (suggestion.type === 'table' ||
            suggestion.type === 'view' ||
            suggestion.type === 'database') &&
          suggestion.contextInfo
        ) {
          insertValue = `${suggestion.contextInfo}.${suggestion.label}`;
        } else if (suggestion.type === 'database') {
          insertValue = suggestion.label;
        }

        const newText = `${message.substring(0, start)}@${insertValue} ${message.substring(end)}`;
        setMessage(newText);

        const newCursorPos = start + 1 + insertValue.length + 1;
        setTimeout(() => {
          textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current?.focus();
        }, 0);

        resetMentions();
      }
    },
    [message, mentionState.startPos, mentionState.endPos, resetMentions],
  );

  // Update textarea rect when mention state changes
  useEffect(() => {
    if (mentionState.isActive && textareaRef.current) {
      setTextareaRect(textareaRef.current.getBoundingClientRect());
    }
  }, [mentionState.isActive]);

  // Keep focus on the input
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  // Track textarea height
  useEffect(() => {
    if (textareaRef.current) {
      const checkHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
          const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight, 10);
          const paddingTop = parseInt(window.getComputedStyle(textarea).paddingTop, 10);
          const paddingBottom = parseInt(window.getComputedStyle(textarea).paddingBottom, 10);
          const singleRowHeight = lineHeight + paddingTop + paddingBottom;
          const currentHeight = textarea.scrollHeight;
          setHasMultipleRows(currentHeight > singleRowHeight + 5); // 5px tolerance
        }
      };

      checkHeight();
      const observer = new ResizeObserver(checkHeight);
      observer.observe(textareaRef.current);
      return () => observer.disconnect();
    }
  }, [message]);

  // Reset mentions when component unmounts
  useEffect(() => {
    return () => {
      resetMentions();
    };
  }, [resetMentions]);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !isLoading) {
      onSendMessage(trimmedMessage);
      setMessage('');
      resetMentions();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Check if we need to handle mention selection
    if (mentionState.isActive && mentionState.suggestions.length > 0) {
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault();
        const suggestion = mentionState.suggestions[mentionState.selectedIndex];
        if (suggestion) {
          handleMentionSelect(suggestion);
        }
        return;
      }
    }

    // Let mention handler process navigation keys
    if (handleMentionKeyDown(e as any)) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setMessage(newValue);
    handleInput(newValue, e.target.selectionStart || 0);
  };

  const handleMentionSelectForDropdown = (suggestion: MentionSuggestion) => {
    handleMentionSelect({
      ...suggestion,
      startPos: mentionState.startPos,
      endPos: mentionState.endPos,
    });
    resetMentions();
  };

  return {
    message,
    textareaRef,
    textareaRect,
    hasMultipleRows,
    mentionState,
    handleSend,
    handleKeyDown,
    handleTextChange,
    handleMentionSelectForDropdown,
    setSelectedIndex,
  };
};
