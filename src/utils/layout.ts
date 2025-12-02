import type { GraphLayoutNodePosition } from '../types/graph';

const MAX_LAYOUT_SPAN = 1800;

export function normalizeLayoutPositions(
  positions: Record<string, GraphLayoutNodePosition>,
  maxSpan = MAX_LAYOUT_SPAN
): { positions: Record<string, GraphLayoutNodePosition>; changed: boolean } {
  const entries = Object.entries(positions);
  if (entries.length === 0) {
    return { positions, changed: false };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  entries.forEach(([, position]) => {
    if (!position) {
      return;
    }

    if (typeof position.x === 'number' && Number.isFinite(position.x)) {
      minX = Math.min(minX, position.x);
      maxX = Math.max(maxX, position.x);
    }

    if (typeof position.y === 'number' && Number.isFinite(position.y)) {
      minY = Math.min(minY, position.y);
      maxY = Math.max(maxY, position.y);
    }
  });

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY)
  ) {
    return { positions, changed: false };
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const span = Math.max(width, height);

  if (!Number.isFinite(span) || span <= 0 || span <= maxSpan) {
    return { positions, changed: false };
  }

  const scale = maxSpan / span;
  if (!Number.isFinite(scale) || scale <= 0) {
    return { positions, changed: false };
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  let changed = false;
  const normalized: Record<string, GraphLayoutNodePosition> = {};

  entries.forEach(([id, position]) => {
    if (!position) {
      return;
    }

    const { x, y, fx, fy } = position;
    if (
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      typeof y !== 'number' ||
      !Number.isFinite(y)
    ) {
      normalized[id] = position;
      return;
    }

    const normalizedX = roundCoordinate(centerX + (x - centerX) * scale);
    const normalizedY = roundCoordinate(centerY + (y - centerY) * scale);
    const next: GraphLayoutNodePosition = { x: normalizedX, y: normalizedY };

    if (typeof fx === 'number' && Number.isFinite(fx)) {
      const normalizedFx = roundCoordinate(centerX + (fx - centerX) * scale);
      next.fx = normalizedFx;
      if (normalizedFx !== fx) {
        changed = true;
      }
    }

    if (typeof fy === 'number' && Number.isFinite(fy)) {
      const normalizedFy = roundCoordinate(centerY + (fy - centerY) * scale);
      next.fy = normalizedFy;
      if (normalizedFy !== fy) {
        changed = true;
      }
    }

    if (normalizedX !== x || normalizedY !== y) {
      changed = true;
    }

    normalized[id] = next;
  });

  if (!changed) {
    return { positions, changed: false };
  }

  return { positions: normalized, changed: true };
}

export function needsEngineLayoutCapture(
  layout: Record<string, GraphLayoutNodePosition>,
  activeIds: Set<string>
): boolean {
  for (const id of activeIds) {
    const position = layout[id];
    if (!position) {
      return true;
    }

    if (typeof position.x !== 'number' || Number.isNaN(position.x)) {
      return true;
    }

    if (typeof position.y !== 'number' || Number.isNaN(position.y)) {
      return true;
    }
  }

  return false;
}

export function mergeLayoutPositions(
  prev: Record<string, GraphLayoutNodePosition>,
  next: Record<string, GraphLayoutNodePosition>
): Record<string, GraphLayoutNodePosition> {
  const merged: Record<string, GraphLayoutNodePosition> = { ...prev };

  Object.entries(next).forEach(([id, position]) => {
    const existing = merged[id];
    if (!existing || !layoutPositionsEqual(existing, position)) {
      merged[id] = position;
    }
  });

  return merged;
}

export function pruneLayoutPositions(
  positions: Record<string, GraphLayoutNodePosition>,
  activeIds: Set<string>
): Record<string, GraphLayoutNodePosition> {
  const result: Record<string, GraphLayoutNodePosition> = {};

  Object.entries(positions).forEach(([id, position]) => {
    if (activeIds.has(id)) {
      result[id] = position;
    }
  });

  return result;
}

export function layoutsEqual(
  prev: Record<string, GraphLayoutNodePosition>,
  next: Record<string, GraphLayoutNodePosition>
): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  return prevKeys.every((key) => {
    const prevPosition = prev[key];
    const nextPosition = next[key];

    if (!nextPosition) {
      return false;
    }

    return layoutPositionsEqual(prevPosition, nextPosition);
  });
}

export function layoutPositionsEqual(
  prev: GraphLayoutNodePosition,
  next: GraphLayoutNodePosition
): boolean {
  if (prev.x !== next.x || prev.y !== next.y) {
    return false;
  }

  const prevFx = prev.fx ?? null;
  const nextFx = next.fx ?? null;
  if (prevFx !== nextFx) {
    return false;
  }

  const prevFy = prev.fy ?? null;
  const nextFy = next.fy ?? null;
  return prevFy === nextFy;
}

export function resolveInitialModulePosition(
  positions: Record<string, GraphLayoutNodePosition>,
  anchorIds: string[]
): GraphLayoutNodePosition | null {
  const anchors = anchorIds
    .map((id) => positions[id])
    .filter((position): position is GraphLayoutNodePosition => Boolean(position));
  const fallbackEntries = Object.values(positions);

  const anchorValues = extractAxisValues(anchors);
  const fallbackValues = extractAxisValues(fallbackEntries);

  const xValues = anchorValues.x.length > 0 ? anchorValues.x : fallbackValues.x;
  const yValues = anchorValues.y.length > 0 ? anchorValues.y : fallbackValues.y;

  if (xValues.length === 0 || yValues.length === 0) {
    return { x: 0, y: 0 };
  }

  const anchorAverageX =
    anchorValues.x.length > 0
      ? anchorValues.x.reduce((sum, value) => sum + value, 0) / anchorValues.x.length
      : Math.max(...xValues);
  const averageY = yValues.reduce((sum, value) => sum + value, 0) / yValues.length;

  const horizontalOffset = anchorValues.x.length > 0 ? 80 : 140;
  const jitterSeed = Object.keys(positions).length;
  const verticalJitter = ((jitterSeed % 5) - 2) * 45;

  return {
    x: roundCoordinate(anchorAverageX + horizontalOffset),
    y: roundCoordinate(averageY + verticalJitter)
  };
}

function extractAxisValues(positions: GraphLayoutNodePosition[]): {
  x: number[];
  y: number[];
} {
  const x = positions
    .map((position) => getAxisCoordinate(position, 'x'))
    .filter((value): value is number => value !== null);
  const y = positions
    .map((position) => getAxisCoordinate(position, 'y'))
    .filter((value): value is number => value !== null);

  return { x, y };
}

function getAxisCoordinate(
  position: GraphLayoutNodePosition,
  axis: 'x' | 'y'
): number | null {
  const fixed = axis === 'x' ? position.fx : position.fy;
  if (typeof fixed === 'number' && Number.isFinite(fixed)) {
    return fixed;
  }

  const fallback = axis === 'x' ? position.x : position.y;
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback;
  }

  return null;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

