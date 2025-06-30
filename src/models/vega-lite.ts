// Vega-Lite type definitions for chart specifications

export interface VegaLiteSpec {
  $schema: string;
  title?: string;
  description?: string;
  width?: number | 'container';
  height?: number | 'container';
  padding?: number | { left?: number; right?: number; top?: number; bottom?: number };
  autosize?: 'fit' | 'fit-x' | 'fit-y' | 'none' | 'pad';

  data?: {
    values?: any[];
    url?: string;
    name?: string;
  };

  mark: VegaLiteMark | VegaLiteMarkDef;

  encoding?: {
    x?: VegaLiteEncoding;
    y?: VegaLiteEncoding;
    color?: VegaLiteEncoding;
    size?: VegaLiteEncoding;
    shape?: VegaLiteEncoding;
    opacity?: VegaLiteEncoding;
    tooltip?: VegaLiteEncoding | VegaLiteEncoding[];
    [key: string]: VegaLiteEncoding | VegaLiteEncoding[] | undefined;
  };

  layer?: VegaLiteSpec[];
  concat?: VegaLiteSpec[];
  vconcat?: VegaLiteSpec[];
  hconcat?: VegaLiteSpec[];

  transform?: VegaLiteTransform[];

  config?: VegaLiteConfig;
}

export type VegaLiteMark =
  | 'area'
  | 'bar'
  | 'circle'
  | 'line'
  | 'point'
  | 'rect'
  | 'rule'
  | 'square'
  | 'text'
  | 'tick'
  | 'trail'
  | 'geoshape'
  | 'boxplot'
  | 'errorband'
  | 'errorbar';

export interface VegaLiteMarkDef {
  type: VegaLiteMark;
  tooltip?: boolean;
  interpolate?: string;
  tension?: number;
  orient?: 'horizontal' | 'vertical';
  shape?: string;
  [key: string]: any;
}

export interface VegaLiteEncoding {
  field?: string;
  type?: 'quantitative' | 'temporal' | 'ordinal' | 'nominal' | 'geojson';
  aggregate?: 'count' | 'sum' | 'average' | 'mean' | 'median' | 'min' | 'max';
  bin?: boolean | { maxbins?: number };
  timeUnit?: string;
  title?: string;
  scale?: {
    domain?: any[];
    range?: any[];
    type?: string;
    zero?: boolean;
    nice?: boolean;
    [key: string]: any;
  };
  axis?: {
    title?: string;
    format?: string;
    labelAngle?: number;
    [key: string]: any;
  };
  legend?: {
    title?: string;
    orient?: string;
    [key: string]: any;
  };
  sort?: 'ascending' | 'descending' | string[] | null;
  [key: string]: any;
}

export interface VegaLiteTransform {
  filter?: any;
  calculate?: { as: string; calculate: string };
  aggregate?: Array<{ op: string; field?: string; as: string }>;
  bin?: { field: string; as: string };
  [key: string]: any;
}

export interface VegaLiteConfig {
  background?: string;
  padding?: number | { left?: number; right?: number; top?: number; bottom?: number };

  mark?: {
    color?: string;
    [key: string]: any;
  };

  axis?: {
    labelColor?: string;
    titleColor?: string;
    gridColor?: string;
    domainColor?: string;
    tickColor?: string;
    [key: string]: any;
  };

  legend?: {
    labelColor?: string;
    titleColor?: string;
    [key: string]: any;
  };

  title?: {
    color?: string;
    fontSize?: number;
    [key: string]: any;
  };

  view?: {
    stroke?: string;
    [key: string]: any;
  };

  [key: string]: any;
}

// Type guard to validate Vega-Lite specifications
export function isValidVegaLiteSpec(spec: any): spec is VegaLiteSpec {
  return (
    spec &&
    typeof spec === 'object' &&
    typeof spec.$schema === 'string' &&
    spec.$schema.includes('vega-lite') &&
    spec.mark !== undefined &&
    (typeof spec.mark === 'string' || (typeof spec.mark === 'object' && spec.mark.type))
  );
}

// Validate encoding types
export function isValidEncodingType(type: string | undefined): boolean {
  return (
    type !== undefined &&
    ['quantitative', 'temporal', 'ordinal', 'nominal', 'geojson'].includes(type)
  );
}

// Validate mark types
export function isValidMarkType(mark: string): mark is VegaLiteMark {
  return [
    'area',
    'bar',
    'circle',
    'line',
    'point',
    'rect',
    'rule',
    'square',
    'text',
    'tick',
    'trail',
    'geoshape',
    'boxplot',
    'errorband',
    'errorbar',
  ].includes(mark);
}
