import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import {
  assignExpertsToWorkItems,
  buildCandidatesFromReport,
  buildRoleMatchReports,
  selectPinnedExperts,
  type RolePlanningDraft
} from '../../../utils/initiativeMatching';
import { preparePlannerModuleSelections } from '../../../utils/initiativePlanner';
import type { InitiativeCreationRequest } from '../../../types/initiativeCreation';
import { getSkillNameById } from '../../../data/skills';
import type {
  ExpertProfile,
  Initiative,
  InitiativeApprovalStage,
  InitiativeRequirement,
  InitiativeRolePlan,
  InitiativeRoleWork,
  InitiativeWork,
  ModuleDraftPayload,
  ModuleNode
} from '../../../data';
import type { ModuleDraftPrefillRequest } from '../../admin/types';
import { createEntityId } from '../../../utils/common';

type UseInitiativeActionsOptions = {
  initiativeData: Initiative[];
  expertProfiles: ExpertProfile[];
  moduleData: ModuleNode[];
  setInitiativeData: (initiatives: Initiative[] | ((prev: Initiative[]) => Initiative[])) => void;
  markGraphDirty: () => void;
  showAdminNotice: (type: 'success' | 'error', message: string) => void;
  moduleDraftPrefillIdRef: MutableRefObject<number>;
  setModuleDraftPrefill: Dispatch<SetStateAction<ModuleDraftPrefillRequest | null>>;
};

export function useInitiativeActions({
  initiativeData,
  expertProfiles,
  moduleData,
  setInitiativeData,
  markGraphDirty,
  showAdminNotice,
  moduleDraftPrefillIdRef,
  setModuleDraftPrefill
}: UseInitiativeActionsOptions) {
  const patchInitiative = useCallback(
    (initiativeId: string, updater: (initiative: Initiative) => Initiative) => {
      let didChange = false;
      setInitiativeData((prev) =>
        prev.map((initiative) => {
          if (initiative.id !== initiativeId) {
            return initiative;
          }
          const next = updater(initiative);
          if (next !== initiative) {
            didChange = true;
          }
          return next;
        })
      );
      if (didChange) {
        markGraphDirty();
      }
    },
    [markGraphDirty, setInitiativeData]
  );

  const handleToggleInitiativePin = useCallback(
    (initiativeId: string, roleId: string, expertId: string) => {
      patchInitiative(initiativeId, (initiative) => {
        let updated = false;
        const roles = initiative.roles.map((role) => {
          if (role.id !== roleId) {
            return role;
          }
          const hasExpert = role.pinnedExpertIds.includes(expertId);
          let nextPinned = hasExpert
            ? role.pinnedExpertIds.filter((id) => id !== expertId)
            : [...role.pinnedExpertIds, expertId];
          if (!hasExpert && role.required > 0 && nextPinned.length > role.required) {
            nextPinned = nextPinned.slice(nextPinned.length - role.required);
          }
          const pinnedChanged =
            nextPinned.length !== role.pinnedExpertIds.length ||
            nextPinned.some((id, index) => role.pinnedExpertIds[index] !== id);

          let workItemsChanged = false;
          let updatedWorkItems: typeof role.workItems = role.workItems;

          if (role.workItems && role.workItems.length > 0) {
            const nextWorkItems = role.workItems.map((item, index) => {
              const nextAssigned =
                nextPinned.length > 0 ? nextPinned[index % nextPinned.length] : undefined;
              if (nextAssigned === item.assignedExpertId) {
                return item;
              }
              workItemsChanged = true;
              return { ...item, assignedExpertId: nextAssigned };
            });
            if (workItemsChanged) {
              updated = true;
              updatedWorkItems = nextWorkItems;
            }
          }

          if (pinnedChanged) {
            updated = true;
          }
          if (!updated) {
            return role;
          }
          return {
            ...role,
            pinnedExpertIds: nextPinned,
            workItems: updatedWorkItems,
            lastUpdated: new Date().toISOString()
          };
        });

        if (!updated) {
          return initiative;
        }

        return { ...initiative, roles, lastUpdated: new Date().toISOString() };
      });
    },
    [patchInitiative]
  );

  const handleAddInitiativeRisk = useCallback(
    (
      initiativeId: string,
      payload: { description: string; severity: Initiative['risks'][number]['severity'] }
    ) => {
      const description = payload.description.trim();
      if (!description) {
        return;
      }
      patchInitiative(initiativeId, (initiative) => {
        const riskId = `${initiative.id}-risk-${Date.now()}`;
        const risk = {
          id: riskId,
          description,
          severity: payload.severity,
          createdAt: new Date().toISOString()
        } satisfies Initiative['risks'][number];
        return {
          ...initiative,
          risks: [...initiative.risks, risk],
          lastUpdated: new Date().toISOString()
        };
      });
    },
    [patchInitiative]
  );

  const handleRemoveInitiativeRisk = useCallback(
    (initiativeId: string, riskId: string) => {
      patchInitiative(initiativeId, (initiative) => {
        const nextRisks = initiative.risks.filter((risk) => risk.id !== riskId);
        if (nextRisks.length === initiative.risks.length) {
          return initiative;
        }
        return { ...initiative, risks: nextRisks, lastUpdated: new Date().toISOString() };
      });
    },
    [patchInitiative]
  );

  const handleInitiativeStatusChange = useCallback(
    (initiativeId: string, status: Initiative['status']) => {
      patchInitiative(initiativeId, (initiative) => {
        if (initiative.status === status) {
          return initiative;
        }
        return { ...initiative, status, lastUpdated: new Date().toISOString() };
      });
    },
    [patchInitiative]
  );

  const handleInitiativeExport = useCallback(
    (initiativeId: string) => {
      const initiative = initiativeData.find((item) => item.id === initiativeId);
      if (!initiative) {
        return;
      }
      const expertMap = new Map(expertProfiles.map((expert) => [expert.id, expert]));
      const team: ModuleDraftPayload['projectTeam'] = [];

      initiative.roles.forEach((role) => {
        const orderedCandidates = [...role.candidates].sort((a, b) => b.score - a.score);
        const selected = new Set<string>();
        role.pinnedExpertIds.forEach((id) => {
          if (expertMap.has(id)) {
            selected.add(id);
          }
        });
        for (const candidate of orderedCandidates) {
          if (selected.size >= Math.max(1, role.required)) {
            break;
          }
          if (selected.has(candidate.expertId)) {
            continue;
          }
          if (!expertMap.has(candidate.expertId)) {
            continue;
          }
          selected.add(candidate.expertId);
        }
        Array.from(selected).forEach((expertId) => {
          const expert = expertMap.get(expertId);
          if (!expert) {
            return;
          }
          team.push({
            id: `${initiative.id}-${role.id}-${expertId}`,
            fullName: expert.fullName,
            role: role.role
          });
        });
      });

      const moduleCandidates = [...initiative.plannedModuleIds, ...initiative.potentialModules];
      const linkedModule = moduleCandidates
        .map((moduleId) => moduleData.find((module) => module.id === moduleId))
        .find((module): module is ModuleNode => Boolean(module));

      const productName = linkedModule?.productName?.trim()
        ? linkedModule.productName
        : initiative.targetModuleName;

      moduleDraftPrefillIdRef.current += 1;
      const prefillDraft: Partial<ModuleDraftPayload> = {};
      if (!linkedModule) {
        prefillDraft.name = initiative.targetModuleName;
        prefillDraft.productName = productName;
        prefillDraft.domainIds = initiative.domains;
      }
      if (team.length > 0) {
        prefillDraft.projectTeam = team;
      }
      if (initiative.requiredSkills.length > 0) {
        prefillDraft.nonFunctionalRequirements = {
          title: 'Выгружено из инициативы',
          items: initiative.requiredSkills.map((skill, index) => ({
            id: `${initiative.id}-skill-${index + 1}`,
            description: skill
          }))
        };
      }

      if (linkedModule) {
        setModuleDraftPrefill({
          id: moduleDraftPrefillIdRef.current,
          mode: 'edit',
          moduleId: linkedModule.id,
          draft: prefillDraft
        });
        showAdminNotice('success', 'Данные инициативы подготовлены. Откройте модуль для редактирования.');
        return;
      }

      setModuleDraftPrefill({
        id: moduleDraftPrefillIdRef.current,
        mode: 'create',
        draft: {
          ...prefillDraft,
          id: '',
          name: initiative.targetModuleName,
          description: initiative.description,
          status: 'in-dev',
          productName,
          creatorCompany: 'Не указан',
          ownerId: null,
          domains: initiative.domains,
          dataIn: [],
          dataOut: [],
          produces: initiative.potentialModules,
          dependencies: [],
          contributes: [],
          producesData: false,
          generatesAnalytics: false,
          isCritical: false,
          technologyStack: [],
          consumers: [],
          usageAreas: [],
          telemetry: [],
          contributions: [],
          sensitivity: [],
          operationalRequirements: [],
          deploymentTargets: [],
          producesBusinessValue: false,
          version: '1.0.0',
          sandboxStatus: 'not-available'
        }
      });
      showAdminNotice('success', 'Черновик модуля создан на основе инициативы.');
    },
    [
      expertProfiles,
      initiativeData,
      moduleData,
      moduleDraftPrefillIdRef,
      setModuleDraftPrefill,
      showAdminNotice
    ]
  );

  const handlePlannerCreateInitiative = useCallback(
    (request: InitiativeCreationRequest): Initiative => {
      const existingIds = new Set(initiativeData.map((initiative) => initiative.id));
      const initiativeId = createEntityId('initiative', request.name, existingIds);
      const expertNameById = new Map(expertProfiles.map((expert) => [expert.id, expert.fullName]));
      const normalizedName = request.name.trim() || `Новая инициатива ${existingIds.size + 1}`;
      const normalizedDescription = request.description.trim() || 'Описание не заполнено';
      const normalizedOwner = request.owner.trim() || 'Ответственный не указан';
      const normalizedImpact = request.expectedImpact.trim() || 'Эффект не оценён';
      const normalizedTarget = request.targetModuleName.trim() || normalizedName;
      const normalizedStartDate = request.startDate?.trim() || new Date().toISOString().slice(0, 10);
      const domains = request.domains.map((domain) => domain.trim()).filter(Boolean);
      const { potentialModules, plannedModuleIds } = preparePlannerModuleSelections(request.potentialModules);
      const roleEntries = request.roles.map((role, index) => {
        const roleId = role.id?.trim() || `${initiativeId}-role-${index + 1}`;
        const sanitizedWorkItems = role.workItems.map((item, workIndex) => ({
          id: item.id?.trim() || `${roleId}-work-${workIndex + 1}`,
          title: item.title.trim() || `Работа ${workIndex + 1}`,
          description: item.description.trim() || 'Описание не заполнено',
          startDay: Math.max(0, Math.round(item.startDay)),
          durationDays: Math.max(1, Math.round(item.durationDays)),
          effortDays: Math.max(1, Math.round(item.effortDays)),
          tasks: (item.tasks ?? [])
            .map((task) => task.skill.trim())
            .filter(Boolean)
        }));

        return {
          draft: {
            id: roleId,
            role: role.role,
            required: Math.max(1, Math.round(role.required)),
            skills: role.skills.map((skill) => skill.trim()).filter(Boolean),
            workItems: sanitizedWorkItems
          } satisfies RolePlanningDraft,
          comment: role.comment?.trim() || undefined
        };
      });

      const planningRoles = roleEntries.map((entry) => entry.draft);
      const matchReports = buildRoleMatchReports(planningRoles, expertProfiles);

      const roles: InitiativeRolePlan[] = planningRoles.map((planningRole, index) => {
        const report = matchReports[index];
        const candidates = buildCandidatesFromReport(report);
        const pinnedExpertIds = selectPinnedExperts(candidates, planningRole.required);
        const workItems: InitiativeRoleWork[] = assignExpertsToWorkItems(
          planningRole.workItems,
          pinnedExpertIds
        );

        return {
          id: planningRole.id,
          role: planningRole.role,
          required: planningRole.required,
          pinnedExpertIds,
          candidates,
          workItems
        };
      });

      const requiredSkillLabels = new Set<string>();
      const workScheduleLookup = new Map<
        string,
        { startDay: number; durationDays: number; roleName: InitiativeRolePlan['role'] }
      >();
      roleEntries.forEach((entry) => {
        entry.draft.skills.forEach((skillId) => {
          if (!skillId) {
            return;
          }
          requiredSkillLabels.add(getSkillNameById(skillId) ?? skillId);
        });
        entry.draft.workItems.forEach((item) => {
          workScheduleLookup.set(item.id, {
            startDay: item.startDay,
            durationDays: item.durationDays,
            roleName: entry.draft.role
          });
          item.tasks.forEach((taskId) => {
            if (!taskId) {
              return;
            }
            requiredSkillLabels.add(getSkillNameById(taskId) ?? taskId);
          });
        });
      });

      const requiredSkills = Array.from(requiredSkillLabels).sort((a, b) => a.localeCompare(b, 'ru'));

      const assignedExpertNameByWorkItem = new Map<string, string>();
      roles.forEach((rolePlan) => {
        (rolePlan.workItems ?? []).forEach((item) => {
          if (!item.assignedExpertId) {
            return;
          }
          const expertName = expertNameById.get(item.assignedExpertId) ?? item.assignedExpertId;
          assignedExpertNameByWorkItem.set(item.id, expertName);
        });
      });

      const workItems: InitiativeWorkItem[] = roles.flatMap((rolePlan) =>
        (rolePlan.workItems ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          assignedExpert: item.assignedExpertId ? expertNameById.get(item.assignedExpertId) : undefined,
          estimatedHours: Math.max(1, Math.round(item.effortDays)) * 8,
          status: 'planned' as InitiativeWorkItemStatus,
          startDate: new Date(
            Date.now() + (workScheduleLookup.get(item.id)?.startDay ?? 0) * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 10),
          endDate: new Date(
            Date.now() +
            ((workScheduleLookup.get(item.id)?.startDay ?? 0) +
              (workScheduleLookup.get(item.id)?.durationDays ?? 1)) *
              24 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 10),
          dependencies: [],
          initiativeId,
          roleId: rolePlan.id
        }))
      );

      const works: InitiativeWork[] = workItems.map((item) => ({
        id: `${initiativeId}-work-${item.id}`,
        title: item.title,
        description: item.description,
        effortHours: item.estimatedHours
      }));

      const requirements: InitiativeRequirement[] = roleEntries.map((entry) => ({
        id: `${entry.draft.id}-req`,
        role: entry.draft.role,
        skills: entry.draft.skills,
        count: entry.draft.required,
        comment: entry.comment
      }));

      const approvalStages: InitiativeApprovalStage[] = [];
      (request.approvalStages ?? []).forEach((stage, index) => {
        const trimmedTitle = stage.title.trim();
        const trimmedApprover = stage.approver.trim();
        const trimmedComment = stage.comment?.trim() ?? '';
        if (!trimmedTitle && !trimmedApprover && !trimmedComment) {
          return;
        }
        approvalStages.push({
          id: stage.id?.trim() || `${initiativeId}-approval-${index + 1}`,
          title: trimmedTitle || `Этап согласования ${index + 1}`,
          approver: trimmedApprover || 'Не назначен',
          status: stage.status ?? 'pending',
          comment: trimmedComment || undefined
        });
      });

      const initiative: Initiative = {
        id: initiativeId,
        name: normalizedName,
        description: normalizedDescription,
        domains,
        plannedModuleIds,
        requiredSkills,
        workItems,
        approvalStages,
        startDate: normalizedStartDate,
        status: request.status,
        owner: normalizedOwner,
        expectedImpact: normalizedImpact,
        targetModuleName: normalizedTarget,
        lastUpdated: new Date().toISOString(),
        risks: [],
        roles,
        potentialModules,
        works,
        requirements,
        customer: {
          companies: request.customer.companies.map((value) => value.trim()).filter((value) => value.length > 0),
          units: request.customer.units.map((value) => value.trim()).filter((value) => value.length > 0),
          representative: request.customer.representative.trim(),
          contact: request.customer.contact.trim(),
          comment: request.customer.comment?.trim() || undefined
        }
      };

      markGraphDirty();
      setInitiativeData((prev) => [...prev, initiative]);
      showAdminNotice('success', `Инициатива «${initiative.name}» создана.`);
      return initiative;
    },
    [expertProfiles, initiativeData, markGraphDirty, setInitiativeData, showAdminNotice]
  );

  const handlePlannerUpdateInitiative = useCallback(
    (initiativeId: string, request: InitiativeCreationRequest): Initiative => {
      const existing = initiativeData.find((initiative) => initiative.id === initiativeId);
      if (!existing) {
        throw new Error('Инициатива не найдена. Обновление невозможно.');
      }

      const normalizedName = request.name.trim() || existing.name;
      const normalizedDescription = request.description.trim() || existing.description;
      const normalizedOwner = request.owner.trim() || existing.owner;
      const normalizedImpact = request.expectedImpact.trim() || existing.expectedImpact;
      const normalizedTarget = request.targetModuleName.trim() || existing.targetModuleName;
      const normalizedStartDate = request.startDate?.trim() || existing.startDate || new Date().toISOString().slice(0, 10);
      const domains = request.domains.map((domain) => domain.trim()).filter(Boolean);
      const { potentialModules, plannedModuleIds } = preparePlannerModuleSelections(request.potentialModules);

      const roleEntries = request.roles.map((role, index) => {
        const roleId = role.id?.trim() || `${initiativeId}-role-${index + 1}`;
        const sanitizedWorkItems = role.workItems.map((item, workIndex) => ({
          id: item.id?.trim() || `${roleId}-work-${workIndex + 1}`,
          title: item.title.trim() || `Работа ${workIndex + 1}`,
          description: item.description.trim() || 'Описание не заполнено',
          startDay: Math.max(0, Math.round(item.startDay)),
          durationDays: Math.max(1, Math.round(item.durationDays)),
          effortDays: Math.max(1, Math.round(item.effortDays)),
          tasks: (item.tasks ?? [])
            .map((task) => task.skill.trim())
            .filter(Boolean)
        }));

        return {
          draft: {
            id: roleId,
            role: role.role,
            required: Math.max(1, Math.round(role.required)),
            skills: role.skills.map((skill) => skill.trim()).filter(Boolean),
            workItems: sanitizedWorkItems
          } satisfies RolePlanningDraft,
          comment: role.comment?.trim() || undefined
        };
      });

      const planningRoles = roleEntries.map((entry) => entry.draft);
      const matchReports = buildRoleMatchReports(planningRoles, expertProfiles);

      const roles: InitiativeRolePlan[] = planningRoles.map((planningRole, index) => {
        const report = matchReports[index];
        const candidates = buildCandidatesFromReport(report);
        const pinnedExpertIds = selectPinnedExperts(candidates, planningRole.required);
        const workItems: InitiativeRoleWork[] = assignExpertsToWorkItems(
          planningRole.workItems,
          pinnedExpertIds
        );

        return {
          id: planningRole.id,
          role: planningRole.role,
          required: planningRole.required,
          pinnedExpertIds,
          candidates,
          workItems
        };
      });

      const requiredSkillLabels = new Set<string>();
      const workScheduleLookup = new Map<
        string,
        { startDay: number; durationDays: number; roleName: InitiativeRolePlan['role'] }
      >();
      roleEntries.forEach((entry) => {
        entry.draft.skills.forEach((skillId) => {
          if (!skillId) {
            return;
          }
          requiredSkillLabels.add(getSkillNameById(skillId) ?? skillId);
        });
        entry.draft.workItems.forEach((item) => {
          workScheduleLookup.set(item.id, {
            startDay: item.startDay,
            durationDays: item.durationDays,
            roleName: entry.draft.role
          });
          item.tasks.forEach((taskId) => {
            if (!taskId) {
              return;
            }
            requiredSkillLabels.add(getSkillNameById(taskId) ?? taskId);
          });
        });
      });

      const requiredSkills = Array.from(requiredSkillLabels).sort((a, b) => a.localeCompare(b, 'ru'));

      const workItems: InitiativeWorkItem[] = roles.flatMap((rolePlan) =>
        (rolePlan.workItems ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          assignedExpert: item.assignedExpertId,
          estimatedHours: Math.max(1, Math.round(item.effortDays)) * 8,
          status: 'planned' as InitiativeWorkItemStatus,
          startDate: new Date(
            Date.now() + (workScheduleLookup.get(item.id)?.startDay ?? 0) * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 10),
          endDate: new Date(
            Date.now() +
            ((workScheduleLookup.get(item.id)?.startDay ?? 0) +
              (workScheduleLookup.get(item.id)?.durationDays ?? 1)) *
              24 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 10),
          dependencies: [],
          initiativeId,
          roleId: rolePlan.id
        }))
      );

      const works: InitiativeWork[] = workItems.map((item) => ({
        id: `${initiativeId}-work-${item.id}`,
        title: item.title,
        description: item.description,
        effortHours: item.estimatedHours
      }));

      const requirements: InitiativeRequirement[] = roleEntries.map((entry) => ({
        id: `${entry.draft.id}-req`,
        role: entry.draft.role,
        skills: entry.draft.skills,
        count: entry.draft.required,
        comment: entry.comment
      }));

      const approvalStages: InitiativeApprovalStage[] = [];
      (request.approvalStages ?? []).forEach((stage, index) => {
        const trimmedTitle = stage.title.trim();
        const trimmedApprover = stage.approver.trim();
        const trimmedComment = stage.comment?.trim() ?? '';
        if (!trimmedTitle && !trimmedApprover && !trimmedComment) {
          return;
        }
        approvalStages.push({
          id: stage.id?.trim() || `${initiativeId}-approval-${index + 1}`,
          title: trimmedTitle || `Этап согласования ${index + 1}`,
          approver: trimmedApprover || 'Не назначен',
          status: stage.status ?? 'pending',
          comment: trimmedComment || undefined
        });
      });

      const initiative: Initiative = {
        ...existing,
        name: normalizedName,
        description: normalizedDescription,
        domains,
        plannedModuleIds,
        requiredSkills,
        workItems,
        approvalStages,
        startDate: normalizedStartDate,
        status: request.status,
        owner: normalizedOwner,
        expectedImpact: normalizedImpact,
        targetModuleName: normalizedTarget,
        lastUpdated: new Date().toISOString(),
        risks: [...existing.risks],
        roles,
        potentialModules,
        works,
        requirements,
        customer: {
          companies: request.customer.companies.map((value) => value.trim()).filter((value) => value.length > 0),
          units: request.customer.units.map((value) => value.trim()).filter((value) => value.length > 0),
          representative: request.customer.representative.trim() || existing.customer.representative,
          contact: request.customer.contact.trim() || existing.customer.contact,
          comment: request.customer.comment?.trim() || existing.customer.comment
        }
      };

      markGraphDirty();
      setInitiativeData((prev) =>
        prev.map((candidate) => (candidate.id === initiativeId ? initiative : candidate))
      );
      showAdminNotice('success', `Инициатива «${initiative.name}» обновлена.`);
      return initiative;
    },
    [expertProfiles, initiativeData, markGraphDirty, setInitiativeData, showAdminNotice]
  );

  return {
    handleToggleInitiativePin,
    handleAddInitiativeRisk,
    handleRemoveInitiativeRisk,
    handleInitiativeStatusChange,
    handleInitiativeExport,
    handlePlannerCreateInitiative,
    handlePlannerUpdateInitiative,
    patchInitiative
  } as const;
}

