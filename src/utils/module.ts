import type { ModuleNode } from '../data';

export function buildCompanyList(modules: ModuleNode[]): string[] {
  const names = new Set<string>();

  modules.forEach((module) => {
    module.userStats.companies.forEach((company) => {
      const normalized = company.name.trim();
      if (normalized) {
        names.add(normalized);
      }
    });
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
}

export function buildProductList(modules: ModuleNode[]): string[] {
  const products = new Set<string>();
  modules.forEach((module) => {
    if (module.productName) {
      products.add(module.productName);
    }
  });
  return Array.from(products).sort((a, b) => a.localeCompare(b, 'ru'));
}

export function recalculateReuseScores(modules: ModuleNode[]): ModuleNode[] {
  if (modules.length === 0) {
    return modules;
  }

  const integrationMap = buildModuleIntegrationMap(modules);
  const denominator = Math.max(1, modules.length - 1);

  return modules.map((module) => {
    const connections = integrationMap.get(module.id);
    const score = connections ? Math.min(1, connections.size / denominator) : 0;
    return { ...module, reuseScore: score };
  });
}

function buildModuleIntegrationMap(modules: ModuleNode[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  modules.forEach((module) => {
    map.set(module.id, new Set());
  });

  const artifactConsumers = new Map<string, Set<string>>();

  modules.forEach((module) => {
    module.dataIn.forEach((input) => {
      if (!input.sourceId) {
        return;
      }
      const consumers = artifactConsumers.get(input.sourceId) ?? new Set<string>();
      consumers.add(module.id);
      artifactConsumers.set(input.sourceId, consumers);
    });
  });

  modules.forEach((module) => {
    module.dependencies.forEach((dependencyId) => {
      if (!map.has(dependencyId) || dependencyId === module.id) {
        return;
      }
      map.get(module.id)?.add(dependencyId);
      map.get(dependencyId)?.add(module.id);
    });

    module.dataOut.forEach((output) => {
      if (!output.artifactId) {
        return;
      }
      const consumers = artifactConsumers.get(output.artifactId);
      consumers?.forEach((consumerId) => {
        if (!map.has(consumerId) || consumerId === module.id) {
          return;
        }
        map.get(module.id)?.add(consumerId);
        map.get(consumerId)?.add(module.id);
      });
    });
  });

  return map;
}
