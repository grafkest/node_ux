import type {
  ExpertProfile,
  ExpertSkill,
  SkillEvidenceStatus
} from '../data';

const collectSkillStatuses = (skill: ExpertSkill): SkillEvidenceStatus[] => {
  const evidenceStatuses = skill.evidence?.map((entry) => entry.status) ?? [];
  return Array.from(new Set([skill.proofStatus, ...evidenceStatuses]));
};

/**
 * Возвращает последнюю дату использования навыка.
 * При наличии периода приоритет отдаётся дате окончания, иначе — дате начала.
 */
export const getSkillLastUsedDate = (skill: ExpertSkill): string | undefined => {
  if (!skill.usage) {
    return skill.createdAt;
  }

  const candidates = [skill.usage.to, skill.usage.from, skill.createdAt].filter(
    (value): value is string => Boolean(value)
  );

  if (!candidates.length) {
    return undefined;
  }

  const validDate = candidates.find((value) => !Number.isNaN(Date.parse(value)));
  return validDate ?? candidates[0];
};

/**
 * Определяет самую свежую дату применения навыков эксперта.
 */
export const getExpertLatestSkillFreshness = (
  expert: ExpertProfile
): string | undefined => {
  const dates = expert.skills
    .map(getSkillLastUsedDate)
    .filter((value): value is string => Boolean(value))
    .map((value) => ({
      raw: value,
      timestamp: Date.parse(value)
    }))
    .filter((value) => !Number.isNaN(value.timestamp));

  if (!dates.length) {
    return undefined;
  }

  return dates.sort((a, b) => b.timestamp - a.timestamp)[0].raw;
};

/**
 * Фильтрует навыки по статусу подтверждения.
 */
export const filterSkillsByEvidenceStatus = (
  skills: ExpertSkill[],
  status: SkillEvidenceStatus | SkillEvidenceStatus[]
): ExpertSkill[] => {
  const statuses = Array.isArray(status) ? status : [status];
  const uniqueStatuses = new Set(statuses);

  return skills.filter((skill) => {
    const skillStatuses = collectSkillStatuses(skill);
    return skillStatuses.some((item) => uniqueStatuses.has(item));
  });
};

/**
 * Проверяет, есть ли у эксперта навыки с указанным статусом подтверждения.
 */
export const expertHasSkillsWithStatus = (
  expert: ExpertProfile,
  status: SkillEvidenceStatus | SkillEvidenceStatus[]
): boolean => {
  return filterSkillsByEvidenceStatus(expert.skills, status).length > 0;
};
