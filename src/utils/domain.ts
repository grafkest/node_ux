import type { DomainNode } from '../data';

export function flattenDomainTree(domains: DomainNode[]): DomainNode[] {
  return domains.flatMap((domain) => [
    domain,
    ...(domain.children ? flattenDomainTree(domain.children) : [])
  ]);
}

export function addDomainToTree(
  domains: DomainNode[],
  parentId: string | undefined,
  newDomain: DomainNode
): DomainNode[] {
  if (!parentId) {
    return [...domains, newDomain];
  }

  const [next, inserted] = insertDomain(domains, parentId, newDomain);
  if (inserted) {
    return next;
  }

  return [...domains, newDomain];
}

export function insertDomain(
  domains: DomainNode[],
  parentId: string,
  newDomain: DomainNode
): [DomainNode[], boolean] {
  let inserted = false;
  const next = domains.map((domain) => {
    if (domain.id === parentId) {
      inserted = true;
      const children = domain.children ? [...domain.children, newDomain] : [newDomain];
      return { ...domain, children };
    }

    if (domain.children) {
      const [childUpdated, childInserted] = insertDomain(domain.children, parentId, newDomain);
      if (childInserted) {
        inserted = true;
        return { ...domain, children: childUpdated };
      }
    }

    return domain;
  });

  return [next, inserted];
}

export function removeDomainFromTree(
  domains: DomainNode[],
  targetId: string,
  parentId: string | null = null
): [DomainNode[], DomainNode | null, string | null] {
  let removed: DomainNode | null = null;
  let removedParent: string | null = null;

  const next = domains
    .map((domain) => {
      if (domain.id === targetId) {
        removed = domain;
        removedParent = parentId;
        return null;
      }

      if (domain.children) {
        const [children, childRemoved, childParent] = removeDomainFromTree(
          domain.children,
          targetId,
          domain.id
        );
        if (childRemoved) {
          removed = childRemoved;
          removedParent = childParent;
          return { ...domain, children };
        }
      }

      return domain;
    })
    .filter((domain): domain is DomainNode => Boolean(domain));

  return [next, removed, removedParent];
}

export function collectDomainIds(domain: DomainNode): string[] {
  const children = domain.children ?? [];
  return [domain.id, ...children.flatMap((child) => collectDomainIds(child))];
}

export function collectAttachableDomainIds(domains: DomainNode[]): string[] {
  const result: string[] = [];

  const visit = (nodes: DomainNode[], depth: number) => {
    nodes.forEach((node) => {
      if (depth > 0 && !node.isCatalogRoot) {
        result.push(node.id);
      }
      if (node.children) {
        visit(node.children, depth + 1);
      }
    });
  };

  visit(domains, 0);
  return result;
}

export function collectCatalogDomainIds(domains: DomainNode[]): string[] {
  return flattenDomainTree(domains)
    .filter((domain) => domain.isCatalogRoot)
    .map((domain) => domain.id);
}

export function buildDomainDescendants(domains: DomainNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  const visit = (node: DomainNode): string[] => {
    const collected = new Set<string>([node.id]);

    node.children?.forEach((child) => {
      visit(child).forEach((id) => collected.add(id));
    });

    map.set(node.id, Array.from(collected));
    return Array.from(collected);
  };

  domains.forEach((domain) => {
    visit(domain);
  });

  return map;
}

export function buildDomainAncestors(domains: DomainNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  const visit = (node: DomainNode, ancestors: string[]) => {
    map.set(node.id, ancestors);
    node.children?.forEach((child) => {
      visit(child, [...ancestors, node.id]);
    });
  };

  domains.forEach((domain) => visit(domain, []));

  return map;
}

export function filterDomainTreeByIds(domains: DomainNode[], allowed: Set<string>): DomainNode[] {
  if (allowed.size === 0) {
    return [];
  }

  return domains
    .map((domain) => {
      const children = domain.children ? filterDomainTreeByIds(domain.children, allowed) : [];
      const include = allowed.has(domain.id) || children.length > 0;

      if (!include) {
        return null;
      }

      return {
        ...domain,
        children: children.length > 0 ? children : undefined
      };
    })
    .filter((domain): domain is DomainNode => domain !== null);
}
