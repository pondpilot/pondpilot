export const chatInputStyles = {
  container: 'pb-6',

  wrapper: 'flex justify-center px-4',

  innerWrapper: 'relative w-full max-w-3xl',

  header: 'flex items-center justify-between mb-3 px-1',

  inputContainer: [
    'relative',
    'rounded-2xl',
    'bg-gray-50 dark:bg-gray-800/50',
    'transition-all duration-200',
    'border border-gray-200 dark:border-gray-700',
    'focus-within:border-gray-300 dark:focus-within:border-gray-600',
    'focus-within:shadow-sm',
    'focus-within:-translate-y-[1px]',
    'focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.08)]',
  ],

  textarea: {
    input: [
      'pr-16 pl-4 py-3 resize-none',
      'text-[15px] leading-relaxed',
      'border-0',
      'bg-transparent',
      'placeholder:text-gray-500 dark:placeholder:text-gray-400',
      'focus:outline-none',
      'text-gray-900 dark:text-gray-100',
      'scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent',
      'dark:scrollbar-thumb-gray-600',
    ],
    wrapper: 'border-0',
  },

  sendButton: {
    base: [
      'absolute right-3 top-1/2 -translate-y-1/2',
      'transition-all duration-200',
      'hover:bg-gray-200 dark:hover:bg-gray-700',
    ],
    enabled: 'text-gray-700 dark:text-gray-300',
    disabled: 'text-gray-400 dark:text-gray-500 cursor-not-allowed',
  },

  helpText: 'text-center mt-2 text-gray-500',

  modelSelector: 'opacity-70 hover:opacity-100 transition-opacity',
} as const;
