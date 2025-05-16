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
