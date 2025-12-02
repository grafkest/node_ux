import { type ExpertProfile, type SkillEvidenceStatus } from '../data';

const LEVEL_WEIGHTS = {
  novice: 0.4,
  intermediate: 0.7,
  advanced: 0.9,
  expert: 1
} as const;

const DEFAULT_FRESHNESS_HALF_LIFE_DAYS = 180;

const STATUS_CONFIDENCE: Record<SkillEvidenceStatus, number> = {
  claimed: 0.35,
  screened: 0.55,
  observed: 0.75,
  validated: 1,
  refuted: 0
};

export type SkillLevel = keyof typeof LEVEL_WEIGHTS;

export type SkillRequirement = {
  id?: string;
  name: string;
  weight: number;
  requiredLevel?: SkillLevel;
  freshnessHalfLifeDays?: number;
};

export type RoleRequirement = {
  roleId: string;
  roleName: string;
  skills: SkillRequirement[];
  requiredFte: number;
};

export type ExpertSkillEvidence = {
  id: string;
  name: string;
  level: SkillLevel;
  lastUsedDaysAgo: number;
  status: SkillEvidenceStatus;
  sourceInitiatives: string[];
};

export type MatchableExpertProfile = ExpertProfile & {
  skillEvidence?: ExpertSkillEvidence[];
  /**
   * Фактическая загрузка эксперта. Если не указана, оценивается по статусу доступности.
   */
  fteCapacity?: number;
};

export type SkillCoverageReport = {
  skill: SkillRequirement;
  hasSkill: boolean;
  coverageScore: number;
  levelFactor: number;
  freshnessFactor: number;
  gaps: string[];
};

export type RoleMatchExplanation = {
  totalScore: number;
  normalizedSkillScore: number;
  availabilityMultiplier: number;
  fteSaturation: number;
  skillCoverage: SkillCoverageReport[];
  risks: string[];
};

export type RoleMatchResult = {
  expert: MatchableExpertProfile;
  explanation: RoleMatchExplanation;
};

export type RoleMatchReport = {
  requirement: RoleRequirement;
  matches: RoleMatchResult[];
  topMatch: RoleMatchResult | null;
  averageScore: number;
};

export type InitiativeRequirement = {
  initiativeId: string;
  initiativeName: string;
  roles: RoleRequirement[];
};

export type InitiativeMatchReport = {
  initiativeId: string;
  initiativeName: string;
  roleReports: RoleMatchReport[];
  overallScore: number;
  overallRisks: string[];
};

const LOG_2 = Math.log(2);

function formatInitiativeSuffix(ids: string[]): string {
  if (ids.length === 0) {
    return '';
  }
  if (ids.length === 1) {
    return ` (инициатива ${ids[0]})`;
  }
  return ` (инициативы: ${ids.join(', ')})`;
}

function buildStatusGap(
  skillName: string,
  status: SkillEvidenceStatus,
  initiatives: string[]
): string | null {
  const suffix = formatInitiativeSuffix(initiatives);
  switch (status) {
    case 'claimed':
      return `Навык «${skillName}» пока только заявлен без подтверждений${suffix}.`;
    case 'screened':
      return `Навык «${skillName}» на этапе скрининга${suffix}; требуется наблюдение или проверка.`;
    case 'observed':
      return `Навык «${skillName}» подтверждён наблюдениями${suffix}, рекомендуется собрать артефакты.`;
    case 'refuted':
      return `Навык «${skillName}» был опровергнут${suffix}.`;
    default:
      return null;
  }
}

function collectRequirementTargets(requirement: SkillRequirement): string[] {
  const targets = new Set<string>();
  if (requirement.id) {
    targets.add(requirement.id.toLowerCase());
  }
  if (requirement.name) {
    targets.add(requirement.name.toLowerCase());
  }
  return Array.from(targets);
}

function findEvidence(
  expert: MatchableExpertProfile,
  requirement: SkillRequirement
): ExpertSkillEvidence | undefined {
  const targets = collectRequirementTargets(requirement);
  if (targets.length === 0) {
    return undefined;
  }
  return expert.skillEvidence?.find((item) => {
    const evidenceValues = [item.id, item.name]
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    return evidenceValues.some((value) => targets.includes(value));
  });
}

function hasSkillInProfile(
  expert: MatchableExpertProfile,
  requirement: SkillRequirement
): boolean {
  const targets = collectRequirementTargets(requirement);
  if (targets.length === 0) {
    return false;
  }
  const normalizedCompetencies = [
    ...expert.competencies,
    ...expert.consultingSkills,
    ...(expert.softSkills ?? []),
    ...expert.focusAreas
  ].map((skill) => skill.toLowerCase());

  return normalizedCompetencies.some((skill) => targets.includes(skill));
}

function calculateFreshnessFactor(
  lastUsedDaysAgo: number | undefined,
  halfLifeDays: number
): number {
  if (lastUsedDaysAgo === undefined) {
    return 0.75;
  }
  if (lastUsedDaysAgo <= 0) {
    return 1;
  }
  return Math.exp((-LOG_2 * lastUsedDaysAgo) / Math.max(halfLifeDays, 1));
}

function calculateSkillCoverage(
  requirement: SkillRequirement,
  expert: MatchableExpertProfile
): SkillCoverageReport {
  const evidence = findEvidence(expert, requirement);
  const hasProfileSkill = hasSkillInProfile(expert, requirement);

  const requiredLevelWeight = requirement.requiredLevel
    ? LEVEL_WEIGHTS[requirement.requiredLevel]
    : LEVEL_WEIGHTS.expert;

  let levelFactor = 0;
  let freshnessFactor = 0;
  const gaps: string[] = [];

  let statusConfidence = 0;
  let effectiveEvidence = evidence ?? undefined;

  if (evidence) {
    statusConfidence = STATUS_CONFIDENCE[evidence.status] ?? 0;
    const statusGap = buildStatusGap(requirement.name, evidence.status, evidence.sourceInitiatives);
    if (statusGap) {
      gaps.push(statusGap);
    }
    if (evidence.status === 'refuted') {
      effectiveEvidence = undefined;
    }
  }

  if (!evidence && hasProfileSkill) {
    statusConfidence = Math.max(statusConfidence, STATUS_CONFIDENCE.claimed);
    gaps.push(`Навык «${requirement.name}» есть в профиле, но без подтверждения уровня/свежести`);
  }

  if (!effectiveEvidence && statusConfidence === 0 && !hasProfileSkill) {
    gaps.push(`Нет подтвержденного навыка «${requirement.name}».`);
  }

  if (effectiveEvidence) {
    const levelWeight = LEVEL_WEIGHTS[effectiveEvidence.level];
    const levelRatio = Math.min(levelWeight / requiredLevelWeight, 1);
    const halfLife = requirement.freshnessHalfLifeDays ?? DEFAULT_FRESHNESS_HALF_LIFE_DAYS;
    const baseFreshness = calculateFreshnessFactor(effectiveEvidence.lastUsedDaysAgo, halfLife);

    levelFactor = levelRatio * statusConfidence;
    freshnessFactor = baseFreshness * statusConfidence;

    if (levelRatio < 1) {
      gaps.push(
        `Уровень владения «${requirement.name}» ниже требуемого (${effectiveEvidence.level} < ${
          requirement.requiredLevel ?? 'expert'
        })`
      );
    }
    if (baseFreshness < 0.6) {
      gaps.push(
        `Навык «${requirement.name}» может быть устаревшим (использовался ${effectiveEvidence.lastUsedDaysAgo} дней назад)`
      );
    }
  } else if (!effectiveEvidence && statusConfidence > 0) {
    levelFactor = 0.65 * statusConfidence;
    freshnessFactor = 0.6 * statusConfidence;
  }

  const coverageScore = requirement.weight * Math.min(statusConfidence, 1);
  const hasSkill = coverageScore > 0;

  return {
    skill: requirement,
    hasSkill,
    coverageScore,
    levelFactor,
    freshnessFactor,
    gaps: Array.from(new Set(gaps))
  };
}

function calculateRisks(coverage: SkillCoverageReport[]): string[] {
  const risks = coverage.flatMap((item) => item.gaps);
  return Array.from(new Set(risks));
}

export function scoreExpertForRole(
  requirement: RoleRequirement,
  expert: MatchableExpertProfile
): RoleMatchResult {
  const coverageReports = requirement.skills.map((skill) =>
    calculateSkillCoverage(skill, expert)
  );

  const totalWeight = requirement.skills.reduce((sum, skill) => sum + skill.weight, 0);
  const normalizedSkillScore =
    totalWeight === 0
      ? 1
      : coverageReports.reduce((sum, report) => sum + report.coverageScore, 0) /
        totalWeight;

  const availabilityMultiplier = 1;
  const fteSaturation = 1;

  const totalScore = normalizedSkillScore;
  const risks = calculateRisks(coverageReports);

  return {
    expert,
    explanation: {
      totalScore,
      normalizedSkillScore,
      availabilityMultiplier,
      fteSaturation,
      skillCoverage: coverageReports,
      risks
    }
  };
}

export function buildRoleMatchReport(
  requirement: RoleRequirement,
  experts: MatchableExpertProfile[]
): RoleMatchReport {
  const matches = experts
    .map((expert) => scoreExpertForRole(requirement, expert))
    .sort((a, b) => b.explanation.totalScore - a.explanation.totalScore);

  const averageScore =
    matches.length === 0
      ? 0
      : matches.reduce((sum, match) => sum + match.explanation.totalScore, 0) /
        matches.length;

  return {
    requirement,
    matches,
    topMatch: matches[0] ?? null,
    averageScore
  };
}

export function buildInitiativeMatchReport(
  initiative: InitiativeRequirement,
  experts: MatchableExpertProfile[]
): InitiativeMatchReport {
  const roleReports = initiative.roles.map((role) => buildRoleMatchReport(role, experts));
  const topScores = roleReports
    .map((report) => report.topMatch?.explanation.totalScore ?? 0)
    .filter((score) => score > 0);
  const overallScore =
    topScores.length === 0
      ? 0
      : topScores.reduce((sum, score) => sum + score, 0) / topScores.length;

  const overallRisks = Array.from(
    new Set(
      roleReports.flatMap((report) => report.topMatch?.explanation.risks ?? [])
    )
  );

  return {
    initiativeId: initiative.initiativeId,
    initiativeName: initiative.initiativeName,
    roleReports,
    overallScore,
    overallRisks
  };
}
