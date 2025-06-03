/**
 * Layout constants for schema browser
 */

// Node dimensions
export const NODE_WIDTH = 280;
export const NODE_HEIGHT_BASE = 50;
export const NODE_HEIGHT_PER_COLUMN = 24;
export const NODE_PADDING = 16;

// Layout spacing
export const HORIZONTAL_GAP = 200;
export const VERTICAL_GAP = 140;
export const EDGE_PADDING = 10;

// Dagre layout configuration
export const DAGRE_NODESEP_LR = 150; // Horizontal spacing between nodes (left-right)
export const DAGRE_NODESEP_TB = 100; // Horizontal spacing between nodes (top-bottom)
export const DAGRE_RANKSEP_LR = 200; // Vertical spacing between ranks (left-right)
export const DAGRE_RANKSEP_TB = 150; // Vertical spacing between ranks (top-bottom)
export const DAGRE_EDGESEP = 50; // Spacing between edges
export const DAGRE_MARGIN_X = 40; // Graph margin X
export const DAGRE_MARGIN_Y = 40; // Graph margin Y

// Performance limits
export const MAX_VISIBLE_COLUMNS = 20;
export const WARN_NODE_COUNT = 50;
export const MAX_NODE_COUNT = 400;
export const MAX_EDGE_COUNT = 500;

// Graph layout
export const CIRCLE_LAYOUT_THRESHOLD = 10;
export const MIN_CIRCLE_RADIUS = 300;
export const CIRCLE_RADIUS_MULTIPLIER = 70;
export const GRID_START_X = 100;
export const GRID_START_Y = 100;
export const GRID_SPACING_X = 300;
export const GRID_SPACING_Y = 350;
export const DEFAULT_NODE_POSITION = { x: 250, y: 250 };
export const CIRCLE_CENTER = { x: 400, y: 300 };

// Edge styling
export const EDGE_STROKE_WIDTH = 2;
export const EDGE_SELECTED_STROKE_WIDTH = 4;
export const EDGE_MARKER_SIZE = 10;

// Colors and themes
export const EDGE_DEFAULT_COLOR = '#94A3B8';
export const EDGE_SELECTED_COLOR = '#3B82F6';
export const EDGE_GLOW_OPACITY = 0.15;

// Timing
export const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds
export const QUERY_TIMEOUT_DESCRIBE = 10000; // 10 seconds
export const QUERY_TIMEOUT_CONSTRAINTS = 5000; // 5 seconds

// Visual constants for selection and highlighting
export const SCHEMA_COLORS = {
  // Selection and highlighting
  SELECTED_BORDER: 'border-blue-500',
  SELECTED_BORDER_WIDTH: 'border-2',
  SELECTED_RING: 'ring-4 ring-blue-300/50',
  HIGHLIGHTED_BACKGROUND: 'bg-blue-50 dark:bg-blue-900/20',

  // Default states
  DEFAULT_BORDER: 'border-slate-300 dark:border-slate-600',

  // Icon colors
  PRIMARY_KEY_COLOR: '#F3A462',
  FOREIGN_KEY_COLOR: '#4A57C1',
} as const;

// Animation and transition durations
export const ANIMATION_DURATIONS = {
  TRANSITION_ALL: 'transition-all duration-200',
  TRANSITION_COLORS: 'transition-colors',
} as const;

// Data attributes for event handling
export const DATA_ATTRIBUTES = {
  TABLE_HEADER: 'data-table-header',
} as const;
