import type { Initiative, InitiativeRequirement } from '../data';
import type { InitiativeCreationRequest } from '../types/initiativeCreation';

export function preparePlannerModuleSelections(moduleIds: string[]): {
  potentialModules: string[];
  plannedModuleIds: string[];
} {
  const normalized = moduleIds
    .map((moduleId) => moduleId.trim())
    .filter((moduleId) => moduleId.length > 0);

  const unique = Array.from(new Set(normalized));

  return {
    potentialModules: unique,
    plannedModuleIds: [...unique]
  };
}

const buildRoleRequirementLookup = (
  requirements: InitiativeRequirement[]
): Map<string, InitiativeRequirement> => {
  const lookup = new Map<string, InitiativeRequirement>();

  requirements.forEach((requirement) => {
    lookup.set(requirement.id, requirement);
    lookup.set(`${requirement.role}:${requirement.id}`, requirement);
  });

  return lookup;
};

export function buildCreationRequestFromInitiative(
  initiative: Initiative
): InitiativeCreationRequest {
  const moduleSelectionSet = new Set<string>([
    ...initiative.plannedModuleIds,
    ...initiative.potentialModules
  ]);
  const moduleSelections = Array.from(moduleSelectionSet).filter((id) => id.trim().length > 0);
  const requirementLookup = buildRoleRequirementLookup(initiative.requirements);

  return {
    name: initiative.name,
    description: initiative.description,
    owner: initiative.owner,
    expectedImpact: initiative.expectedImpact,
    targetModuleName: initiative.targetModuleName,
    status: initiative.status,
    domains: [...initiative.domains],
    potentialModules: moduleSelections,
    startDate: initiative.startDate,
    customer: {
      companies: [...(initiative.customer?.companies ?? [])],
      units: [...(initiative.customer?.units ?? [])],
      representative: initiative.customer?.representative ?? '',
      contact: initiative.customer?.contact ?? '',
      comment: initiative.customer?.comment
    },
    roles: initiative.roles.map((role) => {
      const fallbackRequirement =
        requirementLookup.get(`${role.role}:${role.id}-req`) ??
        requirementLookup.get(`${role.id}-req`) ??
        initiative.requirements.find((requirement) => requirement.role === role.role);

      return {
        id: role.id,
        role: role.role,
        required: role.required,
        skills: fallbackRequirement?.skills ?? [],
        comment: fallbackRequirement?.comment,
        workItems: (role.workItems ?? []).map((item, index) => ({
          id: item.id ?? `${role.id}-work-${index + 1}`,
          title: item.title,
          description: item.description,
          assumptions: undefined,
          startDay: item.startDay,
          durationDays: item.durationDays,
          effortDays: item.effortDays,
          tasks: (item.tasks ?? []).map((task, taskIndex) => ({
            id: `${item.id ?? `${role.id}-work-${index + 1}`}-task-${taskIndex + 1}`,
            skill: task
          }))
        }))
      };
    }),
    workItems: initiative.workItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      owner: item.owner,
      timeframe: item.timeframe,
      status: item.status
    })),
    approvalStages: initiative.approvalStages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      approver: stage.approver,
      status: stage.status,
      comment: stage.comment
    }))
  };
}
