type XlsxModule = typeof import('xlsx');

let xlsxModulePromise: Promise<XlsxModule> | null = null;

const loadXlsxModule = async (): Promise<XlsxModule> => {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
};
import {
  type ExpertAvailability,
  type ExpertCompetencyRecord,
  type ExpertSkill,
  type SkillDefinition,
  type SkillEvidenceStatus,
  type SkillLevel,
  type SkillSource,
  type TeamRole,
  evidenceStatuses,
  findSkillByName,
  getSkillNameById,
  isRoleCompetencyKnown,
  skills,
  skillLevels
} from '../data';
import type { ExpertDraftPayload } from '../types/expert';

type Workbook = ReturnType<typeof import('xlsx').utils.book_new>;

const PROFILE_SHEET = 'Profile';
const SKILLS_SHEET = 'Skills';
const HARD_SKILLS_SHEET = 'Hard навыки';
const EVIDENCE_SHEET = 'Evidence';

const PROFILE_HEADERS = ['Атрибут', 'Значение', 'Уровень', 'Подтверждение'] as const;
const COMPETENCY_FIELD_REGEX = /^компетенция\s*\d+$/i;
const COMPETENCY_FIELD_EN_REGEX = /^competency\s*\d+$/i;

const PROFILE_FIELDS = {
  id: 'ID эксперта',
  fullName: 'ФИО',
  title: 'Роль / должность',
  summary: 'Краткое описание',
  experienceYears: 'Опыт (лет)',
  availability: 'Доступность',
  availabilityComment: 'Комментарий по доступности',
  location: 'Локация',
  contact: 'Контакты',
  languages: 'Языки',
  domains: 'Доменные области',
  domainIds: 'ID доменов',
  modules: 'Модули',
  moduleIds: 'ID модулей',
  competencies: 'Компетенции',
  consultingSkills: 'Консалтинговые навыки',
  softSkills: 'Soft skills',
  focusAreas: 'Фокусы и задачи',
  notableProjects: 'Значимые проекты'
} as const;

const PROFILE_FIELD_ALIASES: Partial<Record<ProfileFieldKey, string[]>> = {
  id: ['Expert ID'],
  fullName: ['Full Name'],
  title: ['Title'],
  summary: ['Summary'],
  experienceYears: ['Experience Years'],
  availability: ['Availability'],
  availabilityComment: ['Availability Comment'],
  location: ['Location'],
  contact: ['Contact'],
  languages: ['Languages'],
  domains: ['Domains'],
  domainIds: ['Domain IDs'],
  modules: ['Modules'],
  moduleIds: ['Module IDs'],
  competencies: ['Competencies'],
  consultingSkills: ['Consulting Skills'],
  softSkills: ['Soft Skills'],
  focusAreas: ['Focus Areas'],
  notableProjects: ['Notable Projects']
};

type ProfileFieldKey = keyof typeof PROFILE_FIELDS;

const SKILL_HEADERS = [
  'Skill ID',
  'Skill Name',
  'Category',
  'Level',
  'Proof Status',
  'Interest',
  'Available FTE',
  'Artifacts',
  'Usage From',
  'Usage To',
  'Usage Description',
  'Definition Description',
  'Definition Sources',
  'Definition Recommended Level',
  'Definition Evidence Status',
  'Definition Roles'
] as const;

type SkillHeader = (typeof SKILL_HEADERS)[number];

const HARD_SKILL_HEADERS = ['ID навыка', 'Навык', 'Уровень', 'Подтверждение'] as const;

type HardSkillHeader = (typeof HARD_SKILL_HEADERS)[number];

const EVIDENCE_HEADERS = ['Skill ID', 'Status', 'Initiative ID', 'Artifacts', 'Comment'] as const;

type EvidenceHeader = (typeof EVIDENCE_HEADERS)[number];

const availabilityMap: Record<string, ExpertAvailability> = {
  available: 'available',
  'доступен': 'available',
  partial: 'partial',
  'частично доступен': 'partial',
  busy: 'busy',
  'занят': 'busy'
};

const proofStatusMap = evidenceStatuses.reduce<Record<string, SkillEvidenceStatus>>((acc, status) => {
  acc[status.id] = status.id as SkillEvidenceStatus;
  acc[status.label.toLowerCase()] = status.id as SkillEvidenceStatus;
  return acc;
}, {});

const proofStatusLabelMap = evidenceStatuses.reduce<Record<SkillEvidenceStatus, string>>((acc, status) => {
  acc[status.id as SkillEvidenceStatus] = status.label;
  return acc;
}, {} as Record<SkillEvidenceStatus, string>);

const skillLevelMap = skillLevels.reduce<Record<string, SkillLevel>>((acc, descriptor) => {
  acc[descriptor.id] = descriptor.id as SkillLevel;
  acc[descriptor.label.toLowerCase()] = descriptor.id as SkillLevel;
  return acc;
}, {});

const skillLevelLabelMap = skillLevels.reduce<Record<SkillLevel, string>>((acc, descriptor) => {
  acc[descriptor.id as SkillLevel] = descriptor.label;
  return acc;
}, {} as Record<SkillLevel, string>);

const interestMap: Record<string, ExpertSkill['interest']> = {
  high: 'high',
  средний: 'medium',
  medium: 'medium',
  low: 'low',
  высокий: 'high',
  низкий: 'low'
};

const skillSourceMap: Record<string, SkillSource> = {
  sfia: 'SFIA',
  iiba: 'IIBA',
  incose: 'INCOSE'
};

const evidenceStatusMap = evidenceStatuses.reduce<Record<string, SkillEvidenceStatus>>((acc, status) => {
  acc[status.id] = status.id as SkillEvidenceStatus;
  acc[status.label.toLowerCase()] = status.id as SkillEvidenceStatus;
  return acc;
}, {});

const recommendedLevelMap = skillLevels.reduce<Record<string, SkillLevel>>((acc, descriptor) => {
  acc[descriptor.id] = descriptor.id as SkillLevel;
  acc[descriptor.label.toLowerCase()] = descriptor.id as SkillLevel;
  return acc;
}, {});

const splitMultiline = (value: string): string[] =>
  value
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const joinMultivalue = (values: string[]): string => values.join('; ');

const normalizeLabel = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, ' ');

const buildNameMap = (record: Record<string, string>): Map<string, string> => {
  const map = new Map<string, string>();
  Object.entries(record).forEach(([id, label]) => {
    if (!label) {
      return;
    }
    const normalized = normalizeLabel(label);
    if (!normalized) {
      return;
    }
    map.set(normalized, id);
    const withoutPrefix = normalized.replace(/^[-—\s]+/, '').trim();
    if (withoutPrefix && !map.has(withoutPrefix)) {
      map.set(withoutPrefix, id);
    }
  });
  return map;
};

const resolveLabelToId = (map: Map<string, string>, label: string): string | null => {
  if (!label) {
    return null;
  }
  const normalized = normalizeLabel(label);
  if (!normalized) {
    return null;
  }
  const direct = map.get(normalized);
  if (direct) {
    return direct;
  }
  const withoutPrefix = normalized.replace(/^[-—\s]+/, '').trim();
  if (withoutPrefix) {
    const fallback = map.get(withoutPrefix);
    if (fallback) {
      return fallback;
    }
  }
  return null;
};

const slugifySkillId = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

export type ExpertExcelExportParams = {
  draft: ExpertDraftPayload;
  expertId?: string | null;
  domainLabelMap: Record<string, string>;
  moduleLabelMap: Record<string, string>;
};

export type MissingSkillEntry = {
  definition: SkillDefinition;
  rowNumber: number;
  requestedId: string;
  requestedName: string;
};

export type MissingCompetencyEntry = {
  competencyName: string;
  roleTitle: string;
  rowNumber: number;
  levelLabel?: string;
  proofLabel?: string;
};

export type MissingDomainEntry = {
  requestedValue: string;
  source: 'id' | 'name';
};

export type ExpertImportResult = {
  draft: ExpertDraftPayload;
  requestedExpertId?: string;
  errors: string[];
  warnings: string[];
  missingHardSkills: MissingSkillEntry[];
  missingCompetencies: MissingCompetencyEntry[];
  missingDomains: MissingDomainEntry[];
};

export type ExpertExcelImportParams = {
  buffer: ArrayBuffer;
  domainLabelMap: Record<string, string>;
  moduleLabelMap: Record<string, string>;
};

export const createExpertWorkbook = async ({
  draft,
  expertId,
  domainLabelMap,
  moduleLabelMap
}: ExpertExcelExportParams): Promise<Workbook> => {
  const { utils } = await loadXlsxModule();
  const workbook = utils.book_new();

  const profileMatrix: string[][] = [
    [...PROFILE_HEADERS]
  ];

  const profileKeys = (Object.keys(PROFILE_FIELDS) as ProfileFieldKey[]).filter(
    (key) => key !== 'competencies'
  );

  profileKeys.forEach((key) => {
    const field = PROFILE_FIELDS[key];
    let value = '';

    switch (key) {
      case 'id':
        value = expertId ? String(expertId) : '';
        break;
      case 'fullName':
        value = draft.fullName;
        break;
      case 'title':
        value = draft.title;
        break;
      case 'summary':
        value = draft.summary;
        break;
      case 'experienceYears':
        value = String(draft.experienceYears ?? 0);
        break;
      case 'availability':
        value = draft.availability;
        break;
      case 'availabilityComment':
        value = draft.availabilityComment;
        break;
      case 'location':
        value = draft.location;
        break;
      case 'contact':
        value = draft.contact;
        break;
      case 'languages':
        value = joinMultivalue(draft.languages);
        break;
      case 'domains':
        value = joinMultivalue(draft.domains.map((id) => domainLabelMap[id] ?? id));
        break;
      case 'domainIds':
        value = joinMultivalue(draft.domains);
        break;
      case 'modules':
        value = joinMultivalue(draft.modules.map((id) => moduleLabelMap[id] ?? id));
        break;
      case 'moduleIds':
        value = joinMultivalue(draft.modules);
        break;
      case 'consultingSkills':
        value = joinMultivalue(draft.consultingSkills);
        break;
      case 'softSkills':
        value = joinMultivalue(draft.softSkills ?? []);
        break;
      case 'focusAreas':
        value = joinMultivalue(draft.focusAreas);
        break;
      case 'notableProjects':
        value = joinMultivalue(draft.notableProjects);
        break;
      default:
        value = '';
        break;
    }

    profileMatrix.push([field, value, '', '']);
  });

  const competencyOrder: string[] = [];
  const seenCompetencies = new Set<string>();
  draft.competencies.forEach((name) => {
    const trimmed = name.trim();
    if (trimmed && !seenCompetencies.has(trimmed)) {
      seenCompetencies.add(trimmed);
      competencyOrder.push(trimmed);
    }
  });
  (draft.competencyRecords ?? []).forEach((record) => {
    const trimmed = record.name.trim();
    if (trimmed && !seenCompetencies.has(trimmed)) {
      seenCompetencies.add(trimmed);
      competencyOrder.push(trimmed);
    }
  });

  const competencyRecordMap = new Map<string, ExpertCompetencyRecord>();
  (draft.competencyRecords ?? []).forEach((record) => {
    const trimmed = record.name.trim();
    if (trimmed && !competencyRecordMap.has(trimmed)) {
      competencyRecordMap.set(trimmed, record);
    }
  });

  competencyOrder.forEach((name, index) => {
    const record = competencyRecordMap.get(name);
    const levelLabel = record?.level ? skillLevelLabelMap[record.level] ?? record.level : '';
    const proofLabel = record?.proofStatus
      ? proofStatusLabelMap[record.proofStatus] ?? record.proofStatus
      : '';
    profileMatrix.push([`Компетенция ${index + 1}`, name, levelLabel, proofLabel]);
  });

  const profileSheet = utils.aoa_to_sheet(profileMatrix);
  utils.book_append_sheet(workbook, profileSheet, PROFILE_SHEET);

  const skillRows = draft.skills.map((skill) => {
    const definition = skills[skill.id];
    const usage = skill.usage ?? {};

    return {
      'Skill ID': skill.id,
      'Skill Name': definition?.name ?? getSkillNameById(skill.id) ?? skill.id,
      Category: definition?.category ?? 'hard',
      Level: skill.level,
      'Proof Status': skill.proofStatus,
      Interest: skill.interest,
      'Available FTE': skill.availableFte ?? 0,
      Artifacts: joinMultivalue(skill.artifacts),
      'Usage From': usage.from ?? '',
      'Usage To': usage.to ?? '',
      'Usage Description': usage.description ?? '',
      'Definition Description': definition?.description ?? '',
      'Definition Sources': joinMultivalue(definition?.sources ?? []),
      'Definition Recommended Level': definition?.recommendedLevel ?? '',
      'Definition Evidence Status': definition?.evidenceStatus ?? '',
      'Definition Roles': joinMultivalue(definition?.roles ?? [])
    };
  });

  const skillsSheet = utils.json_to_sheet(skillRows, {
    header: [...SKILL_HEADERS]
  });
  utils.book_append_sheet(workbook, skillsSheet, SKILLS_SHEET);

  const hardSkillRows = draft.skills
    .map((skill) => {
      const definition = skills[skill.id];
      if (definition && definition.category !== 'hard') {
        return null;
      }

      const skillName = definition?.name ?? getSkillNameById(skill.id) ?? skill.id;

      return {
        'ID навыка': skill.id,
        Навык: skillName,
        Уровень: skillLevelLabelMap[skill.level] ?? skill.level,
        Подтверждение: proofStatusLabelMap[skill.proofStatus] ?? skill.proofStatus
      } as Record<HardSkillHeader, string>;
    })
    .filter((row): row is Record<HardSkillHeader, string> => Boolean(row));

  if (hardSkillRows.length > 0) {
    const hardSkillsSheet = utils.json_to_sheet(hardSkillRows, {
      header: [...HARD_SKILL_HEADERS]
    });
    utils.book_append_sheet(workbook, hardSkillsSheet, HARD_SKILLS_SHEET);
  }

  const evidenceRows: Array<Record<EvidenceHeader, string>> = [];
  draft.skills.forEach((skill) => {
    (skill.evidence ?? []).forEach((entry) => {
      evidenceRows.push({
        'Skill ID': skill.id,
        Status: entry.status,
        'Initiative ID': entry.initiativeId ?? '',
        Artifacts: joinMultivalue(entry.artifactIds ?? []),
        Comment: entry.comment ?? ''
      });
    });
  });

  const evidenceSheet = utils.json_to_sheet(evidenceRows, {
    header: [...EVIDENCE_HEADERS]
  });
  utils.book_append_sheet(workbook, evidenceSheet, EVIDENCE_SHEET);

  return workbook;
};

export const exportExpertToExcel = async (params: ExpertExcelExportParams): Promise<ArrayBuffer> => {
  const { write } = await loadXlsxModule();
  const workbook = await createExpertWorkbook(params);
  return write(workbook, { type: 'array', bookType: 'xlsx' });
};

type SkillSheetRow = Record<SkillHeader, string | number>;

type EvidenceSheetRow = Record<EvidenceHeader, string | number>;

type HardSkillSheetRow = Partial<Record<HardSkillHeader, string | number>>;

const parseSkillCategory = (raw: string): SkillDefinition['category'] | null => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith('hard')) {
    return 'hard';
  }
  if (normalized.startsWith('soft')) {
    return 'soft';
  }
  if (normalized.startsWith('domain')) {
    return 'domain';
  }
  return null;
};

const parseSkillLevel = (raw: string): SkillLevel | null => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return skillLevelMap[normalized] ?? null;
};

const parseProofStatus = (raw: string): SkillEvidenceStatus | null => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return proofStatusMap[normalized] ?? null;
};

const parseInterest = (raw: string): ExpertSkill['interest'] | null => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return interestMap[normalized] ?? null;
};

const parseAvailability = (raw: string): ExpertAvailability | null => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return availabilityMap[normalized] ?? null;
};

const parseSources = (raw: string): SkillSource[] => {
  if (!raw) {
    return [];
  }
  const values = splitMultiline(raw);
  return Array.from(
    new Set(
      values
        .map((value) => skillSourceMap[value.trim().toLowerCase()])
        .filter((value): value is SkillSource => Boolean(value))
    )
  );
};

const parseEvidenceStatus = (raw: string): SkillEvidenceStatus | null => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return evidenceStatusMap[normalized] ?? null;
};

const parseRecommendedLevel = (raw: string): SkillLevel | null => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return recommendedLevelMap[normalized] ?? null;
};

const parseRoles = (raw: string): TeamRole[] => {
  if (!raw) {
    return [];
  }
  const seen = new Set<string>();
  return splitMultiline(raw)
    .map((value) => value.trim())
    .filter((value): value is TeamRole => {
      if (!value) {
        return false;
      }
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
};

const coerceNumber = (value: string | number): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const parseExpertWorkbook = async ({
  buffer,
  domainLabelMap,
  moduleLabelMap
}: ExpertExcelImportParams): Promise<ExpertImportResult> => {
  const { read, utils } = await loadXlsxModule();
  const workbook = read(buffer, { type: 'array' });

  const profileSheet = workbook.Sheets[PROFILE_SHEET];
  const skillsSheet = workbook.Sheets[SKILLS_SHEET];
  const hardSkillsSheet = workbook.Sheets[HARD_SKILLS_SHEET];
  const evidenceSheet = workbook.Sheets[EVIDENCE_SHEET];

  const errors: string[] = [];
  const warnings: string[] = [];

  const domainNameMap = buildNameMap(domainLabelMap);
  const moduleNameMap = buildNameMap(moduleLabelMap);

  const profileValues = new Map<string, string>();
  const competencyRows: Array<{ name: string; level: string; proof: string; rowNumber: number }> = [];
  const skillCreationTimestamp = new Date().toISOString();
  if (profileSheet) {
    const rows = utils.sheet_to_json<(string | number)[]>(profileSheet, {
      header: 1,
      blankrows: false
    });
    rows.forEach((row, index) => {
      const fieldLabel = String(row[0] ?? '').trim();
      if (index === 0 && (fieldLabel === 'Field' || fieldLabel === 'Атрибут')) {
        return;
      }
      if (!fieldLabel) {
        return;
      }
      const value = row[1] !== undefined ? String(row[1]).trim() : '';
      const level = row[2] !== undefined ? String(row[2]).trim() : '';
      const proof = row[3] !== undefined ? String(row[3]).trim() : '';

      if (COMPETENCY_FIELD_REGEX.test(fieldLabel) || COMPETENCY_FIELD_EN_REGEX.test(fieldLabel)) {
        competencyRows.push({ name: value, level, proof, rowNumber: index + 1 });
        return;
      }

      profileValues.set(fieldLabel, value);
    });
  }

  const getProfileValue = (key: ProfileFieldKey): string => {
    const labels = [PROFILE_FIELDS[key], ...(PROFILE_FIELD_ALIASES[key] ?? [])];
    for (const label of labels) {
      const value = profileValues.get(label);
      if (value !== undefined) {
        return value;
      }
    }
    return '';
  };

  const fullName = getProfileValue('fullName').trim();
  if (!fullName) {
    errors.push('В файле не указано полное имя сотрудника.');
  }

  const availabilityValue = parseAvailability(getProfileValue('availability'));
  if (!availabilityValue) {
    errors.push('Некорректное значение доступности сотрудника.');
  }

  type CompetencyCandidate = {
    record: ExpertCompetencyRecord;
    rowNumber: number;
    levelLabel?: string;
    proofLabel?: string;
  };

  const competencyCandidateMap = new Map<string, CompetencyCandidate>();

  competencyRows.forEach((row) => {
    const name = row.name.trim();
    if (!name) {
      errors.push(
        `Лист «${PROFILE_SHEET}», строка ${row.rowNumber}: не указано название компетенции.`
      );
      return;
    }

    let level: SkillLevel | undefined;
    if (row.level) {
      const parsedLevel = parseSkillLevel(row.level);
      if (!parsedLevel) {
        errors.push(
          `Лист «${PROFILE_SHEET}», строка ${row.rowNumber}: некорректный уровень компетенции «${name}».`
        );
      } else {
        level = parsedLevel;
      }
    }

    let proofStatus: SkillEvidenceStatus | undefined;
    if (row.proof) {
      const parsedProof = parseProofStatus(row.proof);
      if (!parsedProof) {
        errors.push(
          `Лист «${PROFILE_SHEET}», строка ${row.rowNumber}: некорректный статус подтверждения для компетенции «${name}».`
        );
      } else {
        proofStatus = parsedProof;
      }
    }

    if (competencyCandidateMap.has(name)) {
      return;
    }

    const record: ExpertCompetencyRecord = { name };
    if (level) {
      record.level = level;
    }
    if (proofStatus) {
      record.proofStatus = proofStatus;
    }

    competencyCandidateMap.set(name, {
      record,
      rowNumber: row.rowNumber,
      levelLabel: level ? skillLevelLabelMap[level] ?? level : undefined,
      proofLabel: proofStatus ? proofStatusLabelMap[proofStatus] ?? proofStatus : undefined
    });
  });

  const competencyCandidates = Array.from(competencyCandidateMap.values());
  const fallbackCompetencies = splitMultiline(getProfileValue('competencies'));

  const competencyRecordMap = new Map<string, ExpertCompetencyRecord>();
  const competencyOrder: string[] = [];

  competencyCandidates.forEach((candidate) => {
    const name = candidate.record.name;
    if (!competencyRecordMap.has(name)) {
      competencyOrder.push(name);
      competencyRecordMap.set(name, candidate.record);
    }
  });

  fallbackCompetencies.forEach((name) => {
    const trimmed = name.trim();
    if (trimmed && !competencyRecordMap.has(trimmed)) {
      competencyOrder.push(trimmed);
      competencyRecordMap.set(trimmed, { name: trimmed });
    }
  });

  const domainIds = splitMultiline(getProfileValue('domainIds'));
  const domainNames = splitMultiline(getProfileValue('domains'));
  const normalizedDomains = new Set<string>();
  const missingDomains: MissingDomainEntry[] = [];
  const missingDomainRegistry = new Set<string>();
  domainIds.forEach((id) => {
    if (domainLabelMap[id]) {
      normalizedDomains.add(id);
    } else if (id) {
      const registryKey = `id:${id.toLowerCase()}`;
      if (!missingDomainRegistry.has(registryKey)) {
        missingDomainRegistry.add(registryKey);
        missingDomains.push({ requestedValue: id, source: 'id' });
      }
      warnings.push(`Домен «${id}» отсутствует в системе и требует сопоставления.`);
    }
  });
  domainNames.forEach((name) => {
    const id = resolveLabelToId(domainNameMap, name);
    if (id) {
      normalizedDomains.add(id);
    } else if (name) {
      const normalized = name.trim();
      if (!normalized) {
        return;
      }
      const registryKey = `name:${normalized.toLowerCase()}`;
      if (!missingDomainRegistry.has(registryKey)) {
        missingDomainRegistry.add(registryKey);
        missingDomains.push({ requestedValue: normalized, source: 'name' });
      }
      warnings.push(`Домен «${normalized}» отсутствует в системе и требует сопоставления.`);
    }
  });

  const moduleIds = splitMultiline(getProfileValue('moduleIds'));
  const moduleNames = splitMultiline(getProfileValue('modules'));
  const normalizedModules = new Set<string>();
  moduleIds.forEach((id) => {
    if (moduleLabelMap[id]) {
      normalizedModules.add(id);
    } else if (id) {
      warnings.push(`Модуль «${id}» отсутствует в системе и будет пропущен.`);
    }
  });
  moduleNames.forEach((name) => {
    const id = resolveLabelToId(moduleNameMap, name);
    if (id) {
      normalizedModules.add(id);
    }
  });

  const draft: ExpertDraftPayload = {
    fullName,
    title: getProfileValue('title'),
    summary: getProfileValue('summary'),
    domains: Array.from(normalizedDomains),
    modules: Array.from(normalizedModules),
    experienceYears: Math.max(0, Math.round(coerceNumber(getProfileValue('experienceYears')))),
    location: getProfileValue('location'),
    contact: getProfileValue('contact'),
    languages: splitMultiline(getProfileValue('languages')),
    notableProjects: splitMultiline(getProfileValue('notableProjects')),
    availability: availabilityValue ?? 'available',
    availabilityComment: getProfileValue('availabilityComment'),
    competencies: competencyOrder,
    competencyRecords: competencyOrder.map((name) => competencyRecordMap.get(name) ?? { name }),
    consultingSkills: splitMultiline(getProfileValue('consultingSkills')),
    softSkills: splitMultiline(getProfileValue('softSkills')),
    focusAreas: splitMultiline(getProfileValue('focusAreas')),
    skills: []
  };

  draft.skills = [];

  const requestedExpertId = getProfileValue('id') || undefined;

  const missingHardSkills: MissingSkillEntry[] = [];
  const missingCompetencies: MissingCompetencyEntry[] = [];
  const hardSkillOverrides = new Map<
    string,
    {
      id: string;
      name: string;
      level: SkillLevel;
      proofStatus: SkillEvidenceStatus;
      definition?: SkillDefinition;
      rowNumber: number;
    }
  >();

  if (hardSkillsSheet) {
    const rows = utils.sheet_to_json<HardSkillSheetRow>(hardSkillsSheet, { defval: '' });
    rows.forEach((row, index) => {
      const rawId = String(row['ID навыка'] ?? '').trim();
      const rawName = String(row['Навык'] ?? '').trim();
      if (!rawId && !rawName) {
        return;
      }

      let skillId = rawId;
      let definition = skillId ? skills[skillId] : undefined;

      if (!definition && rawName) {
        const existing = findSkillByName(rawName);
        if (existing) {
          skillId = existing.id;
          definition = existing;
        }
      }

      if (!skillId && rawName) {
        skillId = slugifySkillId(rawName);
      }

      if (!skillId) {
        errors.push(`Лист «${HARD_SKILLS_SHEET}», строка ${index + 2}: не указан идентификатор или название навыка.`);
        return;
      }

      const level = parseSkillLevel(String(row['Уровень'] ?? ''));
      if (!level) {
        errors.push(
          `Лист «${HARD_SKILLS_SHEET}», строка ${index + 2}: некорректное значение уровня для «${rawName || skillId}».`
        );
        return;
      }

      const proofStatus = parseProofStatus(String(row['Подтверждение'] ?? ''));
      if (!proofStatus) {
        errors.push(
          `Лист «${HARD_SKILLS_SHEET}», строка ${index + 2}: некорректный статус подтверждения для «${rawName || skillId}».`
        );
        return;
      }

      const resolvedName = rawName || definition?.name || skillId;

      if (!definition) {
        const existingMissing = missingHardSkills.find((entry) => entry.requestedId === skillId);
        if (!existingMissing) {
          missingHardSkills.push({
            definition: {
              id: skillId,
              name: resolvedName,
              description: resolvedName,
              category: 'hard',
              sources: [],
              recommendedLevel: 'P',
              evidenceStatus: 'screened',
              roles: []
            },
            requestedId: skillId,
            requestedName: resolvedName,
            rowNumber: index + 2
          });
        }
      }

      hardSkillOverrides.set(skillId, {
        id: skillId,
        name: resolvedName,
        level,
        proofStatus,
        definition,
        rowNumber: index + 2
      });
    });
  }

  const skillRows = skillsSheet ? utils.sheet_to_json<SkillSheetRow>(skillsSheet, { defval: '' }) : [];

  const skillMap = new Map<string, ExpertSkill>();
  const skillNameRegistry = new Map<string, string>();

  const registerCompetencySkill = (
    record: ExpertCompetencyRecord,
    rowNumber: number
  ): { skillId: string; isNewDefinition: boolean } | null => {
    const name = record.name.trim();
    if (!name) {
      return null;
    }

    const existingDefinition = findSkillByName(name);
    const skillId = existingDefinition?.id ?? slugifySkillId(name || `competency-${rowNumber}`);
    if (!skillId) {
      return null;
    }

    skillNameRegistry.set(skillId, existingDefinition?.name ?? name);

    const currentSkill = skillMap.get(skillId);
    const level = record.level ?? currentSkill?.level ?? 'P';
    const proofStatus = record.proofStatus ?? currentSkill?.proofStatus ?? 'claimed';

    const baseSkill: ExpertSkill = currentSkill ?? {
      id: skillId,
      level,
      proofStatus,
      evidence: [],
      createdAt: skillCreationTimestamp,
      artifacts: [],
      interest: 'medium',
      availableFte: 0
    };

    skillMap.set(skillId, {
      ...baseSkill,
      level,
      proofStatus
    });

    return { skillId, isNewDefinition: !existingDefinition };
  };

  skillRows.forEach((row, index) => {
    const rawCategory = String(row.Category ?? '');
    const skillName = String(row['Skill Name'] ?? '').trim();
    const rawSkillId = String(row['Skill ID'] ?? '').trim();

    if (!skillName && !rawSkillId) {
      return;
    }

    const level = parseSkillLevel(String(row.Level ?? ''));
    if (!level) {
      errors.push(`Строка ${index + 2}: некорректный уровень навыка для «${skillName || rawSkillId}».`);
      return;
    }

    const proofStatus = parseProofStatus(String(row['Proof Status'] ?? ''));
    if (!proofStatus) {
      errors.push(`Строка ${index + 2}: некорректный статус подтверждения для «${skillName || rawSkillId}».`);
      return;
    }

    const interest = parseInterest(String(row.Interest ?? '')) ?? 'medium';
    const availableFte = coerceNumber(row['Available FTE'] ?? 0);
    const artifacts = splitMultiline(String(row.Artifacts ?? ''));
    const usageFrom = String(row['Usage From'] ?? '').trim();
    const usageTo = String(row['Usage To'] ?? '').trim();
    const usageDescription = String(row['Usage Description'] ?? '').trim();

    let skillId = rawSkillId || slugifySkillId(skillName || `skill-${index}`);
    let definition = skills[skillId];

    if (!definition && skillName) {
      const existing = findSkillByName(skillName);
      if (existing) {
        skillId = existing.id;
        definition = existing;
      }
    }

    let category = parseSkillCategory(rawCategory);
    if (!category) {
      category = definition?.category ?? null;
    }

    const resolvedSkillName = skillName || definition?.name || skillId;
    skillNameRegistry.set(skillId, resolvedSkillName);

    if (!category) {
      errors.push(`Строка ${index + 2}: не удалось определить категорию навыка «${resolvedSkillName}».`);
      return;
    }

    if (!definition && category === 'hard') {
      const definitionDescription = String(row['Definition Description'] ?? '').trim();
      const definitionSources = parseSources(String(row['Definition Sources'] ?? ''));
      const recommendedLevel =
        parseRecommendedLevel(String(row['Definition Recommended Level'] ?? '')) ?? 'P';
      const evidenceStatus =
        parseEvidenceStatus(String(row['Definition Evidence Status'] ?? '')) ?? 'screened';
      const roles = parseRoles(String(row['Definition Roles'] ?? ''));

      const alreadyMissing = missingHardSkills.find((entry) => entry.requestedId === skillId);
      if (!alreadyMissing) {
        missingHardSkills.push({
          definition: {
            id: skillId,
            name: resolvedSkillName,
            description: definitionDescription || resolvedSkillName,
            category,
            sources: definitionSources,
            recommendedLevel,
            evidenceStatus,
            roles
          },
          requestedId: skillId,
          requestedName: resolvedSkillName,
          rowNumber: index + 2
        });
      }
    }

    const usage = usageFrom || usageTo || usageDescription ? { from: usageFrom, to: usageTo, description: usageDescription } : undefined;

    const expertSkill: ExpertSkill = {
      id: skillId,
      level,
      proofStatus,
      evidence: [],
      createdAt: skillCreationTimestamp,
      artifacts,
      interest,
      availableFte,
      usage
    };

    skillMap.set(skillId, expertSkill);
  });

  hardSkillOverrides.forEach((override) => {
    const skill = skillMap.get(override.id);
    if (skill) {
      skill.level = override.level;
      skill.proofStatus = override.proofStatus;
      return;
    }

    skillMap.set(override.id, {
      id: override.id,
      level: override.level,
      proofStatus: override.proofStatus,
      evidence: [],
      createdAt: skillCreationTimestamp,
      artifacts: [],
      interest: 'medium',
      availableFte: 0
    });
  });

  competencyCandidates.forEach((candidate) => {
    registerCompetencySkill(candidate.record, candidate.rowNumber);
  });

  if (evidenceSheet) {
    const evidenceRows = utils.sheet_to_json<EvidenceSheetRow>(evidenceSheet, { defval: '' });
    evidenceRows.forEach((row, index) => {
      const skillId = String(row['Skill ID'] ?? '').trim();
      const status = parseEvidenceStatus(String(row.Status ?? ''));
      if (!skillId || !status) {
        return;
      }
      const initiativeId = String(row['Initiative ID'] ?? '').trim();
      const artifacts = splitMultiline(String(row.Artifacts ?? ''));
      const comment = String(row.Comment ?? '').trim();

      const skill = skillMap.get(skillId);
      if (!skill) {
        warnings.push(`Лист Evidence, строка ${index + 2}: навык «${skillId}» не найден в профиле и будет пропущен.`);
        return;
      }

      skill.evidence.push({
        status,
        ...(initiativeId ? { initiativeId } : {}),
        ...(artifacts.length > 0 ? { artifactIds: artifacts } : {}),
        ...(comment ? { comment } : {})
      });
    });
  }

  draft.skills = Array.from(skillMap.values());

  if (draft.skills.length > 0) {
    const derivedNames: string[] = [];
    const derivedRecords = new Map<string, ExpertCompetencyRecord>();

    draft.skills.forEach((skill) => {
      const resolvedName = getSkillNameById(skill.id) ?? skillNameRegistry.get(skill.id) ?? skill.id;
      if (!resolvedName) {
        return;
      }
      derivedNames.push(resolvedName);
      derivedRecords.set(resolvedName, {
        name: resolvedName,
        level: skill.level,
        proofStatus: skill.proofStatus
      });
    });

    const existingNames = [...draft.competencies];
    derivedNames.forEach((name) => {
      if (!existingNames.includes(name)) {
        existingNames.push(name);
      }
    });

    const existingRecordMap = new Map<string, ExpertCompetencyRecord>();
    (draft.competencyRecords ?? []).forEach((record) => {
      if (!existingRecordMap.has(record.name)) {
        existingRecordMap.set(record.name, { ...record });
      }
    });

    draft.competencies = existingNames;
    draft.competencyRecords = existingNames.map((name) => {
      const derived = derivedRecords.get(name);
      if (derived) {
        return derived;
      }
      const existing = existingRecordMap.get(name);
      return existing ? { ...existing } : { name };
    });
  }

  if (competencyCandidates.length > 0) {
    const roleTitle = draft.title.trim();
    competencyCandidates.forEach((candidate) => {
      if (!isRoleCompetencyKnown(roleTitle, candidate.record.name)) {
        missingCompetencies.push({
          competencyName: candidate.record.name,
          roleTitle,
          rowNumber: candidate.rowNumber,
          levelLabel: candidate.levelLabel,
          proofLabel: candidate.proofLabel
        });
      }
    });
  }

  return {
    draft,
    requestedExpertId,
    errors,
    warnings,
    missingHardSkills,
    missingCompetencies,
    missingDomains
  };
};

