import { memo } from 'react';
import { EdgeProps, getStraightPath } from 'reactflow';

// Constants for edge styling and layout
const EDGE_CONSTANTS = {
  // Layout
  GAP_BETWEEN_NODE_AND_BEND: 50,
  SMALL_Y_THRESHOLD: 5,

  // Styling
  DEFAULT_EDGE_COLOR: '#94a3b8',
  SELECTED_EDGE_COLOR: '#3b82f6',
  DEFAULT_EDGE_WIDTH: 2,
  SELECTED_EDGE_WIDTH: 3,
  INTERACTION_STROKE_WIDTH: 20,
  GLOW_WIDTH_OFFSET: 6,
  GLOW_OPACITY: 0.3,
  GLOW_BLUR: 4,

  // Label
  MIN_LABEL_WIDTH: 40,
  MAX_LABEL_WIDTH: 120,
  LABEL_CHAR_WIDTH: 7,
  LABEL_HEIGHT: 20,
  LABEL_PADDING: 12,
  LABEL_BORDER_RADIUS: 10,
  LABEL_STROKE_WIDTH: 1.5,
  LABEL_STROKE_OPACITY: 0.8,
  LABEL_FONT_SIZE: 12,
  LABEL_FONT_WEIGHT_DEFAULT: 400,
  LABEL_FONT_WEIGHT_SELECTED: 600,

  // Animation
  DASH_PATTERN: '5,5',
  DASH_ANIMATION_DURATION: '1s',
  DASH_OFFSET: -10,

  // Arrow marker
  ARROW_WIDTH: 10,
  ARROW_HEIGHT: 10,
  ARROW_REF_X: 9,
  ARROW_REF_Y: 5,
} as const;

const AngledEdgeComponent = (props: EdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    style = {},
    markerStart,
    selected,
  } = props;

  // Create an angled path with improved routing
  let path = '';
  const gap = EDGE_CONSTANTS.GAP_BETWEEN_NODE_AND_BEND;

  if (sourcePosition === 'right' && targetPosition === 'left') {
    // Horizontal connection with vertical offset handling
    if (Math.abs(sourceY - targetY) < EDGE_CONSTANTS.SMALL_Y_THRESHOLD) {
      // Straight horizontal line when nodes are aligned
      const midX = sourceX + (targetX - sourceX) / 2;
      path = `M ${sourceX},${sourceY} L ${midX},${sourceY} L ${midX},${targetY} L ${targetX},${targetY}`;
    } else {
      // Route around nodes with gap
      const midX = Math.max(
        sourceX + gap,
        Math.min(targetX - gap, sourceX + (targetX - sourceX) / 2),
      );
      path = `M ${sourceX},${sourceY} L ${midX},${sourceY} L ${midX},${targetY} L ${targetX},${targetY}`;
    }
  } else if (sourcePosition === 'left' && targetPosition === 'right') {
    const midX = Math.max(
      targetX + gap,
      Math.min(sourceX - gap, sourceX + (targetX - sourceX) / 2),
    );
    path = `M ${sourceX},${sourceY} L ${midX},${sourceY} L ${midX},${targetY} L ${targetX},${targetY}`;
  } else if (sourcePosition === 'bottom' && targetPosition === 'top') {
    const midY = sourceY + (targetY - sourceY) / 2;
    const xOffset = Math.abs(sourceX - targetX) < gap ? gap : 0;
    if (xOffset > 0) {
      // Add small horizontal offset to avoid overlapping vertical edges
      const offsetX = sourceX < targetX ? sourceX - xOffset : sourceX + xOffset;
      path = `M ${sourceX},${sourceY} L ${sourceX},${midY} L ${offsetX},${midY} L ${targetX},${midY} L ${targetX},${targetY}`;
    } else {
      path = `M ${sourceX},${sourceY} L ${sourceX},${midY} L ${targetX},${midY} L ${targetX},${targetY}`;
    }
  } else if (sourcePosition === 'top' && targetPosition === 'bottom') {
    const midY = sourceY + (targetY - sourceY) / 2;
    const xOffset = Math.abs(sourceX - targetX) < gap ? gap : 0;
    if (xOffset > 0) {
      const offsetX = sourceX < targetX ? sourceX - xOffset : sourceX + xOffset;
      path = `M ${sourceX},${sourceY} L ${sourceX},${midY} L ${offsetX},${midY} L ${targetX},${midY} L ${targetX},${targetY}`;
    } else {
      path = `M ${sourceX},${sourceY} L ${sourceX},${midY} L ${targetX},${midY} L ${targetX},${targetY}`;
    }
  } else {
    // Fallback to straight path
    const [straightPath] = getStraightPath(props);
    path = straightPath;
  }

  const edgeColor = selected
    ? EDGE_CONSTANTS.SELECTED_EDGE_COLOR
    : EDGE_CONSTANTS.DEFAULT_EDGE_COLOR;
  const edgeWidth = selected
    ? EDGE_CONSTANTS.SELECTED_EDGE_WIDTH
    : EDGE_CONSTANTS.DEFAULT_EDGE_WIDTH;

  // Calculate label position with better placement
  let labelX = 0;
  let labelY = 0;

  if (sourcePosition === 'right' && targetPosition === 'left') {
    // Place label on the middle horizontal segment
    const midX = Math.max(
      sourceX + gap,
      Math.min(targetX - gap, sourceX + (targetX - sourceX) / 2),
    );
    labelX = sourceX + gap + (midX - sourceX - gap) / 2;
    labelY = sourceY;
  } else if (sourcePosition === 'left' && targetPosition === 'right') {
    const midX = Math.max(
      targetX + gap,
      Math.min(sourceX - gap, sourceX + (targetX - sourceX) / 2),
    );
    labelX = targetX + gap + (midX - targetX - gap) / 2;
    labelY = sourceY;
  } else if (sourcePosition === 'bottom' && targetPosition === 'top') {
    // For vertical paths, place label on horizontal segment in the middle
    const midY = sourceY + (targetY - sourceY) / 2;
    labelX = (sourceX + targetX) / 2;
    labelY = midY;
  } else if (sourcePosition === 'top' && targetPosition === 'bottom') {
    const midY = sourceY + (targetY - sourceY) / 2;
    labelX = (sourceX + targetX) / 2;
    labelY = midY;
  } else {
    // Default center position
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2;
  }

  return (
    <>
      {/* Glow effect for selected edges */}
      {selected && (
        <path
          d={path}
          strokeWidth={edgeWidth + EDGE_CONSTANTS.GLOW_WIDTH_OFFSET}
          stroke={edgeColor}
          strokeOpacity={EDGE_CONSTANTS.GLOW_OPACITY}
          fill="none"
          className="react-flow__edge-glow"
          style={{
            filter: `blur(${EDGE_CONSTANTS.GLOW_BLUR}px)`,
          }}
        />
      )}

      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        strokeWidth={edgeWidth}
        stroke={edgeColor}
        style={{
          ...style,
          strokeDasharray: selected ? undefined : EDGE_CONSTANTS.DASH_PATTERN,
          transition: 'stroke-width 0.2s, stroke 0.2s',
        }}
        markerEnd="url(#arrowhead)"
        markerStart={markerStart}
        fill="none"
      />

      {/* Animated dashes for non-selected edges */}
      <style>
        {`
        @keyframes dashAnimation {
          to {
            stroke-dashoffset: ${EDGE_CONSTANTS.DASH_OFFSET};
          }
        }
      `}
      </style>
      {!selected && (
        <path
          d={path}
          fill="none"
          strokeWidth={edgeWidth}
          stroke={edgeColor}
          strokeDasharray={EDGE_CONSTANTS.DASH_PATTERN}
          style={{
            animation: `dashAnimation ${EDGE_CONSTANTS.DASH_ANIMATION_DURATION} linear infinite`,
            pointerEvents: 'none',
          }}
        />
      )}

      <path
        d={path}
        fill="none"
        strokeWidth={EDGE_CONSTANTS.INTERACTION_STROKE_WIDTH}
        stroke="transparent"
        className="react-flow__edge-interaction"
        style={{ cursor: 'pointer' }}
      />
      {label && (
        <g style={{ pointerEvents: 'none' }}>
          {/* Estimate label width (rough approximation) */}
          {(() => {
            const labelText = String(label);
            const labelLength = labelText.length;
            const labelWidth = Math.max(
              EDGE_CONSTANTS.MIN_LABEL_WIDTH,
              Math.min(
                EDGE_CONSTANTS.MAX_LABEL_WIDTH,
                labelLength * EDGE_CONSTANTS.LABEL_CHAR_WIDTH,
              ),
            );
            const labelHeight = EDGE_CONSTANTS.LABEL_HEIGHT;
            const padding = EDGE_CONSTANTS.LABEL_PADDING;

            return (
              <>
                {/* Background for label with shadow for better visibility */}
                <rect
                  x={labelX - labelWidth / 2 - padding / 2}
                  y={labelY - labelHeight / 2}
                  width={labelWidth + padding}
                  height={labelHeight}
                  rx={EDGE_CONSTANTS.LABEL_BORDER_RADIUS}
                  ry={EDGE_CONSTANTS.LABEL_BORDER_RADIUS}
                  className="fill-white dark:fill-slate-800"
                  stroke={edgeColor}
                  strokeWidth={EDGE_CONSTANTS.LABEL_STROKE_WIDTH}
                  strokeOpacity={EDGE_CONSTANTS.LABEL_STROKE_OPACITY}
                  filter="url(#labelShadow)"
                />
                {/* Label text */}
                <text
                  x={labelX}
                  y={labelY + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-700 dark:fill-slate-300"
                  fontSize={EDGE_CONSTANTS.LABEL_FONT_SIZE}
                  fontWeight={
                    selected
                      ? EDGE_CONSTANTS.LABEL_FONT_WEIGHT_SELECTED
                      : EDGE_CONSTANTS.LABEL_FONT_WEIGHT_DEFAULT
                  }
                >
                  {label}
                </text>
              </>
            );
          })()}
        </g>
      )}
      {/* Define shadow filter for label backgrounds and arrowhead marker */}
      <defs>
        <filter id="labelShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
        </filter>
        <marker
          id="arrowhead"
          markerWidth={EDGE_CONSTANTS.ARROW_WIDTH}
          markerHeight={EDGE_CONSTANTS.ARROW_HEIGHT}
          refX={EDGE_CONSTANTS.ARROW_REF_X}
          refY={EDGE_CONSTANTS.ARROW_REF_Y}
          orient="auto"
        >
          <polygon
            points={`0 0, ${EDGE_CONSTANTS.ARROW_WIDTH} ${EDGE_CONSTANTS.ARROW_REF_Y}, 0 ${EDGE_CONSTANTS.ARROW_HEIGHT}`}
            fill={edgeColor}
            stroke={edgeColor}
          />
        </marker>
      </defs>
    </>
  );
};

export const AngledEdge = memo(AngledEdgeComponent);
AngledEdge.displayName = 'AngledEdge';

export default AngledEdge;
