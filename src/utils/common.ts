export function collectSearchableValues(value: unknown, target: string[]): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    target.push(value);
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    target.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchableValues(item, target));
    return;
  }

  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => {
      collectSearchableValues(item, target);
    });
  }
}

export function deduplicateNonEmpty(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (!value) {
      return;
    }
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  });
  return result;
}

export function createEntityId(prefix: string, name: string, existing: Set<string>): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = normalized ? `${prefix}-${normalized}` : `${prefix}-${Date.now()}`;
  let candidate = base;
  let counter = 1;
  while (existing.has(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

export function clampNumber(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? value : min;
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

