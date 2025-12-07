import type {
  ModuleMetrics,
  ModuleNode,
  NonFunctionalRequirements
} from '../data';
import type { ModuleDraftPayload } from '../features/admin/types';
import { clampNumber, deduplicateNonEmpty } from './common';

export type ModuleBuildResult = {
  module: ModuleNode;
  consumedArtifactIds: string[];
};

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

export function buildModuleFromDraft(
  moduleId: string,
  draft: ModuleDraftPayload,
  fallbackDomains: string[],
  allowedDomainIds: Set<string>,
  options: { fallbackName: string }
): ModuleBuildResult | null {
  const normalizedName = draft.name.trim() || options.fallbackName;
  const normalizedDescription = draft.description.trim() || 'Описание не заполнено';
  const normalizedProduct = draft.productName.trim() || 'Новый продукт';
  const normalizedCreatorCompany =
    draft.creatorCompany.trim() || 'Компания создатель не указана';

  const uniqueDomains = deduplicateNonEmpty(draft.domainIds).filter((id) => allowedDomainIds.has(id));
  const fallbackCandidates = deduplicateNonEmpty(fallbackDomains).filter((id) => allowedDomainIds.has(id));
  const resolvedDomains = uniqueDomains.length > 0 ? uniqueDomains : fallbackCandidates;
  if (resolvedDomains.length === 0) {
    return null;
  }

  const dependencies = deduplicateNonEmpty(draft.dependencyIds).filter((id) => id !== moduleId);

  const preparedInputs = (draft.dataIn.length > 0
    ? draft.dataIn
    : [{ id: '', label: '', sourceId: undefined }]
  ).map((input, index) => ({
    id: input.id?.trim() || `input-${index + 1}`,
    label: input.label.trim() || `Вход ${index + 1}`,
    sourceId: input.sourceId?.trim() || undefined
  }));
  const consumedArtifactIds = deduplicateNonEmpty(preparedInputs.map((input) => input.sourceId ?? null));

  const preparedOutputs = (draft.dataOut.length > 0
    ? draft.dataOut
    : [{ id: '', label: '', artifactId: undefined }]
  ).map((output, index) => ({
    id: output.id?.trim() || `output-${index + 1}`,
    label: output.label.trim() || `Выход ${index + 1}`,
    artifactId: output.artifactId?.trim() || undefined
  }));
  const produces = deduplicateNonEmpty(preparedOutputs.map((output) => output.artifactId ?? null));

  const technologyStack = deduplicateNonEmpty(draft.technologyStack.map((item) => item.trim())).filter(Boolean);

  const preparedTeam = (draft.projectTeam.length > 0
    ? draft.projectTeam
    : [{ id: '', fullName: '', role: 'Аналитик' }]
  ).map((member, index) => ({
    id: member.id?.trim() || `member-${index + 1}`,
    fullName: member.fullName.trim() || `Участник ${index + 1}`,
    role: member.role
  }));

  const libraries = draft.libraries
    .map((library) => ({ name: library.name.trim(), version: library.version.trim() }))
    .filter((library) => library.name || library.version)
    .map((library) => ({
      name: library.name || 'Не указано',
      version: library.version || '—'
    }));

  const ridOwnerCompany = draft.ridOwner.company.trim() || 'Не указано';
  const ridOwnerDivision = draft.ridOwner.division.trim() || 'Не указано';

  const localization = draft.localization.trim() || 'ru';

  const normalizedCompanies = draft.userStats.companies
    .map((company) => {
      const name = company.name?.trim() ?? '';
      const licenses = Math.max(0, Math.trunc(typeof company.licenses === 'number' ? company.licenses : 0));
      if (!name) {
        return null;
      }
      return { name, licenses };
    })
    .filter((company): company is { name: string; licenses: number } => company !== null);

  const mergedCompanies = new Map<string, number>();
  normalizedCompanies.forEach((company) => {
    mergedCompanies.set(company.name, (mergedCompanies.get(company.name) ?? 0) + company.licenses);
  });

  const userStats = {
    companies: Array.from(mergedCompanies.entries())
      .map(([name, licenses]) => ({ name, licenses }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  };

  const reuseScore = clampNumber(draft.reuseScore ?? 0, 0, 100);
  const metrics: ModuleMetrics = {
    coverage: clampNumber(draft.metrics.coverage ?? 0, 0, 100),
    tests: Math.max(0, draft.metrics.tests ?? 0),
    automationRate: clampNumber(draft.metrics.automationRate ?? 0, 0, 100)
  };

  const nonFunctional: NonFunctionalRequirements = {
    responseTimeMs: Math.max(0, draft.nonFunctional.responseTimeMs ?? 0),
    throughputRps: Math.max(0, draft.nonFunctional.throughputRps ?? 0),
    resourceConsumption: draft.nonFunctional.resourceConsumption.trim() || '—',
    baselineUsers: Math.max(0, draft.nonFunctional.baselineUsers ?? 0)
  };

  const module: ModuleNode = {
    id: moduleId,
    name: normalizedName,
    description: normalizedDescription,
    domains: resolvedDomains,
    creatorCompany: normalizedCreatorCompany,
    productName: normalizedProduct,
    projectTeam: preparedTeam,
    technologyStack,
    localization,
    ridOwner: { company: ridOwnerCompany, division: ridOwnerDivision },
    userStats,
    status: draft.status,
    repository: draft.repository?.trim() || undefined,
    api: draft.api?.trim() || undefined,
    specificationUrl: draft.specificationUrl.trim() || '#',
    apiContractsUrl: draft.apiContractsUrl.trim() || '#',
    techDesignUrl: draft.techDesignUrl.trim() || '#',
    architectureDiagramUrl: draft.architectureDiagramUrl.trim() || '#',
    licenseServerIntegrated: draft.licenseServerIntegrated,
    libraries,
    clientType: draft.clientType,
    deploymentTool: draft.deploymentTool,
    dependencies,
    produces,
    reuseScore,
    metrics,
    dataIn: preparedInputs,
    dataOut: preparedOutputs,
    formula: draft.formula.trim(),
    nonFunctional
  };

  return { module, consumedArtifactIds };
}
