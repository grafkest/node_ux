import type { ExpertCompetencyRecord, ExpertProfile } from '../data';
import type { ExpertDraftPayload } from '../types/expert';
import { deduplicateNonEmpty } from './common';

export function buildExpertFromDraft(
  expertId: string,
  draft: ExpertDraftPayload,
  options: {
    domainIdSet: Set<string>;
    moduleIdSet: Set<string>;
    fallbackName: string;
    fallbackProfile?: ExpertProfile;
    moduleNameMap: Record<string, string>;
  }
): ExpertProfile {
  const fallback = options.fallbackProfile;
  const fullName = draft.fullName.trim() || fallback?.fullName || options.fallbackName;
  const title = draft.title.trim() || fallback?.title || 'Роль не указана';
  const summary = draft.summary.trim() || fallback?.summary || 'Описание не заполнено';

  const domains = deduplicateNonEmpty(draft.domains).filter((id) => options.domainIdSet.has(id));
  const modules = deduplicateNonEmpty(draft.modules).filter((id) => options.moduleIdSet.has(id));
  const competencies = deduplicateNonEmpty(draft.competencies);
  const competencyRecordLookup = new Map<string, ExpertCompetencyRecord>();
  (draft.competencyRecords ?? []).forEach((record) => {
    const name = record.name.trim();
    if (!name || competencyRecordLookup.has(name)) {
      return;
    }
    const normalized: ExpertCompetencyRecord = { name };
    if (record.level) {
      normalized.level = record.level;
    }
    if (record.proofStatus) {
      normalized.proofStatus = record.proofStatus;
    }
    competencyRecordLookup.set(name, normalized);
  });
  const competencyRecords = competencies.map((name) => competencyRecordLookup.get(name) ?? { name });
  const consultingSkills = deduplicateNonEmpty(draft.consultingSkills);
  const softSkills = deduplicateNonEmpty(draft.softSkills ?? []);
  const focusAreas = deduplicateNonEmpty(draft.focusAreas);
  const languages = deduplicateNonEmpty(draft.languages);
  const moduleNames = modules
    .map((id) => options.moduleNameMap[id] ?? id)
    .filter((name): name is string => Boolean(name && name.trim()));
  const notableProjects = deduplicateNonEmpty(moduleNames);

  const experienceYears = Math.max(0, Math.round(draft.experienceYears ?? 0));
  const location = draft.location.trim() || fallback?.location || 'Локация не указана';
  const contact = draft.contact.trim() || fallback?.contact || 'Контакт не указан';
  const availabilityComment =
    draft.availabilityComment.trim() || fallback?.availabilityComment || 'Комментариев по доступности нет';

  const skills = draft.skills.map((skill) => ({
    ...skill,
    artifacts: [...skill.artifacts],
    usage: skill.usage ? { ...skill.usage } : undefined,
    createdAt: skill.createdAt ?? new Date().toISOString()
  }));

  return {
    id: expertId,
    fullName,
    title,
    summary,
    domains,
    modules,
    competencies,
    competencyRecords,
    consultingSkills,
    softSkills,
    focusAreas,
    experienceYears,
    location,
    contact,
    languages,
    notableProjects,
    availability: draft.availability,
    availabilityComment,
    skills
  };
}
