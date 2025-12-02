import type { TeamRole } from '../data';

export type SkillCategory = 'hard' | 'soft' | 'domain';

export type SkillSource = 'SFIA' | 'IIBA' | 'INCOSE';

export type SkillLevelId = 'A' | 'W' | 'P' | 'Ad' | 'E';

export type EvidenceStatusId =
  | 'claimed'
  | 'screened'
  | 'observed'
  | 'validated'
  | 'refuted';

export type SkillLevelDescriptor = {
  id: SkillLevelId;
  label: string;
  summary: string;
  expectedOutcomes: string[];
};

export type EvidenceStatusDescriptor = {
  id: EvidenceStatusId;
  label: string;
  description: string;
};

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  sources: SkillSource[];
  recommendedLevel: SkillLevelId;
  evidenceStatus: EvidenceStatusId;
  roles: TeamRole[];
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const slugifySkillId = (name: string): string => {
  const normalized = name.trim().toLowerCase();
  const base = normalized
    .replace(/[^0-9a-zа-яё\s-]+/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  const fallback = base || 'skill';

  let candidate = fallback;
  let counter = 1;
  while (skillRegistry[candidate]) {
    candidate = `${fallback}-${counter}`;
    counter += 1;
  }

  return candidate;
};

export const defaultTeamRoles: TeamRole[] = [
  'Владелец продукта',
  'Эксперт R&D',
  'Аналитик',
  'Backend',
  'Frontend',
  'Архитектор',
  'Тестировщик',
  'Руководитель проекта',
  'UX'
];

export const skillLevels: SkillLevelDescriptor[] = [
  {
    id: 'A',
    label: 'Awareness',
    summary: 'Базовое знакомство с концепцией и терминологией.',
    expectedOutcomes: [
      'Понимание ключевых понятий и терминов',
      'Способность определить, когда необходима поддержка эксперта'
    ]
  },
  {
    id: 'W',
    label: 'Working',
    summary: 'Умение применять знания по шаблону под руководством.',
    expectedOutcomes: [
      'Выполнение типовых задач по инструкциям',
      'Фиксация вопросов и рисков для передачи специалистам'
    ]
  },
  {
    id: 'P',
    label: 'Practitioner',
    summary: 'Самостоятельное выполнение задач средней сложности.',
    expectedOutcomes: [
      'Подготовка решений в рамках стандартных процессов',
      'Идентификация улучшений и обмен знаниями в команде'
    ]
  },
  {
    id: 'Ad',
    label: 'Advanced',
    summary: 'Глубокая экспертиза и лидерство в направлении.',
    expectedOutcomes: [
      'Разработка нестандартных решений и методов',
      'Наставничество коллег и формирование практик'
    ]
  },
  {
    id: 'E',
    label: 'Expert',
    summary: 'Формирование отраслевых стандартов и стратегий.',
    expectedOutcomes: [
      'Определение долгосрочного видения и стратегии развития навыка',
      'Представление организации на внешних мероприятиях и сообществах'
    ]
  }
];

export const evidenceStatuses: EvidenceStatusDescriptor[] = [
  {
    id: 'claimed',
    label: 'Заявлено',
    description:
      'Навык декларирован специалистом, подтверждения применения и артефактов пока отсутствуют.'
  },
  {
    id: 'screened',
    label: 'Скрининг',
    description:
      'Навык прошёл предварительную проверку, требуется наблюдение в инициативе или сбор артефактов.'
  },
  {
    id: 'observed',
    label: 'Наблюдалось',
    description:
      'Навык проявлялся в работе и подтверждён отзывами руководителя, наставника или команды.'
  },
  {
    id: 'validated',
    label: 'Подтверждено',
    description:
      'Навык проверен экспертами и подкреплён артефактами, сертификацией или аудиторским заключением.'
  },
  {
    id: 'refuted',
    label: 'Опровергнуто',
    description: 'Навык был проверен и признан неприменяемым или некорректно заявленным.'
  }
];

const initialSkills: Record<string, SkillDefinition> = {
  'requirements-elicitation': {
    id: 'requirements-elicitation',
    name: 'Сбор и анализ требований',
    description:
      'Методы выявления, структурирования и валидации требований с участием заинтересованных сторон.',
    category: 'hard',
    sources: ['IIBA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Аналитик', 'Владелец продукта', 'Руководитель проекта']
  },
  'systems-thinking': {
    id: 'systems-thinking',
    name: 'Системное мышление',
    description:
      'Умение рассматривать продукт как целостную систему, учитывать взаимосвязи компонентов и ограничений.',
    category: 'soft',
    sources: ['INCOSE'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'observed',
    roles: ['Архитектор', 'Эксперт R&D', 'Руководитель проекта']
  },
  'microservice-architecture': {
    id: 'microservice-architecture',
    name: 'Проектирование микросервисной архитектуры',
    description:
      'Построение распределённых систем с учётом устойчивости, масштабируемости и требований эксплуатации.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'validated',
    roles: ['Архитектор', 'Backend']
  },
  'data-visualization': {
    id: 'data-visualization',
    name: 'Визуализация данных',
    description:
      'Создание наглядных визуализаций для аналитики и принятия решений на основе данных.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'W',
    evidenceStatus: 'screened',
    roles: ['Аналитик', 'Frontend']
  },
  'user-research': {
    id: 'user-research',
    name: 'Пользовательские исследования',
    description:
      'Планирование и проведение интервью, юзабилити-тестов и анализ пользовательского опыта.',
    category: 'domain',
    sources: ['IIBA'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['UX', 'Владелец продукта']
  },
  leadership: {
    id: 'leadership',
    name: 'Лидерство и фасилитация',
    description: 'Умение управлять командной динамикой, мотивировать и поддерживать вовлечённость.',
    category: 'soft',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Руководитель проекта', 'Эксперт R&D']
  },
  'quality-assurance': {
    id: 'quality-assurance',
    name: 'Инженерия качества ПО',
    description:
      'Планирование и реализация стратегий тестирования, автоматизации и обеспечения качества.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Тестировщик', 'Backend']
  },
  'frontend-engineering': {
    id: 'frontend-engineering',
    name: 'Фронтенд-инжиниринг',
    description:
      'Разработка клиентских приложений, оптимизация интерфейсов и взаимодействий.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Frontend']
  },
  'knowledge-management': {
    id: 'knowledge-management',
    name: 'Управление знаниями',
    description:
      'Подходы к формированию, хранению и распространению знаний в организации.',
    category: 'soft',
    sources: ['INCOSE'],
    recommendedLevel: 'W',
    evidenceStatus: 'claimed',
    roles: ['Руководитель проекта', 'Эксперт R&D']
  },
  'domain-geology': {
    id: 'domain-geology',
    name: 'Отраслевой контекст: геология и добыча',
    description:
      'Знание ключевых процессов добычи, геологоразведки и подготовки сырья.',
    category: 'domain',
    sources: ['INCOSE'],
    recommendedLevel: 'W',
    evidenceStatus: 'observed',
    roles: ['Эксперт R&D', 'Владелец продукта']
  },
  'data-normalization': {
    id: 'data-normalization',
    name: 'Подготовка и нормализация данных',
    description:
      'Стандартизация источников, очистка и приведение к целевым моделям данных для аналитических решений.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Аналитик', 'Эксперт R&D']
  },
  'streaming-pipelines': {
    id: 'streaming-pipelines',
    name: 'Построение стриминговых пайплайнов',
    description:
      'Проектирование и эксплуатация потоковой обработки данных, обеспечение отказоустойчивости и SLA доставки.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'validated',
    roles: ['Архитектор', 'Backend']
  },
  'data-governance': {
    id: 'data-governance',
    name: 'Управление качеством и владением данными',
    description:
      'Определение ролей владения, регламентов качества и процессов каталогизации корпоративных данных.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Аналитик', 'Руководитель проекта']
  },
  'layout-optimization': {
    id: 'layout-optimization',
    name: 'Оптимизация размещения инфраструктуры',
    description:
      'Применение математических моделей и ограничений для выбора оптимального расположения объектов.',
    category: 'hard',
    sources: ['INCOSE'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'observed',
    roles: ['Архитектор', 'Эксперт R&D']
  },
  'geo-apis': {
    id: 'geo-apis',
    name: 'Геопространственные API и интеграции',
    description:
      'Разработка и интеграция геосервисов, работа с пространственными данными и ограничениями.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Backend', 'Архитектор']
  },
  'infrastructure-economics': {
    id: 'infrastructure-economics',
    name: 'Экономика инфраструктурных проектов',
    description:
      'Расчёт экономической эффективности, CAPEX/OPEX и оценка инвестиционных сценариев инфраструктуры.',
    category: 'domain',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Аналитик', 'Владелец продукта']
  },
  'financial-modeling': {
    id: 'financial-modeling',
    name: 'Финансовое моделирование',
    description:
      'Построение финансовых моделей, стресс-сценариев и анализ чувствительности.',
    category: 'hard',
    sources: ['IIBA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Аналитик', 'Владелец продукта']
  },
  'scenario-planning': {
    id: 'scenario-planning',
    name: 'Сценарное планирование',
    description:
      'Подготовка и оценка альтернативных сценариев развития с учётом рисков и ограничений.',
    category: 'soft',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Аналитик', 'Руководитель проекта']
  },
  'ma-support': {
    id: 'ma-support',
    name: 'Поддержка сделок M&A',
    description:
      'Сопровождение сделок по слияниям и поглощениям, анализ синергий и подготовка материалов.',
    category: 'domain',
    sources: ['IIBA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Аналитик', 'Владелец продукта']
  },
  'telemetry-streaming': {
    id: 'telemetry-streaming',
    name: 'Телеметрия и потоковая обработка',
    description:
      'Интеграция датчиков, построение конвейеров обработки и доставка телеметрии в режиме реального времени.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'validated',
    roles: ['Архитектор', 'Backend']
  },
  'iot-integration': {
    id: 'iot-integration',
    name: 'Интеграция промышленного IoT',
    description:
      'Подключение IoT-устройств, управление протоколами связи и безопасность производственных систем.',
    category: 'hard',
    sources: ['INCOSE'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'observed',
    roles: ['Архитектор', 'Эксперт R&D']
  },
  'sre-monitoring': {
    id: 'sre-monitoring',
    name: 'SRE и эксплуатационный мониторинг',
    description:
      'Настройка SLO/SLI, автоматизация мониторинга и инцидент-менеджмент высоконагруженных систем.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Архитектор', 'Backend']
  },
  'production-ml': {
    id: 'production-ml',
    name: 'ML для оптимизации добычи',
    description:
      'Разработка и внедрение моделей машинного обучения для управления добывающими активами.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'validated',
    roles: ['Эксперт R&D', 'Аналитик']
  },
  'mlops-production': {
    id: 'mlops-production',
    name: 'MLOps в производстве',
    description:
      'Организация жизненного цикла ML-моделей, автоматизация деплоя и мониторинга в промышленных условиях.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'screened',
    roles: ['Эксперт R&D', 'Backend']
  },
  'value-discovery': {
    id: 'value-discovery',
    name: 'Value Discovery',
    description:
      'Выявление бизнес-ценности инициатив, формирование гипотез и дорожных карт изменений.',
    category: 'soft',
    sources: ['IIBA'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Владелец продукта', 'Аналитик']
  },
  'remote-ops-integration': {
    id: 'remote-ops-integration',
    name: 'Интеграция дистанционных операций',
    description:
      'Связка систем удалённого управления, потоков телеметрии и оперативного реагирования.',
    category: 'hard',
    sources: ['INCOSE'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'observed',
    roles: ['Архитектор', 'Эксперт R&D']
  },
  'remote-ops-security': {
    id: 'remote-ops-security',
    name: 'Безопасность дистанционных операций',
    description:
      'Обеспечение кибербезопасности и устойчивости систем дистанционного управления производством.',
    category: 'hard',
    sources: ['INCOSE'],
    recommendedLevel: 'Ad',
    evidenceStatus: 'observed',
    roles: ['Архитектор']
  },
  'change-management': {
    id: 'change-management',
    name: 'Управление изменениями',
    description:
      'Подготовка и проведение программ изменений, управление вовлечением и обучением команд.',
    category: 'soft',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Руководитель проекта', 'Владелец продукта']
  },
  'wwo-planning': {
    id: 'wwo-planning',
    name: 'Планирование ГТМ и ремонтов скважин',
    description:
      'Формирование программ ГТМ/ТКРС, координация ресурсов и контроль исполнения.',
    category: 'domain',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Руководитель проекта', 'Аналитик']
  },
  'contractor-management': {
    id: 'contractor-management',
    name: 'Управление подрядчиками',
    description:
      'Организация работы с подрядными организациями, контроль SLA и качества услуг.',
    category: 'soft',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Руководитель проекта']
  },
  'process-digitization': {
    id: 'process-digitization',
    name: 'Цифровизация производственных процессов',
    description:
      'Перевод регламентов и операций в цифровые форматы, автоматизация и контроль исполнения.',
    category: 'hard',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Руководитель проекта', 'Эксперт R&D']
  },
  'data-storytelling': {
    id: 'data-storytelling',
    name: 'Data Storytelling',
    description:
      'Подготовка аналитических историй, визуализаций и презентаций для вовлечения стейкхолдеров.',
    category: 'soft',
    sources: ['IIBA'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Аналитик', 'Владелец продукта']
  },
  'field-dispatching': {
    id: 'field-dispatching',
    name: 'Диспетчеризация полевых работ',
    description:
      'Организация оперативного управления бригадами, координация ресурсов и логистики на месторождениях.',
    category: 'domain',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Руководитель проекта', 'Аналитик']
  },
  forecasting: {
    id: 'forecasting',
    name: 'Прогнозирование производственных показателей',
    description:
      'Построение прогнозов на основе исторических данных, сценариев и сезонных факторов.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Аналитик', 'Эксперт R&D']
  },
  'mobile-solutions': {
    id: 'mobile-solutions',
    name: 'Мобильные решения для производства',
    description:
      'Проектирование и внедрение мобильных приложений для оперативного персонала и полевых команд.',
    category: 'hard',
    sources: ['SFIA'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Frontend', 'Владелец продукта']
  },
  'wwo-analytics': {
    id: 'wwo-analytics',
    name: 'Аналитика WWO-процессов',
    description:
      'Сбор и анализ показателей ремонтов скважин, подготовка рекомендаций по повышению эффективности.',
    category: 'hard',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'screened',
    roles: ['Аналитик', 'Эксперт R&D']
  },
  'hse-compliance': {
    id: 'hse-compliance',
    name: 'Соответствие требованиям HSE',
    description:
      'Контроль соблюдения стандартов промышленной безопасности, охраны труда и экологии.',
    category: 'domain',
    sources: ['INCOSE'],
    recommendedLevel: 'P',
    evidenceStatus: 'observed',
    roles: ['Руководитель проекта', 'Эксперт R&D']
  }
};

type SkillListener = () => void;

const skillRegistry: Record<string, SkillDefinition> = {};
const roleSkillIndex = new Map<TeamRole, Set<string>>();
const roleRegistry = new Set<TeamRole>(defaultTeamRoles);

const ROLE_SKILL_STORAGE_KEY = 'role-competency-registry:v1';

let roleToSkillsMap: Record<TeamRole, string[]> = {} as Record<TeamRole, string[]>;
let registryVersion = 0;
const registryListeners = new Set<SkillListener>();

type StoredSkillRegistry = {
  roles: TeamRole[];
  skills: SkillDefinition[];
};

const resetRegistry = () => {
  roleRegistry.clear();
  roleSkillIndex.clear();
  Object.keys(skillRegistry).forEach((key) => {
    delete skillRegistry[key];
  });
};

const isStoredSkillDefinition = (value: unknown): value is SkillDefinition => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    ['hard', 'soft', 'domain'].includes(candidate.category as string) &&
    isStringArray(candidate.sources) &&
    isStringArray(candidate.roles) &&
    ['A', 'W', 'P', 'Ad', 'E'].includes(candidate.recommendedLevel as string) &&
    ['claimed', 'screened', 'observed', 'validated', 'refuted'].includes(
      candidate.evidenceStatus as string
    )
  );
};

const loadRegistryFromStorage = (): StoredSkillRegistry | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(ROLE_SKILL_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const snapshot = parsed as Partial<StoredSkillRegistry>;

    if (!Array.isArray(snapshot.skills) || !snapshot.skills.every(isStoredSkillDefinition)) {
      return null;
    }

    const roles = Array.isArray(snapshot.roles)
      ? snapshot.roles.filter((role): role is TeamRole => typeof role === 'string')
      : [];

    return {
      roles,
      skills: snapshot.skills
    };
  } catch {
    return null;
  }
};

const normalizeRole = (role: TeamRole): TeamRole | null => {
  const normalized = role.trim();
  return normalized ? (normalized as TeamRole) : null;
};

const registerRoleValue = (role: TeamRole): TeamRole | null => {
  const normalized = normalizeRole(role);
  if (!normalized) {
    return null;
  }
  roleRegistry.add(normalized);
  return normalized;
};

const persistRegistry = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const payload: StoredSkillRegistry = {
      roles: Array.from(roleRegistry).sort((a, b) => a.localeCompare(b, 'ru')),
      skills: Object.values(skillRegistry).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    };

    window.localStorage.setItem(ROLE_SKILL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
};

const rebuildRoleIndex = () => {
  const next: Record<TeamRole, string[]> = {} as Record<TeamRole, string[]>;
  roleRegistry.forEach((role) => {
    next[role] = [];
  });
  roleSkillIndex.forEach((set, role) => {
    const normalized = normalizeRole(role);
    if (!normalized) {
      return;
    }
    next[normalized] = Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  });
  roleToSkillsMap = next;
};

const notifyRegistryChange = () => {
  registryVersion += 1;
  persistRegistry();
  registryListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Skill registry listener failed', error);
    }
  });
};

const normalizeSkillDefinition = (definition: SkillDefinition): SkillDefinition => {
  const id = definition.id.trim();
  const name = definition.name.trim();
  const description = definition.description.trim();
  const sources = Array.from(new Set(definition.sources.map((source) => source.trim()))).filter(
    (source) => source.length > 0
  ) as SkillSource[];
  const roles = Array.from(new Set(definition.roles.map((role) => normalizeRole(role)).filter(Boolean))) as TeamRole[];

  return {
    ...definition,
    id,
    name,
    description,
    sources,
    roles
  };
};

const upsertSkillDefinition = (
  definition: SkillDefinition,
  options: { silent?: boolean } = {}
): SkillDefinition => {
  const normalized = normalizeSkillDefinition(definition);
  const previous = skillRegistry[normalized.id];

  normalized.roles.forEach((role) => registerRoleValue(role));

  if (previous) {
    previous.roles.forEach((role) => {
      const set = roleSkillIndex.get(role);
      if (!set) {
        return;
      }
      set.delete(previous.id);
      if (set.size === 0) {
        roleSkillIndex.delete(role);
      }
    });
  }

  skillRegistry[normalized.id] = normalized;
  normalized.roles.forEach((role) => {
    const set = roleSkillIndex.get(role) ?? new Set<string>();
    set.add(normalized.id);
    roleSkillIndex.set(role, set);
  });

  rebuildRoleIndex();

  if (!options.silent) {
    notifyRegistryChange();
  }

  return normalized;
};

const hydrateRegistry = (snapshot: StoredSkillRegistry | null) => {
  resetRegistry();

  const baseRoles = snapshot?.roles ?? defaultTeamRoles;
  baseRoles.forEach((role) => registerRoleValue(role));

  const definitions = snapshot?.skills ?? Object.values(initialSkills);
  definitions.forEach((definition) => {
    upsertSkillDefinition(definition, { silent: true });
  });

  rebuildRoleIndex();

  persistRegistry();
};

hydrateRegistry(loadRegistryFromStorage());

export const skills = skillRegistry;

export { roleToSkillsMap };

export const getKnownRoles = (): TeamRole[] => {
  return Array.from(roleRegistry).sort((a, b) => a.localeCompare(b, 'ru'));
};

export const getSkillRegistryVersion = (): number => registryVersion;

export const subscribeToSkillRegistry = (listener: SkillListener): (() => void) => {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
};

export const registerSkillDefinition = (definition: SkillDefinition): SkillDefinition =>
  upsertSkillDefinition(definition);

export const ensureSkillDefinition = (definition: SkillDefinition): SkillDefinition => {
  const existing = skillRegistry[definition.id];
  if (existing) {
    return existing;
  }
  return upsertSkillDefinition(definition);
};

export const getSkillsByRole = (role: TeamRole): SkillDefinition[] => {
  const skillIds = roleToSkillsMap[role] ?? [];
  return skillIds.map((id) => skillRegistry[id]).filter((skill): skill is SkillDefinition => Boolean(skill));
};

export const getSkillIdsByRole = (role: TeamRole): string[] => roleToSkillsMap[role] ?? [];

export const getRolesForSkill = (skillId: string): TeamRole[] => skillRegistry[skillId]?.roles ?? [];

export const getSkillNameById = (skillId: string): string | undefined => skillRegistry[skillId]?.name;

export const findSkillByName = (name: string): SkillDefinition | undefined => {
  const normalized = name.trim().toLowerCase();
  return Object.values(skillRegistry).find((skill) => skill.name.toLowerCase() === normalized);
};

export const registerAdHocSkill = (
  name: string,
  category: Exclude<SkillCategory, 'domain'>,
  roles: TeamRole[] = []
): SkillDefinition | null => {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return null;
  }

  const existing = findSkillByName(normalizedName);

  const normalizedRoles = Array.from(
    new Set(
      roles
        .map((role) => registerRoleValue(role))
        .filter((role): role is TeamRole => Boolean(role))
    )
  );

  const mergedRoles = Array.from(
    new Set([...(existing?.roles ?? []), ...normalizedRoles])
  ) as TeamRole[];

  const definition: SkillDefinition = existing
    ? { ...existing, roles: mergedRoles }
    : {
        id: slugifySkillId(normalizedName),
        name: normalizedName,
        description: normalizedName,
        category,
        sources: [],
        recommendedLevel: 'P',
        evidenceStatus: 'claimed',
        roles: mergedRoles
      };

  return upsertSkillDefinition(definition);
};

export const registerRole = (role: TeamRole): TeamRole | null => {
  const normalized = registerRoleValue(role);
  if (!normalized) {
    return null;
  }
  rebuildRoleIndex();
  notifyRegistryChange();
  return normalized;
};

export const deleteRole = (role: TeamRole): void => {
  const normalized = normalizeRole(role);
  if (!normalized || !roleRegistry.has(normalized)) {
    return;
  }

  roleRegistry.delete(normalized);
  roleSkillIndex.delete(normalized);

  Object.values(skillRegistry).forEach((definition) => {
    if (!definition.roles.includes(normalized)) {
      return;
    }
    const roles = definition.roles.filter((value) => value !== normalized);
    upsertSkillDefinition({ ...definition, roles }, { silent: true });
  });

  rebuildRoleIndex();
  notifyRegistryChange();
};

export const renameRole = (current: TeamRole, next: TeamRole): void => {
  const currentNormalized = normalizeRole(current);
  const nextNormalized = normalizeRole(next);

  if (!currentNormalized || !nextNormalized) {
    return;
  }

  if (currentNormalized === nextNormalized) {
    registerRole(nextNormalized);
    return;
  }

  const currentSkills = roleSkillIndex.get(currentNormalized);

  if (currentSkills) {
    roleSkillIndex.set(nextNormalized, new Set(currentSkills));
    roleSkillIndex.delete(currentNormalized);
  }

  roleRegistry.delete(currentNormalized);
  roleRegistry.add(nextNormalized);

  Object.values(skillRegistry).forEach((definition) => {
    if (!definition.roles.includes(currentNormalized)) {
      return;
    }
    const roles = Array.from(
      new Set(
        definition.roles.map((role) => (role === currentNormalized ? nextNormalized : role))
      )
    ) as TeamRole[];
    upsertSkillDefinition({ ...definition, roles }, { silent: true });
  });

  rebuildRoleIndex();
  notifyRegistryChange();
};

export const setRoleSkills = (role: TeamRole, skillIds: string[]): void => {
  const normalizedRole = registerRoleValue(role);
  if (!normalizedRole) {
    return;
  }

  const normalizedSkillIds = new Set<string>(
    skillIds.map((id) => id.trim()).filter((id) => id.length > 0)
  );

  Object.values(skillRegistry).forEach((definition) => {
    const hasRole = definition.roles.includes(normalizedRole);
    const shouldHaveRole = normalizedSkillIds.has(definition.id);

    if (hasRole === shouldHaveRole) {
      return;
    }

    const roles = shouldHaveRole
      ? [...definition.roles, normalizedRole]
      : definition.roles.filter((value) => value !== normalizedRole);

    upsertSkillDefinition({ ...definition, roles }, { silent: true });
  });

  rebuildRoleIndex();
  notifyRegistryChange();
};
