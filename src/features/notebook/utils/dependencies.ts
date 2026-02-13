import { NotebookCell } from '@models/notebook';
import { ensureCellRef, NOTEBOOK_CELL_REF_PREFIX } from '@utils/notebook';

import { extractCellReferences, normalizeCellName } from './cell-naming';
import { getFlowScopeClient } from '../../../workers/flowscope-client';

export type CellDependencyMap = Map<string, string[]>;

function getProvidedNames(cell: NotebookCell): Set<string> {
  const names = new Set<string>();
  if (cell.type !== 'sql') return names;

  names.add(ensureCellRef(cell.id, cell.ref));
  const userName = normalizeCellName(cell.name);
  if (userName) names.add(userName);

  return names;
}

export function buildAvailableCellNames(sortedCells: NotebookCell[]): Set<string> {
  const names = new Set<string>();
  sortedCells.forEach((cell) => {
    const provided = getProvidedNames(cell);
    for (const name of provided) {
      names.add(name);
    }
  });
  return names;
}

export function computeCellDependencies(
  sortedCells: NotebookCell[],
  availableNames: Set<string>,
): CellDependencyMap {
  const deps = new Map<string, string[]>();

  for (let i = 0; i < sortedCells.length; i += 1) {
    const cell = sortedCells[i];
    if (cell.type !== 'sql') continue;

    const ownNames = getProvidedNames(cell);
    const namesExcludingSelf = new Set([...availableNames].filter((name) => !ownNames.has(name)));
    const refs = extractCellReferences(cell.content, namesExcludingSelf);
    if (refs.length > 0) {
      deps.set(cell.id, refs);
    }
  }

  return deps;
}

function stripIdentifierWrapping(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) return '';

  // Remove single layer of common SQL identifier quoting.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function buildIdentifierCandidates(identifier?: string): string[] {
  if (!identifier) return [];

  const parts = identifier
    .split('.')
    .map((part) => stripIdentifierWrapping(part))
    .filter(Boolean);

  const candidates = new Set<string>();
  const raw = stripIdentifierWrapping(identifier);
  if (raw) candidates.add(raw);
  if (parts.length > 0) {
    candidates.add(parts.join('.'));
    candidates.add(parts[parts.length - 1]);
  }

  return [...candidates];
}

async function extractCellReferencesFromLineage(
  sql: string,
  availableNames: Set<string>,
): Promise<string[] | null> {
  if (!sql.trim()) return [];

  const canonicalByLower = new Map<string, string>();
  for (const name of availableNames) {
    canonicalByLower.set(name.toLowerCase(), name);
  }

  try {
    const analysis = await getFlowScopeClient().analyze(sql, undefined, 'duckdb');
    if (analysis.summary.hasErrors || analysis.statements.length === 0) {
      return null;
    }

    const references: string[] = [];
    const seen = new Set<string>();
    const refPrefix = NOTEBOOK_CELL_REF_PREFIX.toLowerCase();

    for (const statement of analysis.statements) {
      for (const node of statement.nodes) {
        if (node.type !== 'table' && node.type !== 'view') continue;

        const candidates = [
          ...buildIdentifierCandidates(node.label),
          ...buildIdentifierCandidates(node.qualifiedName),
        ];

        for (const candidate of candidates) {
          const canonicalName = canonicalByLower.get(candidate.toLowerCase());
          if (canonicalName) {
            if (seen.has(canonicalName)) continue;
            seen.add(canonicalName);
            references.push(canonicalName);
            continue;
          }

          if (candidate.toLowerCase().startsWith(refPrefix)) {
            if (seen.has(candidate)) continue;
            seen.add(candidate);
            references.push(candidate);
          }
        }
      }
    }

    return references;
  } catch (_error) {
    return null;
  }
}

export async function computeCellDependenciesWithLineage(
  sortedCells: NotebookCell[],
  availableNames: Set<string>,
): Promise<CellDependencyMap> {
  const depEntries = await Promise.all(
    sortedCells.map(async (cell) => {
      if (cell.type !== 'sql') return null;

      const ownNames = getProvidedNames(cell);
      const namesExcludingSelf = new Set([...availableNames].filter((name) => !ownNames.has(name)));
      const lineageRefs = await extractCellReferencesFromLineage(cell.content, namesExcludingSelf);
      const refs =
        lineageRefs && lineageRefs.length > 0
          ? lineageRefs
          : extractCellReferences(cell.content, namesExcludingSelf);
      if (refs.length === 0) return null;

      return [cell.id, refs] as const;
    }),
  );

  const deps = new Map<string, string[]>();
  for (const entry of depEntries) {
    if (!entry) continue;
    deps.set(entry[0], entry[1]);
  }

  return deps;
}

export type ResolvedDependencyGraph = {
  edges: Map<string, Set<string>>;
  duplicateNameCells: Set<string>;
  unresolvedReferences: Map<string, string[]>;
};

export function buildResolvedDependencyGraph(
  sortedCells: NotebookCell[],
  dependencies: CellDependencyMap,
): ResolvedDependencyGraph {
  const nameToProviderCellIds = new Map<string, Set<string>>();
  const duplicateNameCells = new Set<string>();

  sortedCells.forEach((cell) => {
    if (cell.type !== 'sql') return;
    const provided = getProvidedNames(cell);
    for (const rawName of provided) {
      const name = rawName.toLowerCase();
      if (!nameToProviderCellIds.has(name)) {
        nameToProviderCellIds.set(name, new Set<string>());
      }
      const providers = nameToProviderCellIds.get(name)!;
      if (providers.size > 0 && !providers.has(cell.id)) {
        for (const providerCellId of providers) {
          duplicateNameCells.add(providerCellId);
        }
        duplicateNameCells.add(cell.id);
      }
      providers.add(cell.id);
    }
  });

  const edges = new Map<string, Set<string>>();
  const unresolvedReferences = new Map<string, string[]>();

  sortedCells.forEach((cell) => {
    if (cell.type !== 'sql') return;
    const refs = dependencies.get(cell.id) ?? [];
    if (!edges.has(cell.id)) edges.set(cell.id, new Set<string>());
    const unresolvedForCell: string[] = [];

    for (const ref of refs) {
      const providers = nameToProviderCellIds.get(ref.toLowerCase());
      if (!providers || providers.size === 0) {
        unresolvedForCell.push(ref);
        continue;
      }

      if (providers.size > 1) {
        unresolvedForCell.push(ref);
        continue;
      }

      const providerCellId = [...providers][0];
      if (providerCellId === cell.id) continue;
      edges.get(cell.id)?.add(providerCellId);
    }

    if (unresolvedForCell.length > 0) {
      unresolvedReferences.set(cell.id, unresolvedForCell);
    }
  });

  return { edges, duplicateNameCells, unresolvedReferences };
}

export function detectCircularDependencyCells(graph: Map<string, Set<string>>): Set<string> {
  const visitState = new Map<string, 'visiting' | 'visited'>();
  const path: string[] = [];
  const cyclicCells = new Set<string>();

  const visit = (cellId: string) => {
    visitState.set(cellId, 'visiting');
    path.push(cellId);

    const deps = graph.get(cellId);
    if (deps) {
      for (const depId of deps) {
        const depState = visitState.get(depId);
        if (depState === 'visiting') {
          const cycleStart = path.indexOf(depId);
          if (cycleStart >= 0) {
            for (let i = cycleStart; i < path.length; i += 1) {
              cyclicCells.add(path[i]);
            }
          }
          cyclicCells.add(depId);
        } else if (depState !== 'visited') {
          visit(depId);
        }
      }
    }

    path.pop();
    visitState.set(cellId, 'visited');
  };

  for (const cellId of graph.keys()) {
    if (!visitState.has(cellId)) {
      visit(cellId);
    }
  }

  return cyclicCells;
}

export function findUpstreamDependencyCells(
  targetCellId: string,
  graph: Map<string, Set<string>>,
): Set<string> {
  const upstreamCellIds = new Set<string>();
  const stack = [targetCellId];

  while (stack.length > 0) {
    const nextCellId = stack.pop();
    if (!nextCellId || upstreamCellIds.has(nextCellId)) continue;

    upstreamCellIds.add(nextCellId);
    const providers = graph.get(nextCellId);
    if (!providers) continue;

    for (const providerCellId of providers) {
      if (!upstreamCellIds.has(providerCellId)) {
        stack.push(providerCellId);
      }
    }
  }

  return upstreamCellIds;
}

export function expandSelectionWithUpstreamDependencies(
  selectedCellIds: Set<string>,
  graph: Map<string, Set<string>>,
): Set<string> {
  const expanded = new Set<string>(selectedCellIds);
  const stack = [...selectedCellIds];

  while (stack.length > 0) {
    const nextCellId = stack.pop();
    if (!nextCellId) continue;

    const providers = graph.get(nextCellId);
    if (!providers) continue;

    for (const providerCellId of providers) {
      if (expanded.has(providerCellId)) continue;
      expanded.add(providerCellId);
      stack.push(providerCellId);
    }
  }

  return expanded;
}

export function buildConsumersByProvider(
  graph: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const consumersByProvider = new Map<string, Set<string>>();

  for (const [consumerCellId, providerCellIds] of graph.entries()) {
    for (const providerCellId of providerCellIds) {
      if (!consumersByProvider.has(providerCellId)) {
        consumersByProvider.set(providerCellId, new Set<string>());
      }
      consumersByProvider.get(providerCellId)?.add(consumerCellId);
    }
  }

  return consumersByProvider;
}

export function findDownstreamDependencyCells(
  targetCellId: string,
  graph: Map<string, Set<string>>,
): Set<string> {
  const consumersByProvider = buildConsumersByProvider(graph);

  const downstreamCellIds = new Set<string>();
  const queue = [targetCellId];

  while (queue.length > 0) {
    const nextCellId = queue.shift();
    if (!nextCellId || downstreamCellIds.has(nextCellId)) continue;

    downstreamCellIds.add(nextCellId);
    const consumers = consumersByProvider.get(nextCellId);
    if (!consumers) continue;

    for (const consumerCellId of consumers) {
      if (!downstreamCellIds.has(consumerCellId)) {
        queue.push(consumerCellId);
      }
    }
  }

  return downstreamCellIds;
}

export function findCellsReferencingTargetCell(
  targetCellId: string,
  sortedCells: NotebookCell[],
  dependencies: CellDependencyMap,
): string[] {
  const { edges } = buildResolvedDependencyGraph(sortedCells, dependencies);
  const refs: string[] = [];

  for (const [cellId, deps] of edges.entries()) {
    if (cellId === targetCellId) continue;
    if (deps.has(targetCellId)) refs.push(cellId);
  }

  return refs;
}

export function findStaleCells(
  executedCellId: string,
  sortedCells: NotebookCell[],
  dependencies: CellDependencyMap,
): Set<string> {
  const { edges } = buildResolvedDependencyGraph(sortedCells, dependencies);

  // Reverse graph: provider -> consumers
  const consumersByProvider = buildConsumersByProvider(edges);

  const staleCellIds = new Set<string>();
  const queue = [...(consumersByProvider.get(executedCellId) ?? [])];

  while (queue.length > 0) {
    const cellId = queue.shift();
    if (!cellId || staleCellIds.has(cellId)) continue;
    staleCellIds.add(cellId);
    const nextConsumers = consumersByProvider.get(cellId);
    if (nextConsumers) {
      queue.push(...nextConsumers);
    }
  }

  return staleCellIds;
}
