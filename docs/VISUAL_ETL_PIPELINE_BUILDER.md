# Visual ETL Pipeline Builder Design Document

## Executive Summary

A visual ETL (Extract, Transform, Load) pipeline builder for PondPilot's Tauri version that provides a drag-and-drop interface for constructing data transformation workflows. Built on ReactFlow, this feature will compile visual pipelines into optimized DuckDB SQL queries, making data transformation accessible to both technical and non-technical users.

## Core Objectives

1. **Democratize Data Transformation**: Enable users without SQL expertise to perform complex data transformations
2. **Maintain Performance**: Leverage DuckDB's query optimization to ensure visual pipelines perform as well as hand-written SQL
3. **Seamless Integration**: Work harmoniously with PondPilot's existing features (file access, AI assistance, persistence)
4. **Bidirectional Workflow**: Support both visual-to-SQL and SQL-to-visual conversions
5. **Enterprise Readiness**: Include version control, templates, and collaboration features

## Architecture Overview

### Technology Stack
- **UI Framework**: ReactFlow for node-based visual programming
- **State Management**: Zustand (consistent with existing architecture)
- **Execution Engine**: DuckDB-WASM
- **Persistence**: IndexedDB for pipeline storage
- **Code Generation**: Custom SQL compiler for pipeline-to-query conversion

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface Layer                  │
├─────────────────────────────────────────────────────────┤
│  Pipeline Canvas │ Node Palette │ Properties Panel      │
│  (ReactFlow)     │              │                       │
├─────────────────────────────────────────────────────────┤
│                  Pipeline Engine Layer                   │
├─────────────────────────────────────────────────────────┤
│  Node Registry │ SQL Compiler │ Execution Controller    │
├─────────────────────────────────────────────────────────┤
│                    Data Layer                           │
├─────────────────────────────────────────────────────────┤
│  DuckDB-WASM │ File System API │ IndexedDB             │
└─────────────────────────────────────────────────────────┘
```

## Node Taxonomy

### 1. Input Nodes

#### File Source Node
```typescript
interface FileSourceNode {
  type: 'input/file';
  config: {
    fileHandle?: FileSystemFileHandle;
    filePath?: string;
    format: 'csv' | 'parquet' | 'json' | 'excel';
    options: {
      header?: boolean;
      delimiter?: string;
      encoding?: string;
      sheet?: string; // for Excel
    };
  };
  output: {
    schema: TableSchema;
    sampleData: any[];
    rowCount: number;
  };
}
```

#### Query Source Node
```typescript
interface QuerySourceNode {
  type: 'input/query';
  config: {
    tabId?: string; // Reference to existing tab
    sql?: string;   // Inline SQL
    parameters?: Record<string, any>;
  };
  output: {
    schema: TableSchema;
    sampleData: any[];
  };
}
```

#### Motherduck Source Node
```typescript
interface MotherduckSourceNode {
  type: 'input/motherduck';
  config: {
    database: string;
    table: string;
    credentials: {
      token: string; // Encrypted
    };
  };
}
```

#### API Source Node
```typescript
interface APISourceNode {
  type: 'input/api';
  config: {
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: any;
    pagination?: {
      type: 'offset' | 'cursor' | 'page';
      config: Record<string, any>;
    };
  };
}
```

### 2. Transform Nodes

#### Filter Node
```typescript
interface FilterNode {
  type: 'transform/filter';
  config: {
    conditions: Array<{
      column: string;
      operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL';
      value: any;
      logicalOperator?: 'AND' | 'OR';
    }>;
    customSQL?: string; // Advanced mode
  };
}
```

#### Join Node
```typescript
interface JoinNode {
  type: 'transform/join';
  config: {
    joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
    leftInput: string;  // Node ID
    rightInput: string; // Node ID
    conditions: Array<{
      leftColumn: string;
      rightColumn: string;
      operator: '=' | '!=' | '>' | '<' | '>=' | '<=';
    }>;
  };
}
```

#### Aggregate Node
```typescript
interface AggregateNode {
  type: 'transform/aggregate';
  config: {
    groupBy: string[];
    aggregations: Array<{
      column: string;
      function: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'COUNT_DISTINCT' | 'STRING_AGG' | 'ARRAY_AGG';
      alias: string;
    }>;
    having?: FilterNode['config']['conditions'];
  };
}
```

#### Window Function Node
```typescript
interface WindowNode {
  type: 'transform/window';
  config: {
    partitionBy: string[];
    orderBy: Array<{
      column: string;
      direction: 'ASC' | 'DESC';
    }>;
    functions: Array<{
      type: 'ROW_NUMBER' | 'RANK' | 'DENSE_RANK' | 'LAG' | 'LEAD' | 'SUM' | 'AVG';
      column?: string;
      offset?: number;
      alias: string;
    }>;
  };
}
```

#### Pivot Node
```typescript
interface PivotNode {
  type: 'transform/pivot';
  config: {
    index: string[];      // Group by columns
    columns: string;      // Column to pivot
    values: string;       // Values column
    aggFunc: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
  };
}
```

#### Custom Transform Node
```typescript
interface CustomTransformNode {
  type: 'transform/custom';
  config: {
    sql?: string;
    pythonUDF?: string; // Future: Python UDFs via Pyodide
    jsUDF?: string;     // JavaScript UDFs
  };
}
```

#### AI Transform Node
```typescript
interface AITransformNode {
  type: 'transform/ai';
  config: {
    prompt: string;
    model: 'gpt-4' | 'claude-3' | 'local';
    examples?: Array<{
      input: any[];
      output: any[];
    }>;
  };
}
```

### 3. Output Nodes

#### Export Node
```typescript
interface ExportNode {
  type: 'output/export';
  config: {
    format: 'csv' | 'parquet' | 'json' | 'excel';
    destination: 'download' | 'file' | 'clipboard';
    filename?: string;
    options: {
      header?: boolean;
      delimiter?: string;
      compression?: 'gzip' | 'snappy' | 'lz4';
    };
  };
}
```

#### Visualization Node
```typescript
interface VisualizationNode {
  type: 'output/visualization';
  config: {
    chartType: 'line' | 'bar' | 'scatter' | 'pie' | 'heatmap' | 'sankey';
    x?: string;
    y?: string | string[];
    color?: string;
    size?: string;
    options: Record<string, any>;
  };
}
```

#### Table Output Node
```typescript
interface TableOutputNode {
  type: 'output/table';
  config: {
    name: string;
    mode: 'CREATE' | 'CREATE OR REPLACE' | 'APPEND';
    persistent: boolean;
  };
}
```

## Pipeline Execution Model

### Execution Strategies

#### 1. Lazy Execution
- Pipelines are compiled to SQL but not executed until requested
- Allows for optimization across the entire pipeline
- Generates a single, optimized DuckDB query when possible

#### 2. Incremental Execution
- Only re-executes nodes affected by changes
- Caches intermediate results in temporary tables
- Uses DuckDB's query result caching

#### 3. Streaming Execution
- For large datasets, processes data in chunks
- Implements backpressure to prevent memory overflow
- Suitable for real-time data sources

### SQL Compilation

```typescript
class PipelineCompiler {
  compile(pipeline: Pipeline): string {
    // Topological sort of nodes
    const sorted = this.topologicalSort(pipeline.nodes, pipeline.edges);
    
    // Generate CTEs for each node
    const ctes: string[] = [];
    for (const node of sorted) {
      const cte = this.compileNode(node, pipeline);
      ctes.push(cte);
    }
    
    // Combine into final query
    return `WITH ${ctes.join(',\n')} SELECT * FROM ${sorted[sorted.length - 1].id}`;
  }
  
  compileNode(node: ETLNode, pipeline: Pipeline): string {
    const compiler = this.nodeCompilers[node.type];
    return compiler.compile(node, pipeline);
  }
}
```

### Optimization Techniques

1. **Query Folding**: Combine multiple transformations into single SQL operations
2. **Predicate Pushdown**: Move filters closer to data sources
3. **Column Pruning**: Only select columns needed downstream
4. **Join Reordering**: Optimize join order based on statistics
5. **Materialization Points**: Identify where to cache intermediate results

## User Interface Design

### Pipeline Canvas

```typescript
interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  selection: string[];
  clipboard: Node[];
}
```

### Component Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Toolbar                                                      │
│  [New] [Open] [Save] [Export] [Run] [Settings]              │
├────────────┬─────────────────────────────────┬──────────────┤
│            │                                   │              │
│   Node     │      Pipeline Canvas             │  Properties  │
│   Palette  │      (ReactFlow)                 │    Panel     │
│            │                                   │              │
│  ┌──────┐  │    ┌──────┐     ┌──────┐       │  ┌─────────┐ │
│  │Input │  │    │ File │────>│Filter│       │  │Selected │ │
│  ├──────┤  │    └──────┘     └──┬───┘       │  │  Node   │ │
│  │Trans │  │                     │           │  │Settings │ │
│  │ form │  │    ┌──────┐     ┌──v───┐       │  │         │ │
│  ├──────┤  │    │Table │────>│ Join │       │  │         │ │
│  │Output│  │    └──────┘     └──┬───┘       │  └─────────┘ │
│  └──────┘  │                     │           │              │
│            │                  ┌──v────┐      │              │
│            │                  │Export │      │              │
│            │                  └───────┘      │              │
├────────────┴─────────────────────────────────┴──────────────┤
│  Status Bar: [Nodes: 5] [Edges: 4] [Last Run: 2.3s]        │
└──────────────────────────────────────────────────────────────┘
```

### Interaction Patterns

#### Drag & Drop
- Drag nodes from palette to canvas
- Drag files from file explorer directly onto canvas
- Drag columns between nodes for quick mapping

#### Connection Rules
```typescript
interface ConnectionValidator {
  canConnect(source: Node, target: Node): {
    valid: boolean;
    reason?: string;
  };
  
  validateSchema(sourceSchema: Schema, targetNode: Node): boolean;
}
```

#### Context Menus
- Right-click on nodes for quick actions
- Right-click on edges to insert transform nodes
- Right-click on canvas for paste/arrange options

## Data Flow and State Management

### Pipeline State Store

```typescript
interface PipelineStore {
  // Current pipeline
  currentPipeline: Pipeline | null;
  
  // Execution state
  execution: {
    status: 'idle' | 'compiling' | 'running' | 'error';
    progress: number;
    results: Map<string, QueryResult>;
    errors: Map<string, Error>;
  };
  
  // UI state
  ui: {
    selectedNodes: string[];
    copiedNodes: Node[];
    zoom: number;
    panPosition: { x: number; y: number };
  };
  
  // Actions
  actions: {
    addNode: (node: Node) => void;
    removeNode: (nodeId: string) => void;
    updateNode: (nodeId: string, updates: Partial<Node>) => void;
    connect: (source: string, target: string) => void;
    disconnect: (edgeId: string) => void;
    execute: (mode: 'preview' | 'full') => Promise<void>;
    compile: () => string;
    save: () => Promise<void>;
    load: (id: string) => Promise<void>;
  };
}
```

### Integration with Existing Stores

```typescript
// Integration with tab store
interface TabStore {
  createPipelineTab(pipeline: Pipeline): Tab;
  convertTabToPipeline(tabId: string): Pipeline;
}

// Integration with query store
interface QueryStore {
  executePipelineQuery(sql: string): Promise<QueryResult>;
  cachePipelineResult(nodeId: string, result: QueryResult): void;
}
```

## Advanced Features

### 1. Intelligent Assistance

#### Schema Inference
```typescript
class SchemaInference {
  inferJoinConditions(left: Schema, right: Schema): JoinCondition[] {
    // Match on common column names
    // Match on foreign key patterns (_id, _key)
    // Use AI for semantic matching
  }
  
  suggestTransformations(schema: Schema, goal: string): Node[] {
    // AI-powered transformation suggestions
    // Based on data types and patterns
  }
}
```

#### Auto-layout
```typescript
class PipelineLayout {
  autoLayout(nodes: Node[], edges: Edge[]): Node[] {
    // Dagre/ELK.js for automatic layout
    // Minimize edge crossings
    // Maintain logical flow direction
  }
}
```

### 2. Pipeline Templates

```typescript
interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: 'data-cleaning' | 'analysis' | 'reporting' | 'ml-prep';
  tags: string[];
  pipeline: Pipeline;
  parameters: Array<{
    name: string;
    type: 'string' | 'number' | 'column' | 'table';
    description: string;
    default?: any;
  }>;
}

// Example templates
const templates: PipelineTemplate[] = [
  {
    id: 'dedup-clean',
    name: 'Data Deduplication & Cleaning',
    description: 'Remove duplicates and clean common data issues',
    category: 'data-cleaning',
    pipeline: {
      nodes: [
        { type: 'transform/deduplicate', /* ... */ },
        { type: 'transform/clean-nulls', /* ... */ },
        { type: 'transform/standardize', /* ... */ }
      ]
    }
  }
];
```

### 3. Version Control

```typescript
interface PipelineVersion {
  id: string;
  pipelineId: string;
  version: number;
  timestamp: Date;
  author: string;
  message: string;
  snapshot: Pipeline;
  diff?: PipelineDiff;
}

class PipelineVersionControl {
  commit(pipeline: Pipeline, message: string): PipelineVersion;
  revert(versionId: string): Pipeline;
  diff(v1: Pipeline, v2: Pipeline): PipelineDiff;
  merge(base: Pipeline, theirs: Pipeline): Pipeline;
}
```

### 4. Performance Monitoring

```typescript
interface NodeMetrics {
  nodeId: string;
  executionTime: number;
  rowsProcessed: number;
  memoryUsed: number;
  cacheHits: number;
}

class PerformanceMonitor {
  profilePipeline(pipeline: Pipeline): Map<string, NodeMetrics>;
  suggestOptimizations(metrics: Map<string, NodeMetrics>): Optimization[];
}
```

### 5. Export/Import Formats

```typescript
interface PipelineExportFormat {
  // Native format (JSON)
  toJSON(): string;
  fromJSON(json: string): Pipeline;
  
  // SQL export
  toSQL(): string;
  
  // Python/Pandas export
  toPython(): string;
  
  // Apache Airflow DAG
  toAirflow(): string;
  
  // dbt models
  toDBT(): string;
}
```

## Implementation Roadmap

### Phase 1: Foundation (MVP)
- [ ] Basic ReactFlow integration
- [ ] Core node types (File, Filter, Join, Export)
- [ ] Simple SQL compilation
- [ ] Manual execution
- [ ] Basic persistence

### Phase 2: Enhanced Functionality
- [ ] Complete node library
- [ ] Advanced SQL compilation with optimization
- [ ] Preview mode with sampling
- [ ] Schema inference and validation
- [ ] Error handling and debugging

### Phase 3: Intelligence
- [ ] AI-powered transformations
- [ ] Auto-suggestions
- [ ] Smart templates
- [ ] Performance optimization
- [ ] Auto-layout

### Phase 4: Collaboration
- [ ] Version control
- [ ] Pipeline sharing
- [ ] Export to various formats
- [ ] Pipeline documentation generation
- [ ] Team templates

### Phase 5: Advanced Features
- [ ] Custom node creation
- [ ] Python/JS UDFs
- [ ] Real-time streaming
- [ ] Scheduling and automation
- [ ] Advanced monitoring

## Technical Considerations

### Performance Requirements
- Handle pipelines with 100+ nodes
- Sub-second compilation for typical pipelines
- Interactive preview with <100ms latency
- Support datasets up to 10GB locally

### Browser Compatibility
- Chrome/Edge: Full support (File System Access API)
- Firefox/Safari: Fallback file handling
- Mobile: View-only mode

### Security Considerations
- Sanitize custom SQL inputs
- Validate file access permissions
- Encrypt stored credentials
- Audit pipeline executions

### Testing Strategy
- Unit tests for node compilers
- Integration tests for pipeline execution
- E2E tests for UI interactions
- Performance benchmarks
- Visual regression tests for canvas

## Success Metrics

1. **Adoption Metrics**
   - % of users creating pipelines
   - Average nodes per pipeline
   - Pipeline execution frequency

2. **Performance Metrics**
   - Compilation time
   - Execution time vs. raw SQL
   - Memory usage

3. **Quality Metrics**
   - Error rate
   - Pipeline success rate
   - User-reported issues

4. **Engagement Metrics**
   - Time spent in pipeline builder
   - Templates used
   - Pipelines shared

## Conclusion

The Visual ETL Pipeline Builder will transform PondPilot from a SQL-centric tool into a comprehensive data transformation platform. By maintaining a focus on performance, usability, and integration with existing features, this addition will significantly expand PondPilot's user base while preserving its core strengths of privacy, performance, and local-first architecture.

The modular design allows for incremental development, with each phase delivering value while building toward a complete visual data transformation solution that rivals enterprise ETL tools while running entirely in the browser.