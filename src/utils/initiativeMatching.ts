import {
  buildRoleMatchReport,
  type ExpertSkillEvidence,
  type MatchableExpertProfile,
  type RoleMatchReport,
  type RoleRequirement,
  type SkillLevel,
  type SkillRequirement
} from '../services/matching';
import { getSkillLastUsedDate } from '../services/expertSkills';
import {
  getSkillsByRole,
  skills as skillCatalog,
  type ExpertProfile,
  type ExpertSkill,
  type InitiativeCandidate,
  type TeamRole,
  initiatives as initiativeCatalog
} from '../data';
import type { InitiativeRoleWork } from '../data';

const MS_IN_DAY = 86_400_000;

const skillLevelMap: Record<ExpertSkill['level'], SkillLevel> = {
  A: 'novice',
  W: 'intermediate',
  P: 'advanced',
  Ad: 'expert',
  E: 'expert'
};

const initiativeNameMap = new Map(initiativeCatalog.map((item) => [item.id, item.name]));

const defaultRoleLevel: Partial<Record<TeamRole, SkillLevel>> = {
  Архитектор: 'expert',
  'Эксперт R&D': 'expert',
  Backend: 'advanced',
  Frontend: 'advanced',
  Аналитик: 'advanced',
  UX: 'intermediate',
  'Руководитель проекта': 'advanced',
  'Владелец продукта': 'advanced',
  Тестировщик: 'intermediate'
};

export type RolePlanningWorkDraft = {
  id: string;
  title: string;
  description: string;
  startDay: number;
  durationDays: number;
  effortDays: number;
  tasks: string[];
};

export type RolePlanningDraft = {
  id: string;
  role: TeamRole;
  required: number;
  skills: string[];
  workItems: RolePlanningWorkDraft[];
};

function resolveSkillName(skillId: string): string {
  const definition = skillCatalog[skillId];
  if (definition) {
    return definition.name;
  }
  return skillId
    .split('-')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function toSkillEvidence(skill: ExpertSkill): ExpertSkillEvidence {
  const name = resolveSkillName(skill.id);
  const rawDate = getSkillLastUsedDate(skill);
  const timestamp = rawDate ? Date.parse(rawDate) : Number.NaN;
  const daysAgo = Number.isNaN(timestamp)
    ? undefined
    : Math.max(0, Math.round((Date.now() - timestamp) / MS_IN_DAY));

  const initiativeIds = new Set<string>();
  skill.evidence
    .filter((entry) => entry.initiativeId)
    .forEach((entry) => {
      const trimmed = entry.initiativeId?.trim();
      if (trimmed) {
        initiativeIds.add(trimmed);
      }
    });

  const initiativeRefs = Array.from(initiativeIds).map((id) => {
    const name = initiativeNameMap.get(id);
    return name ? `${name} (${id})` : id;
  });

  return {
    id: skill.id,
    name,
    level: skillLevelMap[skill.level] ?? 'novice',
    lastUsedDaysAgo: daysAgo ?? 365,
    status: skill.proofStatus,
    sourceInitiatives: initiativeRefs
  };
}

function toMatchableExpert(expert: ExpertProfile): MatchableExpertProfile {
  const skillEvidence = expert.skills.map(toSkillEvidence);
  const totalFte = expert.skills.reduce((sum, skill) => sum + Math.max(0, skill.availableFte), 0);
  const fteCapacity = totalFte > 0 ? Math.min(1, totalFte) : undefined;

  return {
    ...expert,
    skillEvidence,
    fteCapacity
  };
}

type NormalizedSkill = {
  id?: string;
  name: string;
};

const skillDefinitions = Object.values(skillCatalog);

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function lookupSkillDefinition(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  const direct = skillCatalog[trimmed];
  if (direct) {
    return direct;
  }
  const lower = trimmed.toLowerCase();
  const lowerIdMatch = skillCatalog[lower];
  if (lowerIdMatch) {
    return lowerIdMatch;
  }
  return skillDefinitions.find((definition) => definition.name.toLowerCase() === lower);
}

function normalizeSkillInput(skill: string | NormalizedSkill): NormalizedSkill | null {
  if (typeof skill !== 'string') {
    const id = skill.id?.trim();
    const name = skill.name.trim();
    if (!id && !name) {
      return null;
    }
    if (id) {
      const definition = lookupSkillDefinition(id);
      if (definition) {
        return { id: definition.id, name: definition.name };
      }
      return { id, name: name || slugToTitle(id) };
    }
    const definition = lookupSkillDefinition(name);
    if (definition) {
      return { id: definition.id, name: definition.name };
    }
    return { name };
  }

  const trimmed = skill.trim();
  if (!trimmed) {
    return null;
  }

  const definition = lookupSkillDefinition(trimmed);
  if (definition) {
    return { id: definition.id, name: definition.name };
  }

  if (/^[a-z0-9-]+$/i.test(trimmed)) {
    return { id: trimmed.toLowerCase(), name: slugToTitle(trimmed) };
  }

  return { name: trimmed };
}

function normalizeSkillList(inputs: (string | NormalizedSkill)[]): NormalizedSkill[] {
  const seen = new Set<string>();
  const result: NormalizedSkill[] = [];

  inputs.forEach((input) => {
    const normalized = normalizeSkillInput(input);
    if (!normalized) {
      return;
    }

    const key = normalized.id?.toLowerCase() ?? normalized.name.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(normalized);
  });

  return result;
}

function buildSkillRequirements(role: RolePlanningDraft): SkillRequirement[] {
  const explicitSkills = normalizeSkillList(role.skills);
  const taskSkills = normalizeSkillList(role.workItems.flatMap((work) => work.tasks));
  const providedSkills = normalizeSkillList([...explicitSkills, ...taskSkills]);

  const defaultSkills =
    providedSkills.length > 0
      ? []
      : getSkillsByRole(role.role).map((skill) => ({ id: skill.id, name: skill.name }));

  const allSkills = normalizeSkillList([...providedSkills, ...defaultSkills]);
  const normalizedSkills =
    allSkills.length > 0 ? allSkills : [{ name: `Экспертиза: ${role.role}` }];
  const weight = normalizedSkills.length > 0 ? 1 / normalizedSkills.length : 1;
  const level = defaultRoleLevel[role.role] ?? 'advanced';

  return normalizedSkills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    weight,
    requiredLevel: level
  }));
}

function estimateRequiredFte(role: RolePlanningDraft): number {
  if (role.workItems.length === 0) {
    return Math.max(1, role.required);
  }

  const normalized = role.workItems.map((item) => ({
    start: Math.max(0, Math.round(item.startDay)),
    end: Math.max(0, Math.round(item.startDay + item.durationDays)),
    effort: Math.max(0, Math.round(item.effortDays))
  }));

  const earliestStart = Math.min(...normalized.map((item) => item.start));
  const latestEnd = Math.max(...normalized.map((item) => item.end));
  const span = Math.max(latestEnd - earliestStart, 1);
  const totalEffort = normalized.reduce((sum, item) => sum + item.effort, 0);
  const calculatedFte = span > 0 ? totalEffort / span : totalEffort;

  return Math.max(role.required, Number.isFinite(calculatedFte) ? calculatedFte : role.required);
}

function buildRequirement(role: RolePlanningDraft): RoleRequirement {
  return {
    roleId: role.id,
    roleName: role.role,
    requiredFte: estimateRequiredFte(role),
    skills: buildSkillRequirements(role)
  };
}

export function buildRoleMatchReports(
  roles: RolePlanningDraft[],
  experts: ExpertProfile[]
): RoleMatchReport[] {
  if (roles.length === 0 || experts.length === 0) {
    return roles.map((role) => ({
      requirement: buildRequirement(role),
      matches: [],
      topMatch: null,
      averageScore: 0
    }));
  }

  const matchableExperts = experts.map(toMatchableExpert);

  return roles.map((role) => {
    const requirement = buildRequirement(role);
    return buildRoleMatchReport(requirement, matchableExperts);
  });
}

export function buildCandidatesFromReport(report: RoleMatchReport): InitiativeCandidate[] {
  if (report.matches.length === 0) {
    return [];
  }

  const skillCount = report.matches[0]?.explanation.skillCoverage.length ?? 0;
  const skillWeight = skillCount > 0 ? 1 / skillCount : 0;

  return report.matches.map((match) => {
    const skillScore = match.explanation.normalizedSkillScore;
    const totalScore = Math.min(100, Math.max(0, Math.round(match.explanation.totalScore * 100)));

    const commentParts: string[] = [];
    if (skillScore >= 0.85) {
      commentParts.push('Отлично покрывает ключевые навыки роли');
    } else if (skillScore >= 0.6) {
      commentParts.push('Основные компетенции закрыты, но есть зоны роста');
    } else {
      commentParts.push('Есть заметные пробелы по навыкам роли');
    }

    if (match.explanation.risks.length > 0) {
      commentParts.push(match.explanation.risks[0]);
    }

    const scoreDetails = match.explanation.skillCoverage.map((coverage) => ({
      criterion: coverage.skill.name,
      weight: Number(skillWeight.toFixed(2)),
      value: Number((coverage.hasSkill ? 1 : 0).toFixed(2)),
      comment: coverage.gaps[0]
    }));

    const fitComment = commentParts.join('. ').replace(/\.+$/, '') + '.';

    return {
      expertId: match.expert.id,
      score: totalScore,
      fitComment,
      riskTags: Array.from(new Set(match.explanation.risks)),
      scoreDetails
    };
  });
}

export function selectPinnedExperts(
  candidates: InitiativeCandidate[],
  required: number
): string[] {
  if (candidates.length === 0) {
    return [];
  }

  const needed = Math.max(1, Math.round(required));
  return candidates
    .slice(0, needed)
    .map((candidate) => candidate.expertId)
    .filter((id, index, array) => array.indexOf(id) === index);
}

export function assignExpertsToWorkItems(
  workItems: RolePlanningWorkDraft[],
  expertIds: string[]
): InitiativeRoleWork[] {
  if (workItems.length === 0) {
    return [];
  }

  return workItems.map((item, index) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    startDay: item.startDay,
    durationDays: item.durationDays,
    effortDays: item.effortDays,
    tasks: item.tasks,
    assignedExpertId:
      expertIds.length > 0 ? expertIds[index % expertIds.length] : undefined
  }));
}
