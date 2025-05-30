// User intent types for better AI understanding
export type SQLAssistanceIntent =
  | 'optimize' // Improve performance, efficiency
  | 'explain' // Explain what code does
  | 'create' // Write new SQL from scratch
  | 'fix' // Fix errors, syntax issues
  | 'convert' // Transform to different approach
  | 'debug'; // Help troubleshoot issues

// Types of actions the AI can suggest
export type SQLActionType =
  | 'replace_statement' // Replace the current SQL statement
  | 'insert_after' // Insert code after current statement
  | 'insert_before' // Insert code before current statement
  | 'insert_at_cursor' // Insert at exact cursor position
  | 'add_comment' // Add explanatory comments
  | 'fix_error'; // Fix SQL errors by replacing entire script

// Types of explanations provided
export type ExplanationType =
  | 'performance' // Performance-related insights
  | 'syntax' // Syntax explanations
  | 'best_practice' // Best practice recommendations
  | 'warning'; // Important warnings or caveats

// Position for explanations
export type ExplanationPosition = 'before' | 'after' | 'inline';

// Individual action that can be taken
export interface SQLAction {
  id: string; // Unique identifier for this action
  type: SQLActionType; // How this action should be applied
  code: string; // The actual SQL code or comment
  description: string; // Human-readable description
  confidence: number; // AI confidence (0-1)
  recommended: boolean; // Should this be pre-selected?
  dependencies?: string[]; // IDs of other actions this depends on
}

// Educational explanation
export interface SQLExplanation {
  type: ExplanationType;
  content: string;
  position: ExplanationPosition;
}

// Alternative approach suggestion
export interface SQLAlternative {
  title: string; // Short title for the alternative
  description: string; // Explanation of this approach
  code: string; // The alternative SQL code
  pros: string[]; // Benefits of this approach
  cons: string[]; // Drawbacks of this approach
}

// Main structured response from AI
export interface StructuredSQLResponse {
  intent: SQLAssistanceIntent; // What type of help was provided
  summary: string; // Brief summary of the assistance
  actions: SQLAction[]; // Actionable code changes
  explanations?: SQLExplanation[]; // Educational content
  alternatives?: SQLAlternative[]; // Other approaches to consider
  warnings?: string[]; // Important things to know
}

// OpenAI function definition for structured responses
export const SQL_ASSISTANT_FUNCTION = {
  name: 'provide_sql_assistance',
  description: 'Provide structured SQL assistance with actionable code changes and explanations',
  parameters: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['optimize', 'explain', 'create', 'fix', 'convert', 'debug'],
        description: 'The type of assistance being provided',
      },
      summary: {
        type: 'string',
        description: 'Brief summary of what was analyzed and the assistance provided',
      },
      actions: {
        type: 'array',
        description: 'List of actionable code changes or insertions',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for this action',
            },
            type: {
              type: 'string',
              enum: [
                'replace_statement',
                'insert_after',
                'insert_before',
                'insert_at_cursor',
                'add_comment',
                'fix_error',
              ],
              description: 'How this action should be applied to the code',
            },
            code: {
              type: 'string',
              description: 'The actual SQL code, comment, or text to insert',
            },
            description: {
              type: 'string',
              description: 'Human-readable description of what this action does',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'How confident you are in this suggestion (0-1)',
            },
            recommended: {
              type: 'boolean',
              description: 'Whether this action should be pre-selected for the user',
            },
            dependencies: {
              type: 'array',
              items: { type: 'string' },
              description: 'IDs of other actions that should be applied before this one',
            },
          },
          required: ['id', 'type', 'code', 'description', 'confidence', 'recommended'],
        },
      },
      explanations: {
        type: 'array',
        description: 'Educational explanations to help the user understand',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['performance', 'syntax', 'best_practice', 'warning'],
              description: 'Category of explanation',
            },
            content: {
              type: 'string',
              description: 'The explanation text',
            },
            position: {
              type: 'string',
              enum: ['before', 'after', 'inline'],
              description: 'Where this explanation should appear relative to code',
            },
          },
          required: ['type', 'content', 'position'],
        },
      },
      alternatives: {
        type: 'array',
        description: 'Alternative approaches the user might consider',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short title for this alternative',
            },
            description: {
              type: 'string',
              description: 'Explanation of this approach',
            },
            code: {
              type: 'string',
              description: 'The alternative SQL code',
            },
            pros: {
              type: 'array',
              items: { type: 'string' },
              description: 'Benefits of this approach',
            },
            cons: {
              type: 'array',
              items: { type: 'string' },
              description: 'Drawbacks of this approach',
            },
          },
          required: ['title', 'description', 'code', 'pros', 'cons'],
        },
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Important warnings or things the user should be aware of',
      },
    },
    required: ['intent', 'summary', 'actions'],
  },
};
