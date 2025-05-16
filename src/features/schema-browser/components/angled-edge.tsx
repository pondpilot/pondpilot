import { memo } from 'react';
import { EdgeProps, getStraightPath } from 'reactflow';

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
  const gap = 50; // Gap between node edge and connection bend

  if (sourcePosition === 'right' && targetPosition === 'left') {
    // Horizontal connection with vertical offset handling
    if (Math.abs(sourceY - targetY) < 5) {
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

  const edgeColor = selected ? '#3b82f6' : '#94a3b8';
  const edgeWidth = selected ? 3 : 2;

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
          strokeWidth={edgeWidth + 6}
          stroke={edgeColor}
          strokeOpacity={0.3}
          fill="none"
          className="react-flow__edge-glow"
          style={{
            filter: 'blur(4px)',
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
          strokeDasharray: selected ? undefined : '5,5',
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
            stroke-dashoffset: -10;
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
          strokeDasharray="5,5"
          style={{
            animation: 'dashAnimation 1s linear infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      <path
        d={path}
        fill="none"
        strokeWidth={20}
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
            const labelWidth = Math.max(40, Math.min(120, labelLength * 7));
            const labelHeight = 20;
            const padding = 12;

            return (
              <>
                {/* Background for label with shadow for better visibility */}
                <rect
                  x={labelX - labelWidth / 2 - padding / 2}
                  y={labelY - labelHeight / 2}
                  width={labelWidth + padding}
                  height={labelHeight}
                  rx={10}
                  ry={10}
                  className="fill-white dark:fill-slate-800"
                  stroke={edgeColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.8}
                  filter="url(#labelShadow)"
                />
                {/* Label text */}
                <text
                  x={labelX}
                  y={labelY + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-700 dark:fill-slate-300"
                  fontSize={12}
                  fontWeight={selected ? 600 : 400}
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
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
          <polygon points="0 0, 10 5, 0 10" fill={edgeColor} stroke={edgeColor} />
        </marker>
      </defs>
    </>
  );
};

export const AngledEdge = memo(AngledEdgeComponent);
AngledEdge.displayName = 'AngledEdge';

export default AngledEdge;
