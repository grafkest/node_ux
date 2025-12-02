import type { GraphLink, ModuleNode, ArtifactNode, Initiative } from '../data';

export function buildModuleLinks(
  modules: ModuleNode[],
  artifacts: ArtifactNode[],
  allowedDomainIds: Set<string>
): GraphLink[] {
  const artifactMap = new Map<string, ArtifactNode>();
  artifacts.forEach((artifact) => artifactMap.set(artifact.id, artifact));

  return modules.flatMap((module) => {
    const domainLinks: GraphLink[] = module.domains
      .filter((domainId) => allowedDomainIds.has(domainId))
      .map((domainId) => ({
        source: module.id,
        target: domainId,
        type: 'domain'
      }));

    const dependencyLinks: GraphLink[] = module.dependencies.map((dependencyId) => ({
      source: module.id,
      target: dependencyId,
      type: 'dependency'
    }));

    const produceLinks: GraphLink[] = module.produces.map((artifactId) => ({
      source: module.id,
      target: artifactId,
      type: 'produces'
    }));

    const consumeLinks: GraphLink[] = module.dataIn
      .filter((input) => input.sourceId && artifactMap.has(input.sourceId))
      .map((input) => ({
        source: input.sourceId as string,
        target: module.id,
        type: 'consumes'
      }));

    return [...domainLinks, ...dependencyLinks, ...produceLinks, ...consumeLinks];
  });
}

export function buildInitiativeLinks(
  initiatives: Initiative[],
  allowedDomainIds: Set<string>
): GraphLink[] {
  return initiatives.flatMap((initiative) => {
    const domainLinks: GraphLink[] = initiative.domains
      .filter((domainId) => allowedDomainIds.has(domainId))
      .map((domainId) => ({
        source: initiative.id,
        target: domainId,
        type: 'initiative-domain'
      }));

    const moduleLinks: GraphLink[] = initiative.plannedModuleIds.map((moduleId) => ({
      source: initiative.id,
      target: moduleId,
      type: 'initiative-plan'
    }));

    return [...domainLinks, ...moduleLinks];
  });
}

export type LinkEndpoint = string | { id: string };

export function getLinkEndpointId(value: LinkEndpoint): string {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return value.id;
  }

  return value;
}

