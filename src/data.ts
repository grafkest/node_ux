export type DomainNode = {
  id: string;
  name: string;
  description?: string;
  children?: DomainNode[];
  /**
   * Корневые домены используются как группирующие папки и не попадают в граф или статистику.
   */
  isCatalogRoot?: boolean;
  experts?: string[];
  meetupLink?: string;
};

export type ModuleStatus = 'in-dev' | 'production' | 'deprecated';

export type ModuleInput = {
  id: string;
  label: string;
  sourceId?: string;
};

export type ModuleOutput = {
  id: string;
  label: string;
  artifactId?: string;
};

export type TeamRole = string;

export type TeamMember = {
  id: string;
  fullName: string;
  role: TeamRole;
};

export type RidOwner = {
  company: string;
  division: string;
};

export type ExpertAvailability = 'available' | 'partial' | 'busy';

export type SkillLevel = 'A' | 'W' | 'P' | 'Ad' | 'E';

export type SkillEvidenceStatus =
  | 'claimed'
  | 'screened'
  | 'observed'
  | 'validated'
  | 'refuted';

export type SkillEvidenceRecord = {
  status: SkillEvidenceStatus;
  initiativeId?: string;
  artifactIds?: string[];
  comment?: string;
};

export type SkillInterestLevel = 'high' | 'medium' | 'low';

export type SkillUsage = {
  from: string;
  to?: string;
  description?: string;
};

export type ExpertCompetencyRecord = {
  name: string;
  level?: SkillLevel;
  proofStatus?: SkillEvidenceStatus;
};

export type ExpertSkill = {
  id: string;
  level: SkillLevel;
  proofStatus: SkillEvidenceStatus;
  evidence: SkillEvidenceRecord[];
  usage?: SkillUsage;
  createdAt?: string;
  artifacts: string[];
  interest: SkillInterestLevel;
  availableFte: number;
};

export type ExpertProfile = {
  id: string;
  fullName: string;
  title: string;
  summary: string;
  domains: string[];
  modules: string[];
  competencies: string[];
  competencyRecords?: ExpertCompetencyRecord[];
  consultingSkills: string[];
  softSkills: string[];
  focusAreas: string[];
  experienceYears: number;
  location: string;
  contact: string;
  languages: string[];
  notableProjects: string[];
  availability: ExpertAvailability;
  availabilityComment: string;
  skills: ExpertSkill[];
};

const normalizeRoleTitle = (role: string): string => role.trim().toLowerCase();

const roleCompetencyIndex = new Map<string, Set<string>>();

const addCompetencyToRoleIndex = (roleTitle: string, competency: string) => {
  const normalizedRole = normalizeRoleTitle(roleTitle);
  if (!normalizedRole) {
    return;
  }
  const normalizedCompetency = competency.trim();
  if (!normalizedCompetency) {
    return;
  }
  const current = roleCompetencyIndex.get(normalizedRole) ?? new Set<string>();
  current.add(normalizedCompetency);
  roleCompetencyIndex.set(normalizedRole, current);
};

export const getRoleCompetencies = (roleTitle: string): string[] => {
  const normalizedRole = normalizeRoleTitle(roleTitle);
  const values = roleCompetencyIndex.get(normalizedRole);
  if (!values) {
    return [];
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'ru'));
};

export const isRoleCompetencyKnown = (roleTitle: string, competency: string): boolean => {
  const normalizedRole = normalizeRoleTitle(roleTitle);
  if (!normalizedRole) {
    return false;
  }
  const normalizedCompetency = competency.trim();
  if (!normalizedCompetency) {
    return false;
  }
  return roleCompetencyIndex.get(normalizedRole)?.has(normalizedCompetency) ?? false;
};

export const registerRoleCompetency = (roleTitle: string, competency: string): void => {
  addCompetencyToRoleIndex(roleTitle, competency);
};

export type InitiativeStatus = 'initiated' | 'in-progress' | 'converted';

export type InitiativeWork = {
  id: string;
  title: string;
  description: string;
  effortHours: number;
};

export type InitiativeRequirement = {
  id: string;
  role: TeamRole;
  skills: string[];
  count: number;
  comment?: string;
};

export type InitiativeCandidateScore = {
  criterion: string;
  weight: number;
  value: number;
  comment?: string;
};

export type InitiativeCandidate = {
  expertId: string;
  score: number;
  fitComment: string;
  riskTags: string[];
  scoreDetails: InitiativeCandidateScore[];
};

export type InitiativeRoleWork = {
  id: string;
  title: string;
  description: string;
  startDay: number;
  durationDays: number;
  effortDays: number;
  tasks?: string[];
  assignedExpertId?: string;
};

export type InitiativeRolePlan = {
  id: string;
  role: TeamRole;
  required: number;
  pinnedExpertIds: string[];
  candidates: InitiativeCandidate[];
  workItems?: InitiativeRoleWork[];
};

export type InitiativeCustomer = {
  companies: string[];
  units: string[];
  representative: string;
  contact: string;
  comment?: string;
};

export type InitiativeRisk = {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  createdAt: string;
};

export type Initiative = InitiativeNode & {
  status: InitiativeStatus;
  owner: string;
  expectedImpact: string;
  targetModuleName: string;
  lastUpdated: string;
  risks: InitiativeRisk[];
  roles: InitiativeRolePlan[];
  potentialModules: string[];
  works: InitiativeWork[];
  requirements: InitiativeRequirement[];
  customer?: InitiativeCustomer;
};

export type LibraryDependency = {
  name: string;
  version: string;
};

export type CompanyUsage = {
  name: string;
  licenses: number;
};

export type UserStats = {
  companies: CompanyUsage[];
};

export type ModuleMetrics = {
  tests: number;
  coverage: number;
  automationRate: number;
};

export type NonFunctionalRequirements = {
  responseTimeMs: number;
  throughputRps: number;
  resourceConsumption: string;
  baselineUsers: number;
};

export type ModuleNode = {
  id: string;
  name: string;
  description: string;
  domains: string[];
  creatorCompany: string;
  productName: string;
  projectTeam: TeamMember[];
  technologyStack: string[];
  localization: string;
  ridOwner: RidOwner;
  userStats: UserStats;
  status: ModuleStatus;
  repository?: string;
  api?: string;
  specificationUrl: string;
  apiContractsUrl: string;
  techDesignUrl: string;
  architectureDiagramUrl: string;
  licenseServerIntegrated: boolean;
  libraries: LibraryDependency[];
  clientType: 'desktop' | 'web';
  deploymentTool: 'docker' | 'kubernetes';
  dependencies: string[];
  produces: string[];
  reuseScore: number;
  metrics: ModuleMetrics;
  dataIn: ModuleInput[];
  dataOut: ModuleOutput[];
  formula: string;
  nonFunctional: NonFunctionalRequirements;
};

export type InitiativeWorkItemStatus = 'discovery' | 'design' | 'pilot' | 'delivery';

export type InitiativeWorkItem = {
  id: string;
  title: string;
  description: string;
  owner: string;
  status: InitiativeWorkItemStatus;
  timeframe: string;
};

export type InitiativeApprovalStatus = 'pending' | 'in-progress' | 'approved';

export type InitiativeApprovalStage = {
  id: string;
  title: string;
  approver: string;
  status: InitiativeApprovalStatus;
  comment?: string;
};

export type InitiativeNode = {
  id: string;
  name: string;
  description: string;
  domains: string[];
  startDate?: string;
  plannedModuleIds: string[];
  requiredSkills: string[];
  workItems: InitiativeWorkItem[];
  approvalStages: InitiativeApprovalStage[];
};

export const domainTree: DomainNode[] = [
  {
    id: 'upstream',
    name: 'Добыча',
    description:
      'Сквозная производственная вертикаль от геологоразведки до подготовки сырья к транспортировке.',
    isCatalogRoot: true,
    children: [
      {
        id: 'upstream-strategy',
        name: 'Стратегия разработки месторождений',
        description: 'Портфельное планирование и оценка ресурсной базы по всей группе активов.',
        isCatalogRoot: true,
        children: [
          {
            id: 'resource-evaluation',
            name: 'Оценка запасов и ресурсов',
            description: 'Классификация запасов, баланс и сценарный анализ прироста ресурсов.',
            experts: ['Галина Михайлова', 'Егор Устинов'],
            meetupLink: 'https://meetups.nedra.digital/resources'
          },
          {
            id: 'seismic-interpretation',
            name: 'Сейсмическая интерпретация',
            description: 'Комплексная интерпретация сейсморазведочных данных и построение структурных карт.',
            experts: ['Наталья Родина', 'Владимир Гуляев'],
            meetupLink: 'https://meetups.nedra.digital/seismic'
          },
          {
            id: 'development-scenarios',
            name: 'Сценарии разработки',
            description: 'Формирование долгосрочных программ разработки месторождений и технико-экономическая оценка.',
            experts: ['Александр Трофимов', 'Полина Данилова'],
            meetupLink: 'https://meetups.nedra.digital/scenario'
          }
        ]
      },
      {
        id: 'upstream-engineering',
        name: 'Инженерия промысла',
        description: 'Проектирование наземной инфраструктуры, фонда скважин и логистических маршрутов.',
        isCatalogRoot: true,
        children: [
          {
            id: 'data-preparation',
            name: 'Подготовка исходных данных',
            description:
              'Сбор и нормализация исходных данных для моделирования схем обустройства',
            experts: ['Ирина Соколова', 'Павел Ефимов'],
            meetupLink: 'https://meetups.nedra.digital/infraplan-data'
          },
          {
            id: 'layout-optimization',
            name: 'Оптимизация размещения',
            description:
              'Автоматическое размещение объектов с учётом технологических и топографических ограничений',
            experts: ['Антон Чернышёв', 'Дарья Гончарова'],
            meetupLink: 'https://meetups.nedra.digital/layout'
          },
          {
            id: 'economic-evaluation',
            name: 'Экономическая оценка',
            description:
              'Формирование экономических показателей и подготовка досье по варианту инфраструктуры',
            experts: ['Михаил Якушев', 'Алина Коваль'],
            meetupLink: 'https://meetups.nedra.digital/economics'
          },
          {
            id: 'surface-readiness',
            name: 'Промысловая подготовка площадок',
            description:
              'Контроль готовности кустовых площадок, коммуникаций и систем энергообеспечения к вводу.',
            experts: ['Сергей Минаев', 'Екатерина Левина'],
            meetupLink: 'https://meetups.nedra.digital/surface'
          }
        ]
      },
      {
        id: 'upstream-production-operations',
        name: 'Операционное управление добычей',
        description: 'Мониторинг, оптимизация и оперативное управление добывающими активами.',
        isCatalogRoot: true,
        children: [
          {
            id: 'production-operations-hub',
            name: 'Ситуационные центры',
            description: 'Объединённый мониторинг производственных показателей и управление KPI.',
            experts: ['Алексей Богомолов', 'Жанна Литвинова'],
            meetupLink: 'https://meetups.nedra.digital/ops-hub'
          },
          {
            id: 'real-time-monitoring',
            name: 'Онлайн-мониторинг',
            description: 'Сбор и визуализация телеметрии наземной инфраструктуры в реальном времени',
            experts: ['Александр Романов', 'Дарья Климова'],
            meetupLink: 'https://meetups.nedra.digital/digital-operations'
          },
          {
            id: 'production-optimization',
            name: 'Оптимизация режимов',
            description: 'Рекомендации по повышению эффективности работы фонда',
            experts: ['Елена Соболева', 'Максим Корнеев'],
            meetupLink: 'https://meetups.nedra.digital/production-optimization'
          },
          {
            id: 'remote-control',
            name: 'Дистанционное управление',
            description: 'Удалённое управление производственными узлами и интеграция с АСУТП',
            experts: ['Игорь Чернецов', 'Людмила Киселёва'],
            meetupLink: 'https://meetups.nedra.digital/remote-control'
          }
        ]
      },
      {
        id: 'upstream-well-operations',
        name: 'Внутрискважинные операции',
        description: 'Планирование, контроль и аналитика работ по ремонту и стимулированию скважин.',
        isCatalogRoot: true,
        children: [
          {
            id: 'workover-program-design',
            name: 'Проектирование ГТМ',
            description: 'Подбор технологий стимулирования и расчёт ожидаемого прироста добычи.',
            experts: ['Максим Орлов', 'Марина Гольцова'],
            meetupLink: 'https://meetups.nedra.digital/workover-design'
          },
          {
            id: 'workover-planning',
            name: 'Планирование ГТМ и ТКРС',
            description: 'Формирование и согласование программ работ по скважинам',
            experts: ['Илья Юрьев', 'Ольга Шаталова'],
            meetupLink: 'https://meetups.nedra.digital/workover'
          },
          {
            id: 'field-execution',
            name: 'Исполнение в поле',
            description: 'Контроль исполнения ремонтов и взаимодействие с подрядчиками',
            experts: ['Роман Баранов', 'Анастасия Мошкина'],
            meetupLink: 'https://meetups.nedra.digital/field-execution'
          },
          {
            id: 'quality-analytics',
            name: 'Аналитика качества работ',
            description: 'Оценка эффективности ремонтов и выявление узких мест процессов',
            experts: ['Виталий Сергеев', 'Олеся Рябцева'],
            meetupLink: 'https://meetups.nedra.digital/workover-analytics'
          }
        ]
      },
      {
        id: 'upstream-flow-assurance',
        name: 'Подготовка и транспорт продукции',
        description: 'Наземные системы сбора, подготовки и транспортировки углеводородов.',
        isCatalogRoot: true,
        children: [
          {
            id: 'gathering-systems',
            name: 'Системы сбора продукции',
            description: 'Моделирование и оптимизация схем сбора с фонтанных, газлифтных и насосных скважин.',
            experts: ['Руслан Ибрагимов', 'Тамара Зайцева'],
            meetupLink: 'https://meetups.nedra.digital/gathering'
          },
          {
            id: 'oil-treatment',
            name: 'Подготовка нефти и газа',
            description: 'Контроль обезвоживания, стабилизации и подготовки продукции к сдаче.',
            experts: ['Андрей Лаврентьев', 'Наталия Брыкина'],
            meetupLink: 'https://meetups.nedra.digital/treatment'
          },
          {
            id: 'pipeline-monitoring',
            name: 'Мониторинг трубопроводов',
            description: 'Диагностика герметичности, мониторинг коррозии и управление рисками утечек.',
            experts: ['Пётр Якубов', 'Инна Асташова'],
            meetupLink: 'https://meetups.nedra.digital/pipeline'
          }
        ]
      }
    ]
  }
];

export const domainNameById: Record<string, string> = (() => {
  const map: Record<string, string> = {};

  const walk = (nodes: DomainNode[]) => {
    nodes.forEach((node) => {
      map[node.id] = node.name;
      if (node.children) {
        walk(node.children);
      }
    });
  };

  walk(domainTree);
  return map;
})();

export const modules: ModuleNode[] = [
  {
    id: 'module-infraplan-datahub',
    name: 'INFRAPLAN DataHub',
    description:
      'Консолидирует инженерные и производственные данные, нормализует их и подготавливает к инфраструктурному моделированию.',
    domains: ['data-preparation'],
    creatorCompany: 'INFRAPLAN Data Services',
    productName: 'Nedra.Production INFRAPLAN',
    projectTeam: [
      { id: 'infraplan-owner', fullName: 'Алексей Сорокин', role: 'Владелец продукта' },
      { id: 'infraplan-rd', fullName: 'Виктория Бережная', role: 'Эксперт R&D' },
      { id: 'infraplan-analyst', fullName: 'Мария Гусева', role: 'Аналитик' },
      { id: 'infraplan-backend', fullName: 'Сергей Трофимов', role: 'Backend' },
      { id: 'infraplan-frontend', fullName: 'Юлия Рогова', role: 'Frontend' },
      { id: 'infraplan-architect', fullName: 'Дмитрий Валов', role: 'Архитектор' },
      { id: 'infraplan-tester', fullName: 'Лилия Нуриева', role: 'Тестировщик' }
    ],
    technologyStack: ['TypeScript', 'NestJS', 'PostgreSQL', 'Apache Airflow'],
    localization: 'Мультиязычная (ru, en)',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Дирекция концептуального проектирования'
    },
    userStats: {
      companies: [
        { name: 'АО «Западнефть Разработка»', licenses: 180 },
        { name: 'ООО «Цифровая Добыча»', licenses: 140 },
        { name: 'АО «Восток Инжиниринг»', licenses: 120 },
        { name: 'АО «УралТех Сервис»', licenses: 100 },
        { name: 'ООО «Арктик Ойл»', licenses: 80 }
      ]
    },
    status: 'production',
    repository: 'https://git.nedra.digital/infraplan/data-hub',
    api: 'REST /api/v2/infraplan/source-packs',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=80101',
    apiContractsUrl: 'https://kb.nedra.digital/display/IP/API+Infraplan+DataHub',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=80212',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/infraplan-datahub',
    licenseServerIntegrated: true,
    libraries: [
      { name: '@nestjs/core', version: '10.3.2' },
      { name: 'typeorm', version: '0.3.20' },
      { name: 'airflow-client', version: '2.9.0' }
    ],
    clientType: 'web',
    deploymentTool: 'kubernetes',
    dependencies: [],
    produces: ['artifact-infraplan-source-pack'],
    reuseScore: 0.81,
    metrics: {
      tests: 194,
      coverage: 92,
      automationRate: 89
    },
    dataIn: [
      {
        id: 'raw-geodata',
        label: 'Геодезические данные месторождений'
      },
      {
        id: 'production-limits',
        label: 'Технологические ограничения добычи'
      }
    ],
    dataOut: [
      {
        id: 'normalized-inputs',
        label: 'Стандартизированный пакет исходных данных',
        artifactId: 'artifact-infraplan-source-pack'
      }
    ],
    formula: 'normalized = preprocess(raw) ⊕ constraints',
    nonFunctional: {
      responseTimeMs: 350,
      throughputRps: 160,
      resourceConsumption: '4 vCPU / 16 GB RAM',
      baselineUsers: 95
    }
  },
  {
    id: 'module-infraplan-layout',
    name: 'INFRAPLAN Layout Engine',
    description:
      'Автоматизирует подбор вариантов размещения объектов обустройства с учётом рельефа, технологических и экологических ограничений.',
    domains: ['layout-optimization'],
    creatorCompany: 'INFRAPLAN Modeling',
    productName: 'Nedra.Production INFRAPLAN',
    projectTeam: [
      { id: 'layout-owner', fullName: 'Надежда Малахова', role: 'Владелец продукта' },
      { id: 'layout-rd', fullName: 'Павел Колосов', role: 'Эксперт R&D' },
      { id: 'layout-analyst', fullName: 'Олеся Харитонова', role: 'Аналитик' },
      { id: 'layout-backend', fullName: 'Игорь Фирсов', role: 'Backend' },
      { id: 'layout-frontend', fullName: 'Григорий Ким', role: 'Frontend' },
      { id: 'layout-architect', fullName: 'Ирина Цой', role: 'Архитектор' },
      { id: 'layout-tester', fullName: 'Полина Крючкова', role: 'Тестировщик' }
    ],
    technologyStack: ['Python', 'FastAPI', 'PostGIS', 'OptaPlanner'],
    localization: 'Мультиязычная (ru, en)',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Дирекция концептуального проектирования'
    },
    userStats: {
      companies: [
        { name: 'АО «Западнефть Разработка»', licenses: 120 },
        { name: 'ПАО «СибНефть Добыча»', licenses: 100 },
        { name: 'АО «Восток Инжиниринг»', licenses: 90 },
        { name: 'ООО «Каспий ГеоСервис»', licenses: 70 }
      ]
    },
    status: 'production',
    repository: 'https://git.nedra.digital/infraplan/layout-engine',
    api: 'REST /api/v1/infraplan/layouts',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=81145',
    apiContractsUrl: 'https://kb.nedra.digital/display/IP/Layout+API',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=81192',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/infraplan-layout',
    licenseServerIntegrated: true,
    libraries: [
      { name: 'fastapi', version: '0.111.0' },
      { name: 'geopandas', version: '0.14.3' },
      { name: 'optapy', version: '9.43.0' }
    ],
    clientType: 'web',
    deploymentTool: 'kubernetes',
    dependencies: ['module-infraplan-datahub'],
    produces: ['artifact-infraplan-layout'],
    reuseScore: 0.77,
    metrics: {
      tests: 156,
      coverage: 88,
      automationRate: 84
    },
    dataIn: [
      {
        id: 'normalized-inputs-ref',
        label: 'Стандартизированный пакет исходных данных',
        sourceId: 'artifact-infraplan-source-pack'
      },
      {
        id: 'topology-constraints',
        label: 'Ограничения по рельефу и охранным зонам'
      }
    ],
    dataOut: [
      {
        id: 'layout-scenarios',
        label: 'Сценарии размещения объектов',
        artifactId: 'artifact-infraplan-layout'
      }
    ],
    formula: 'total_cost = Σ(distance_i * cost_i) + Σ(site_j * capex_j)',
    nonFunctional: {
      responseTimeMs: 540,
      throughputRps: 95,
      resourceConsumption: '8 vCPU / 32 GB RAM',
      baselineUsers: 60
    }
  },
  {
    id: 'module-infraplan-economics',
    name: 'INFRAPLAN Economics',
    description:
      'Расчитывает экономическую эффективность вариантов обустройства и формирует инвестиционные досье.',
    domains: ['economic-evaluation'],
    creatorCompany: 'INFRAPLAN Economics',
    productName: 'Nedra.Production INFRAPLAN',
    projectTeam: [
      { id: 'econ-owner', fullName: 'Светлана Дорофеева', role: 'Владелец продукта' },
      { id: 'econ-rd', fullName: 'Антон Власов', role: 'Эксперт R&D' },
      { id: 'econ-analyst', fullName: 'Татьяна Бортникова', role: 'Аналитик' },
      { id: 'econ-backend', fullName: 'Леонид Архипов', role: 'Backend' },
      { id: 'econ-frontend', fullName: 'Андрей Усов', role: 'Frontend' },
      { id: 'econ-architect', fullName: 'Валерий Макаров', role: 'Архитектор' },
      { id: 'econ-tester', fullName: 'Елизавета Федорова', role: 'Тестировщик' }
    ],
    technologyStack: ['C#', '.NET 8', 'MS SQL', 'Power BI'],
    localization: 'Мультиязычная (ru, en)',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Дирекция концептуального проектирования'
    },
    userStats: {
      companies: [
        { name: 'АО «Западнефть Разработка»', licenses: 120 },
        { name: 'ООО «Цифровая Добыча»', licenses: 100 },
        { name: 'ПАО «СибНефть Добыча»', licenses: 90 },
        { name: 'АО «Байкал Нефтехим»', licenses: 80 },
        { name: 'АО «Волжская Эксплуатация»', licenses: 60 }
      ]
    },
    status: 'production',
    repository: 'https://git.nedra.digital/infraplan/economics',
    api: 'REST /api/v1/infraplan/economics',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=82133',
    apiContractsUrl: 'https://kb.nedra.digital/display/IP/Economics+API',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=82178',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/infraplan-economics',
    licenseServerIntegrated: true,
    libraries: [
      { name: 'AutoMapper', version: '13.0.1' },
      { name: 'MediatR', version: '12.1.1' },
      { name: 'ClosedXML', version: '0.102.4' }
    ],
    clientType: 'desktop',
    deploymentTool: 'kubernetes',
    dependencies: ['module-infraplan-datahub', 'module-infraplan-layout'],
    produces: ['artifact-infraplan-economic-report'],
    reuseScore: 0.84,
    metrics: {
      tests: 208,
      coverage: 93,
      automationRate: 88
    },
    dataIn: [
      {
        id: 'source-pack-input',
        label: 'Стандартизированный пакет исходных данных',
        sourceId: 'artifact-infraplan-source-pack'
      },
      {
        id: 'layout-input',
        label: 'Сценарии размещения объектов',
        sourceId: 'artifact-infraplan-layout'
      }
    ],
    dataOut: [
      {
        id: 'investment-scenarios',
        label: 'Инвестиционные сценарии по вариантам',
        artifactId: 'artifact-infraplan-economic-report'
      }
    ],
    formula: 'NPV_variant = Σ((cash_flow_t - opex_t) / (1 + WACC)^t) - capex_variant',
    nonFunctional: {
      responseTimeMs: 780,
      throughputRps: 55,
      resourceConsumption: '10 vCPU / 40 GB RAM',
      baselineUsers: 45
    }
  },
  {
    id: 'module-dtwin-monitoring',
    name: 'DIGITAL TWIN Monitoring',
    description:
      'Собирает телеметрию наземной инфраструктуры в реальном времени и формирует интегрированное хранилище цифрового двойника.',
    domains: ['real-time-monitoring'],
    creatorCompany: 'Digital Twin Telemetry',
    productName: 'Nedra.Production DIGITAL TWIN',
    projectTeam: [
      { id: 'dtwin-mon-owner', fullName: 'Егор Панин', role: 'Владелец продукта' },
      { id: 'dtwin-mon-rd', fullName: 'Раиса Чистякова', role: 'Эксперт R&D' },
      { id: 'dtwin-mon-analyst', fullName: 'Илья Константинов', role: 'Аналитик' },
      { id: 'dtwin-mon-backend', fullName: 'Даниил Аргунов', role: 'Backend' },
      { id: 'dtwin-mon-frontend', fullName: 'Екатерина Руднева', role: 'Frontend' },
      { id: 'dtwin-mon-architect', fullName: 'Глеб Лапшин', role: 'Архитектор' },
      { id: 'dtwin-mon-tester', fullName: 'Алина Токарева', role: 'Тестировщик' }
    ],
    technologyStack: ['Go', 'gRPC', 'Apache Kafka', 'ClickHouse'],
    localization: 'Мультиязычная (ru, en, ar)',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Операционный центр цифровых двойников'
    },
    userStats: {
      companies: [
        { name: 'ПАО «СибНефть Добыча»', licenses: 480 },
        { name: 'АО «СеверЭнерго Бурение»', licenses: 420 },
        { name: 'ООО «Каспий ГеоСервис»', licenses: 360 },
        { name: 'АО «Байкал Нефтехим»', licenses: 340 },
        { name: 'ООО «Нордик Потенциал»', licenses: 300 },
        { name: 'АО «Волжская Эксплуатация»', licenses: 200 }
      ]
    },
    status: 'production',
    repository: 'https://git.nedra.digital/dtwin/monitoring',
    api: 'gRPC dtwin.Telemetry/Stream',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=83114',
    apiContractsUrl: 'https://kb.nedra.digital/display/DT/Telemetry+API',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=83180',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/dtwin-monitoring',
    licenseServerIntegrated: true,
    libraries: [
      { name: 'segmentio/kafka-go', version: '0.4.46' },
      { name: 'prometheus/client_golang', version: '1.19.0' },
      { name: 'clickhouse-go', version: '2.0.5' }
    ],
    clientType: 'web',
    deploymentTool: 'kubernetes',
    dependencies: [],
    produces: ['artifact-dtwin-telemetry-cube'],
    reuseScore: 0.9,
    metrics: {
      tests: 312,
      coverage: 95,
      automationRate: 92
    },
    dataIn: [
      {
        id: 'scada-stream',
        label: 'Поток телеметрии АСУ ТП'
      },
      {
        id: 'field-sensor-payload',
        label: 'Данные датчиков и подключённых устройств'
      },
      {
        id: 'equipment-passports',
        label: 'Паспорта оборудования и технологические схемы'
      }
    ],
    dataOut: [
      {
        id: 'telemetry-cube',
        label: 'Интегрированный куб телеметрии',
        artifactId: 'artifact-dtwin-telemetry-cube'
      }
    ],
    formula: 'metric = smooth(raw_signal, window=5)',
    nonFunctional: {
      responseTimeMs: 180,
      throughputRps: 520,
      resourceConsumption: '12 vCPU / 48 GB RAM',
      baselineUsers: 320
    }
  },
  {
    id: 'module-dtwin-optimizer',
    name: 'DIGITAL TWIN Optimizer',
    description:
      'Генерирует рекомендации по управлению режимами объектов и прогнозирует эффект от внедрения цифрового двойника.',
    domains: ['production-optimization'],
    creatorCompany: 'Digital Twin Orchestration',
    productName: 'Nedra.Production DIGITAL TWIN',
    projectTeam: [
      { id: 'dtwin-opt-owner', fullName: 'Тимур Алиев', role: 'Владелец продукта' },
      { id: 'dtwin-opt-rd', fullName: 'Елизар Копылов', role: 'Эксперт R&D' },
      { id: 'dtwin-opt-analyst', fullName: 'Жанна Алимбекова', role: 'Аналитик' },
      { id: 'dtwin-opt-backend', fullName: 'Пётр Швецов', role: 'Backend' },
      { id: 'dtwin-opt-frontend', fullName: 'Анастасия Кручинина', role: 'Frontend' },
      { id: 'dtwin-opt-architect', fullName: 'Кирилл Рыбаков', role: 'Архитектор' },
      { id: 'dtwin-opt-tester', fullName: 'Софья Герасимова', role: 'Тестировщик' }
    ],
    technologyStack: ['Python', 'PyTorch', 'FastAPI', 'Redis'],
    localization: 'Мультиязычная (ru, en)',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Операционный центр цифровых двойников'
    },
    userStats: {
      companies: [
        { name: 'ПАО «СибНефть Добыча»', licenses: 400 },
        { name: 'АО «СеверЭнерго Бурение»', licenses: 350 },
        { name: 'ООО «Цифровая Добыча»', licenses: 300 },
        { name: 'АО «Восток Инжиниринг»', licenses: 250 },
        { name: 'АО «Прикамский Промысел»', licenses: 200 }
      ]
    },
    status: 'production',
    repository: 'https://git.nedra.digital/dtwin/optimizer',
    api: 'REST /api/v1/dtwin/optimization-orders',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=84102',
    apiContractsUrl: 'https://kb.nedra.digital/display/DT/Optimizer+API',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=84164',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/dtwin-optimizer',
    licenseServerIntegrated: true,
    libraries: [
      { name: 'fastapi', version: '0.111.0' },
      { name: 'torch', version: '2.2.2' },
      { name: 'redis', version: '5.0.1' }
    ],
    clientType: 'web',
    deploymentTool: 'kubernetes',
    dependencies: ['module-dtwin-monitoring'],
    produces: ['artifact-dtwin-optimization-orders'],
    reuseScore: 0.88,
    metrics: {
      tests: 248,
      coverage: 91,
      automationRate: 90
    },
    dataIn: [
      {
        id: 'telemetry-cube-input',
        label: 'Интегрированный куб телеметрии',
        sourceId: 'artifact-dtwin-telemetry-cube'
      },
      {
        id: 'infraplan-context',
        label: 'Инфраструктурный контекст из INFRAPLAN',
        sourceId: 'artifact-infraplan-source-pack'
      },
      {
        id: 'operational-constraints',
        label: 'Ограничения по режимам и безопасные диапазоны'
      }
    ],
    dataOut: [
      {
        id: 'optimization-orders',
        label: 'Команды оптимизации режимов',
        artifactId: 'artifact-dtwin-optimization-orders'
      }
    ],
    formula: 'optimal_mode = argmax(strategy_score)',
    nonFunctional: {
      responseTimeMs: 260,
      throughputRps: 210,
      resourceConsumption: '16 vCPU / 64 GB RAM (GPU)',
      baselineUsers: 240
    }
  },
  {
    id: 'module-dtwin-remote-control',
    name: 'DIGITAL TWIN Remote Ops',
    description:
      'Обеспечивает дистанционное управление производственными узлами и обратную связь по выполнению команд.',
    domains: ['remote-control'],
    creatorCompany: 'Digital Twin Remote Ops',
    productName: 'Nedra.Production DIGITAL TWIN',
    projectTeam: [
      { id: 'dtwin-remote-owner', fullName: 'Оксана Кривцова', role: 'Владелец продукта' },
      { id: 'dtwin-remote-rd', fullName: 'Игорь Шамов', role: 'Эксперт R&D' },
      { id: 'dtwin-remote-analyst', fullName: 'Руслан Сабиров', role: 'Аналитик' },
      { id: 'dtwin-remote-backend', fullName: 'Тарас Мельник', role: 'Backend' },
      { id: 'dtwin-remote-frontend', fullName: 'Елена Сучкова', role: 'Frontend' },
      { id: 'dtwin-remote-architect', fullName: 'Геннадий Борисов', role: 'Архитектор' },
      { id: 'dtwin-remote-tester', fullName: 'Зульфия Хасанова', role: 'Тестировщик' }
    ],
    technologyStack: ['TypeScript', 'Node.js', 'gRPC', 'WebSocket'],
    localization: 'Мультиязычная (ru, en)',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Операционный центр цифровых двойников'
    },
    userStats: {
      companies: [
        { name: 'АО «СеверЭнерго Бурение»', licenses: 140 },
        { name: 'ООО «Арктик Ойл»', licenses: 110 },
        { name: 'АО «УралТех Сервис»', licenses: 90 },
        { name: 'ООО «Тюменский Ресурс»', licenses: 80 }
      ]
    },
    status: 'in-dev',
    repository: 'https://git.nedra.digital/dtwin/remote-ops',
    api: 'gRPC dtwin.RemoteControl/Dispatch',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=85133',
    apiContractsUrl: 'https://kb.nedra.digital/display/DT/Remote+Ops+API',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=85188',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/dtwin-remote-ops',
    licenseServerIntegrated: false,
    libraries: [
      { name: '@grpc/grpc-js', version: '1.10.4' },
      { name: 'ws', version: '8.17.1' },
      { name: '@nestjs/microservices', version: '10.3.2' }
    ],
    clientType: 'web',
    deploymentTool: 'docker',
    dependencies: ['module-dtwin-optimizer'],
    produces: ['artifact-dtwin-remote-commands'],
    reuseScore: 0.64,
    metrics: {
      tests: 132,
      coverage: 85,
      automationRate: 78
    },
    dataIn: [
      {
        id: 'optimization-orders-input',
        label: 'Команды оптимизации режимов',
        sourceId: 'artifact-dtwin-optimization-orders'
      },
      {
        id: 'scada-feedback',
        label: 'Обратная связь от исполнительных устройств'
      }
    ],
    dataOut: [
      {
        id: 'remote-command-stream',
        label: 'Поток дистанционных команд',
        artifactId: 'artifact-dtwin-remote-commands'
      }
    ],
    formula: 'command = translate(order, device_profile)',
    nonFunctional: {
      responseTimeMs: 140,
      throughputRps: 95,
      resourceConsumption: '6 vCPU / 18 GB RAM',
      baselineUsers: 120
    }
  },
  {
    id: 'module-wwo-planner',
    name: 'WWO Planner',
    description:
      'Формирует и согласует программы ремонтно-изоляционных и капитальных работ по скважинам.',
    domains: ['workover-planning'],
    creatorCompany: 'WWO Planning Office',
    productName: 'Nedra.Production WWO',
    projectTeam: [
      { id: 'wwo-plan-owner', fullName: 'Галина Кручина', role: 'Владелец продукта' },
      { id: 'wwo-plan-rd', fullName: 'Владимир Романов', role: 'Эксперт R&D' },
      { id: 'wwo-plan-analyst', fullName: 'Сергей Ежов', role: 'Аналитик' },
      { id: 'wwo-plan-backend', fullName: 'Ирина Сафонова', role: 'Backend' },
      { id: 'wwo-plan-frontend', fullName: 'Степан Юрин', role: 'Frontend' },
      { id: 'wwo-plan-architect', fullName: 'Рита Лапина', role: 'Архитектор' },
      { id: 'wwo-plan-tester', fullName: 'Дарья Мартынова', role: 'Тестировщик' }
    ],
    technologyStack: ['Java', 'Spring Boot', 'Camunda', 'Oracle DB'],
    localization: 'Только русский язык',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Центр внутрискважинных операций'
    },
    userStats: {
      companies: [
        { name: 'АО «Западнефть Разработка»', licenses: 180 },
        { name: 'АО «УралТех Сервис»', licenses: 160 },
        { name: 'АО «Прикамский Промысел»', licenses: 150 },
        { name: 'ООО «Енисей ТехИнтеграция»', licenses: 130 },
        { name: 'АО «Полярное Бурение»', licenses: 110 }
      ]
    },
    status: 'production',
    repository: 'https://git.nedra.digital/wwo/planner',
    api: 'REST /api/v1/wwo/plans',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=86172',
    apiContractsUrl: 'https://kb.nedra.digital/display/WWO/Planner+API',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=86218',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/wwo-planner',
    licenseServerIntegrated: true,
    libraries: [
      { name: 'spring-boot-starter-web', version: '3.3.2' },
      { name: 'camunda-bpm-spring-boot-starter', version: '7.20.0' },
      { name: 'oracle-ojdbc8', version: '23.2.0.0' }
    ],
    clientType: 'desktop',
    deploymentTool: 'kubernetes',
    dependencies: [],
    produces: ['artifact-wwo-plan'],
    reuseScore: 0.79,
    metrics: {
      tests: 188,
      coverage: 86,
      automationRate: 82
    },
    dataIn: [
      {
        id: 'operations-history',
        label: 'История внутрискважинных работ',
        sourceId: 'artifact-wwo-operations-log'
      },
      {
        id: 'resource-register',
        label: 'Каталог бригад и оборудования'
      }
    ],
    dataOut: [
      {
        id: 'approved-workover-plan',
        label: 'Утверждённые программы работ по скважинам',
        artifactId: 'artifact-wwo-plan'
      }
    ],
    formula: 'schedule = optimize(tasks, crews, constraints)',
    nonFunctional: {
      responseTimeMs: 620,
      throughputRps: 75,
      resourceConsumption: '8 vCPU / 28 GB RAM',
      baselineUsers: 210
    }
  },
  {
    id: 'module-wwo-execution',
    name: 'WWO Field Execution',
    description:
      'Контролирует выполнение ремонтных и изоляционных работ, собирает фактические параметры и фотоотчёты с площадки.',
    domains: ['field-execution'],
    creatorCompany: 'WWO Field Operations',
    productName: 'Nedra.Production WWO',
    projectTeam: [
      { id: 'wwo-exec-owner', fullName: 'Фарид Мансуров', role: 'Владелец продукта' },
      { id: 'wwo-exec-rd', fullName: 'Маргарита Курганская', role: 'Эксперт R&D' },
      { id: 'wwo-exec-analyst', fullName: 'Даниил Сомов', role: 'Аналитик' },
      { id: 'wwo-exec-backend', fullName: 'Руслан Абдулов', role: 'Backend' },
      { id: 'wwo-exec-frontend', fullName: 'Алёна Лещёва', role: 'Frontend' },
      { id: 'wwo-exec-architect', fullName: 'Павел Саврасов', role: 'Архитектор' },
      { id: 'wwo-exec-tester', fullName: 'Инга Хамзатова', role: 'Тестировщик' }
    ],
    technologyStack: ['Kotlin', 'Android', 'RealmDB', 'MQTT'],
    localization: 'Мультиязычная (ru, en)',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Центр внутрискважинных операций'
    },
    userStats: {
      companies: [
        { name: 'АО «Прикамский Промысел»', licenses: 360 },
        { name: 'ООО «Енисей ТехИнтеграция»', licenses: 320 },
        { name: 'АО «Полярное Бурение»', licenses: 300 },
        { name: 'ООО «Тюменский Ресурс»', licenses: 270 }
      ]
    },
    status: 'production',
    repository: 'https://git.nedra.digital/wwo/execution',
    api: 'REST /api/v1/wwo/operations-log',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=87155',
    apiContractsUrl: 'https://kb.nedra.digital/display/WWO/Execution+API',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=87192',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/wwo-execution',
    licenseServerIntegrated: true,
    libraries: [
      { name: 'ktor', version: '2.3.12' },
      { name: 'realm-android', version: '10.16.1' },
      { name: 'eclipse-paho-mqtt', version: '1.2.5' }
    ],
    clientType: 'desktop',
    deploymentTool: 'docker',
    dependencies: ['module-wwo-planner'],
    produces: ['artifact-wwo-operations-log'],
    reuseScore: 0.71,
    metrics: {
      tests: 142,
      coverage: 83,
      automationRate: 79
    },
    dataIn: [
      {
        id: 'workover-plan-input',
        label: 'Утверждённые программы работ',
        sourceId: 'artifact-wwo-plan'
      },
      {
        id: 'field-directives',
        label: 'Локальные распоряжения и регламенты'
      }
    ],
    dataOut: [
      {
        id: 'operations-log',
        label: 'Фактический журнал операций',
        artifactId: 'artifact-wwo-operations-log'
      }
    ],
    formula: 'compliance_rate = completed_operations / planned_operations',
    nonFunctional: {
      responseTimeMs: 210,
      throughputRps: 120,
      resourceConsumption: '4 vCPU / 12 GB RAM',
      baselineUsers: 480
    }
  },
  {
    id: 'module-wwo-analytics',
    name: 'WWO Analytics',
    description:
      'Анализирует эффективность ремонтов, выявляет отклонения и поддерживает управленческие решения по фонду скважин.',
    domains: ['quality-analytics'],
    creatorCompany: 'WWO Analytics Lab',
    productName: 'Nedra.Production WWO',
    projectTeam: [
      { id: 'wwo-analytics-owner', fullName: 'Ольга Вершинина', role: 'Владелец продукта' },
      { id: 'wwo-analytics-rd', fullName: 'Денис Лаптев', role: 'Эксперт R&D' },
      { id: 'wwo-analytics-analyst', fullName: 'Жанна Егорова', role: 'Аналитик' },
      { id: 'wwo-analytics-backend', fullName: 'Никита Яшин', role: 'Backend' },
      { id: 'wwo-analytics-frontend', fullName: 'Инна Миронова', role: 'Frontend' },
      { id: 'wwo-analytics-architect', fullName: 'Марк Федоров', role: 'Архитектор' },
      { id: 'wwo-analytics-tester', fullName: 'Яна Андреева', role: 'Тестировщик' }
    ],
    technologyStack: ['TypeScript', 'React', 'Apache Superset', 'GraphQL'],
    localization: 'Мультиязычная (ru, en)',
    ridOwner: {
      company: 'АО «Nedra Digital»',
      division: 'Центр внутрискважинных операций'
    },
    userStats: {
      companies: [
        { name: 'АО «УралТех Сервис»', licenses: 260 },
        { name: 'ООО «Енисей ТехИнтеграция»', licenses: 240 },
        { name: 'АО «Полярное Бурение»', licenses: 240 },
        { name: 'АО «Волжская Эксплуатация»', licenses: 240 }
      ]
    },
    status: 'in-dev',
    repository: 'https://git.nedra.digital/wwo/analytics',
    api: 'GraphQL /wwo/analytics',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=88104',
    apiContractsUrl: 'https://kb.nedra.digital/display/WWO/Analytics+API',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=88156',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/wwo-analytics',
    licenseServerIntegrated: true,
    libraries: [
      { name: 'react', version: '18.3.1' },
      { name: '@apollo/client', version: '3.10.5' },
      { name: '@consta/charts', version: '1.0.0' }
    ],
    clientType: 'web',
    deploymentTool: 'kubernetes',
    dependencies: ['module-wwo-planner', 'module-wwo-execution'],
    produces: ['artifact-wwo-performance-dashboard'],
    reuseScore: 0.67,
    metrics: {
      tests: 118,
      coverage: 82,
      automationRate: 76
    },
    dataIn: [
      {
        id: 'operations-log-input',
        label: 'Фактический журнал операций',
        sourceId: 'artifact-wwo-operations-log'
      },
      {
        id: 'plan-baseline',
        label: 'Утверждённые программы работ',
        sourceId: 'artifact-wwo-plan'
      },
      {
        id: 'quality-standards',
        label: 'Стандарты и регламенты работ'
      }
    ],
    dataOut: [
      {
        id: 'workover-kpi',
        label: 'Индекс эффективности внутрискважинных работ',
        artifactId: 'artifact-wwo-performance-dashboard'
      }
    ],
    formula: 'kpi = Σ(metric_i * weight_i)',
    nonFunctional: {
      responseTimeMs: 480,
      throughputRps: 90,
      resourceConsumption: '6 vCPU / 20 GB RAM',
      baselineUsers: 260
    }
  },
  {
    id: 'module-lab-experiments',
    name: 'Digital Lab Experiments',
    description:
      'Площадка для быстрых продуктовых экспериментов, собирающая телеметрию и мгновенно распространяющая результаты в продуктовые команды.',
    domains: ['real-time-monitoring', 'production-optimization'],
    creatorCompany: 'Лаборатория цифровых испытаний',
    productName: 'Digital Operations Suite',
    projectTeam: [
      { id: 'lab-owner', fullName: 'Кира Левина', role: 'Владелец продукта' },
      { id: 'lab-architect', fullName: 'Евгений Власов', role: 'Архитектор' },
      { id: 'lab-backend', fullName: 'Тимур Назаров', role: 'Backend' },
      { id: 'lab-frontend', fullName: 'Лидия Костина', role: 'Frontend' }
    ],
    technologyStack: ['TypeScript', 'FastAPI', 'Apache Kafka', 'ClickHouse'],
    localization: 'ru',
    ridOwner: { company: 'АО «Nedra Digital»', division: 'Дирекция цифровых операций' },
    userStats: {
      companies: [
        { name: 'ООО «Нордик Потенциал»', licenses: 60 },
        { name: 'ООО «Каспий ГеоСервис»', licenses: 50 },
        { name: 'АО «Полярное Бурение»', licenses: 30 }
      ]
    },
    status: 'in-dev',
    repository: 'https://git.nedra.digital/labs/digital-experiments',
    api: 'gRPC telemetry.TelemetryService',
    specificationUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=98501',
    apiContractsUrl: 'https://kb.nedra.digital/display/LABS/Telemetry+Contracts',
    techDesignUrl: 'https://kb.nedra.digital/pages/viewpage.action?pageId=98540',
    architectureDiagramUrl: 'https://design.nedra.digital/diagrams/lab-experiments',
    licenseServerIntegrated: false,
    libraries: [
      { name: '@nestjs/microservices', version: '10.3.2' },
      { name: 'kafkajs', version: '2.2.4' },
      { name: '@apollo/client', version: '3.10.8' }
    ],
    clientType: 'web',
    deploymentTool: 'kubernetes',
    dependencies: ['module-dtwin-monitoring'],
    produces: [],
    reuseScore: 0.34,
    metrics: {
      tests: 84,
      coverage: 78,
      automationRate: 71
    },
    dataIn: [
      {
        id: 'lab-live-stream',
        label: 'Поток телеметрии промышленных датчиков',
        sourceId: 'artifact-dtwin-telemetry-cube'
      },
      {
        id: 'lab-layout-scenarios',
        label: 'Сценарии размещения для экспериментов',
        sourceId: 'artifact-infraplan-layout'
      }
    ],
    dataOut: [
      {
        id: 'lab-insights',
        label: 'Отчёт по проведённым экспериментам'
      }
    ],
    formula: 'insight = normalize(stream) ⊕ simulate(layout)',
    nonFunctional: {
      responseTimeMs: 220,
      throughputRps: 210,
      resourceConsumption: '5 vCPU / 12 GB RAM',
      baselineUsers: 65
    }
  }
];


export const initiativeNodes: InitiativeNode[] = [
  {
    id: 'initiative-digital-pad',
    name: 'Цифровая кустовая площадка',
    description:
      'Создание цифрового контура подготовки площадок и проектирования наземной инфраструктуры для новых кустов скважин.',
    domains: ['layout-optimization', 'surface-readiness'],
    startDate: '2025-01-06',
    plannedModuleIds: ['module-infraplan-layout', 'module-infraplan-datahub', 'module-infraplan-economics'],
    requiredSkills: [
      'Оптимизация промысловой инфраструктуры',
      'Инженерное моделирование',
      'Геопространственный анализ',
      'Управление проектными данными'
    ],
    workItems: [
      {
        id: 'digital-pad-discovery',
        title: 'Сбор исходных требований площадок',
        description: 'Анализ технологических ограничений и данных геодезии для типовых кустов.',
        owner: 'Дарья Гончарова',
        status: 'discovery',
        timeframe: 'Q1 2025'
      },
      {
        id: 'digital-pad-design',
        title: 'Проектирование сценариев размещения',
        description: 'Настройка алгоритмов оптимизации и сценарного анализа по выбранным полигонам.',
        owner: 'Антон Чернышёв',
        status: 'design',
        timeframe: 'Q2 2025'
      },
      {
        id: 'digital-pad-pilot',
        title: 'Пилотирование в Восток Инжиниринг',
        description: 'Совместная проверка расчётов и интеграция с INFRAPLAN Economics.',
        owner: 'Александр Трофимов',
        status: 'pilot',
        timeframe: 'Q3 2025'
      }
    ],
    approvalStages: [
      {
        id: 'digital-pad-architecture',
        title: 'Архитектурный комитет',
        approver: 'Дмитрий Валов',
        status: 'approved',
        comment: 'Целевая архитектура согласована, необходимо оформить план пилота.'
      },
      {
        id: 'digital-pad-finance',
        title: 'Финансовый комитет',
        approver: 'Марина Крылова',
        status: 'in-progress',
        comment: 'Требуется уточнить эффект по CAPEX для пилотных кустов.'
      },
      {
        id: 'digital-pad-operations',
        title: 'Операционный совет',
        approver: 'Игорь Ковалёв',
        status: 'pending'
      }
    ]
  },
  {
    id: 'initiative-remote-operations',
    name: 'Единый контур дистанционного управления',
    description:
      'Интеграция цифровых двойников и сервисов диспетчеризации для безопасного дистанционного управления фонда скважин.',
    domains: ['real-time-monitoring', 'workover-automation'],
    startDate: '2024-11-18',
    plannedModuleIds: [
      'module-dtwin-optimizer',
      'module-dtwin-remote-ops',
      'module-wwo-planner'
    ],
    requiredSkills: [
      'Стриминговая обработка телеметрии',
      'Интеграция SCADA-систем',
      'Проектирование процессов дистанционного управления',
      'Управление изменениями'
    ],
    workItems: [
      {
        id: 'remote-ops-discovery',
        title: 'Картирование процессов и ролей',
        description: 'Интервью с операторами и формализация цепочки принятия решений.',
        owner: 'Ирина Сафонова',
        status: 'discovery',
        timeframe: 'Q4 2024'
      },
      {
        id: 'remote-ops-design',
        title: 'Проектирование интеграции SCADA',
        description: 'Выбор каналов обмена и сценарии переключения режимов.',
        owner: 'Геннадий Борисов',
        status: 'design',
        timeframe: 'Q1 2025'
      },
      {
        id: 'remote-ops-delivery',
        title: 'Запуск дистанционных процедур',
        description: 'Обучение диспетчеров и выход в опытную эксплуатацию.',
        owner: 'Галина Кручина',
        status: 'delivery',
        timeframe: 'Q3 2025'
      }
    ],
    approvalStages: [
      {
        id: 'remote-ops-safety',
        title: 'Комитет промышленной безопасности',
        approver: 'Сергей Ежов',
        status: 'in-progress',
        comment: 'Подготовлены регламенты по аварийному отключению.'
      },
      {
        id: 'remote-ops-it',
        title: 'ИТ-архитектурный совет',
        approver: 'Леонид Архипов',
        status: 'pending'
      }
    ]
  },
  {
    id: 'initiative-dtwin-remote',
    name: 'Цифровой двойник удалённого промысла',
    description:
      'Запуск цифрового двойника удалённого промысла с круглосуточным мониторингом телеметрии и сценарным моделированием отклонений.',
    domains: ['real-time-monitoring', 'data-preparation'],
    startDate: '2024-10-21',
    plannedModuleIds: [
      'module-dtwin-monitoring',
      'module-dtwin-optimizer',
      'module-dtwin-remote-control'
    ],
    requiredSkills: [
      'Стриминговая обработка телеметрии',
      'Архитектура цифровых двойников',
      'Интеграция SCADA-систем'
    ],
    workItems: [
      {
        id: 'dtwin-remote-discovery',
        title: 'Аудит телеметрии и готовности промысла',
        description: 'Проверка каналов связи, стабильности поставки данных и готовности инфраструктуры для цифрового двойника.',
        owner: 'Раиса Чистякова',
        status: 'discovery',
        timeframe: 'Q4 2024'
      },
      {
        id: 'dtwin-remote-design',
        title: 'Проектирование пайплайна данных и моделей',
        description: 'Настройка потоковой обработки телеметрии, интеграция SCADA и построение моделей отклонений.',
        owner: 'Павел Колосов',
        status: 'design',
        timeframe: 'Q1 2025'
      },
      {
        id: 'dtwin-remote-pilot',
        title: 'Запуск пилота на удалённом промысле',
        description: 'Развёртывание цифрового двойника, подключение операторов и настройка процедур реагирования.',
        owner: 'Ирина Сафонова',
        status: 'pilot',
        timeframe: 'Q2 2025'
      }
    ],
    approvalStages: [
      {
        id: 'dtwin-remote-architecture',
        title: 'Архитектурный комитет',
        approver: 'Дмитрий Валов',
        status: 'approved',
        comment: 'Одобрено при условии контроля устойчивости каналов связи.'
      },
      {
        id: 'dtwin-remote-operations',
        title: 'Операционный совет',
        approver: 'Сергей Ежов',
        status: 'in-progress',
        comment: 'Требуется согласовать план реагирования при потере телеметрии.'
      }
    ]
  },
  {
    id: 'initiative-infraplan-economics',
    name: 'Конвертация экономического модуля INFRAPLAN под M&A',
    description:
      'Расширение экономического блока INFRAPLAN для поддержки сделок M&A и стресс-тестов финансовых сценариев.',
    domains: ['economic-evaluation', 'development-scenarios'],
    startDate: '2024-08-19',
    plannedModuleIds: ['module-infraplan-economics', 'module-infraplan-datahub'],
    requiredSkills: [
      'Финансовое моделирование M&A',
      'Интеграция корпоративных данных',
      'Аналитика экономических эффектов'
    ],
    workItems: [
      {
        id: 'infraplan-mna-discovery',
        title: 'Инвентаризация данных и методик',
        description: 'Сбор требований к финансовым моделям и оценка качества доступных источников.',
        owner: 'Антон Власов',
        status: 'discovery',
        timeframe: 'Q3 2024'
      },
      {
        id: 'infraplan-mna-design',
        title: 'Разработка моделей и сценариев',
        description: 'Настройка стресс-тестов, интеграция с DataHub и подготовка шаблонов отчётности.',
        owner: 'Виктория Бережная',
        status: 'design',
        timeframe: 'Q4 2024'
      },
      {
        id: 'infraplan-mna-delivery',
        title: 'Внедрение и обучение команд',
        description: 'Пилотирование функциональности и обучение аналитиков корпоративного центра.',
        owner: 'Жанна Алимбекова',
        status: 'delivery',
        timeframe: 'Q1 2025'
      }
    ],
    approvalStages: [
      {
        id: 'infraplan-mna-finance',
        title: 'Финансовый комитет',
        approver: 'Марина Крылова',
        status: 'in-progress',
        comment: 'Необходимо подтвердить экономический эффект от автоматизации оценки сделки.'
      },
      {
        id: 'infraplan-mna-risk',
        title: 'Комитет по управлению рисками',
        approver: 'Игорь Ковалёв',
        status: 'pending'
      }
    ]
  }
];


export const experts: ExpertProfile[] = [
  {
    id: 'expert-viktoria-berezhnaya',
    fullName: 'Виктория Бережная',
    title: 'Ведущий эксперт по инфраструктурным данным',
    summary:
      'Отвечает за стандарты подготовки инженерных данных и адаптацию источников под цифровые двойники и инфраструктурное моделирование.',
    domains: ['data-preparation', 'real-time-monitoring'],
    modules: ['module-infraplan-datahub'],
    competencies: [
      'Нормализация инженерных данных',
      'Оркестрация ETL-пайплайнов',
      'Стриминговая обработка телеметрии',
      'Data Governance для инфраструктурных проектов',
      'Проектирование моделей данных'
    ],
    consultingSkills: [
      'Аудит качества исходных данных',
      'Настройка процессов каталогизации данных',
      'Фасилитация дизайн-сессий по источникам',
      'Проведение обучения по управлению данными',
      'Запуск ситуационных центров мониторинга'
    ],
    softSkills: [
      'Коммуникация с заказчиком данных',
      'Наставничество аналитиков',
      'Фасилитация кросс-функциональных сессий',
      'Управление изменениями в командах данных'
    ],
    focusAreas: [
      'Ускорение подготовки пакетов для моделирования',
      'Стандартизация справочников по добыче',
      'Связь DataHub и ситуационных центров'
    ],
    experienceYears: 9,
    location: 'Тюмень',
    contact: 'v.berezhnaya@nedra.digital',
    languages: ['ru', 'en'],
    notableProjects: [
      'Создала методологию DataHub для семи месторождений',
      'Выстроила мониторинг качества источников в ПАО «СибНефть Добыча»'
    ],
    availability: 'available',
    availabilityComment: 'Может подключиться к 1–2 консалтинговым инициативам в квартал',
    skills: [
      {
        id: 'data-normalization',
        level: 'E',
        proofStatus: 'validated',
        evidence: [
          {
            status: 'validated',
            initiativeId: 'initiative-digital-pad',
            artifactIds: ['artifact-infraplan-source-pack'],
            comment: 'Пилотирование конвейера нормализации данных для цифровой площадки'
          }
        ],
        usage: {
          from: '2024-01-15',
          to: '2024-04-01',
          description: 'Стандартизация инженерных датасетов для DataHub на месторождениях «Северный купол» и «Арктика»'
        },
        artifacts: ['artifact-infraplan-source-pack'],
        interest: 'high',
        availableFte: 0.4
      },
      {
        id: 'streaming-pipelines',
        level: 'Ad',
        proofStatus: 'validated',
        evidence: [
          {
            status: 'validated',
            initiativeId: 'initiative-remote-operations',
            artifactIds: ['artifact-dtwin-telemetry-cube'],
            comment: 'Потоковые пайплайны телеметрии для ситуационных центров'
          }
        ],
        usage: {
          from: '2022-09-01',
          to: '2024-02-20',
          description: 'Поддержка Kafka-пайплайнов телеметрии для ситуационных центров Nedra.Production'
        },
        artifacts: ['artifact-dtwin-telemetry-cube'],
        interest: 'medium',
        availableFte: 0.3
      },
      {
        id: 'data-governance',
        level: 'Ad',
        proofStatus: 'screened',
        evidence: [
          {
            status: 'screened',
            initiativeId: 'initiative-digital-pad',
            comment: 'Структуризация справочников и матрицы владения'
          }
        ],
        usage: {
          from: '2024-05-01',
          description: 'Разработка матрицы владения инженерными данными и процессов каталогизации'
        },
        artifacts: [],
        interest: 'high',
        availableFte: 0.2
      }
    ]
  },
  {
    id: 'expert-pavel-kolosov',
    fullName: 'Павел Колосов',
    title: 'Архитектор решений по оптимизации размещения',
    summary:
      'Фокусируется на математических моделях автоматизированного размещения объектов обустройства и интеграции геоданных.',
    domains: ['layout-optimization'],
    modules: ['module-infraplan-layout'],
    competencies: [
      'Геоинформационное моделирование',
      'Оптимизация размещения инфраструктуры',
      'Интеграция пространственных ограничений',
      'Проектирование API для геосервисов'
    ],
    consultingSkills: [
      'Модерация стратегических сессий по инфраструктуре',
      'Экспертиза по выбору подрядчиков ЛИДАР/ГАИСС',
      'Подготовка дорожных карт цифровизации проектирования',
      'Оценка экономического эффекта от автоматизации'
    ],
    softSkills: [
      'Системное мышление',
      'Переговоры с подрядчиками',
      'Фасилитация продуктовых воркшопов',
      'Визуализация сложных технических идей'
    ],
    focusAreas: [
      'Связь INFRAPLAN и цифровых двойников',
      'Поддержка сценариев для удалённых регионов',
      'Развитие библиотеки ограничений OptaPlanner'
    ],
    experienceYears: 12,
    location: 'Санкт-Петербург',
    contact: 'p.kolosov@nedra.digital',
    languages: ['ru', 'en'],
    notableProjects: [
      'Разработал оптимизационную модель для Верхнекамского кластера',
      'Сопровождал масштабирование INFRAPLAN в холдинге «Западнефть Разработка»'
    ],
    availability: 'partial',
    availabilityComment: 'Загружен проектами на 60%, доступен для стратегических консультаций',
    skills: [
      {
        id: 'layout-optimization',
        level: 'E',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2022-02-01',
          to: '2024-03-15',
          description: 'Оптимизация размещения объектов обустройства с использованием OptaPlanner'
        },
        artifacts: ['artifact-infraplan-layout'],
        interest: 'high',
        availableFte: 0.25
      },
      {
        id: 'geo-apis',
        level: 'Ad',
        proofStatus: 'claimed',
        evidence: [],
        usage: {
          from: '2021-07-01',
          to: '2024-12-10',
          description: 'Проектирование API для геосервисов и интеграции с подрядчиками ЛИДАР'
        },
        artifacts: ['artifact-infraplan-layout'],
        interest: 'medium',
        availableFte: 0.15
      },
      {
        id: 'infrastructure-economics',
        level: 'P',
        proofStatus: 'screened',
        evidence: [],
        usage: {
          from: '2024-06-01',
          description: 'Совместные расчёты экономических эффектов для сценариев размещения'
        },
        artifacts: ['artifact-infraplan-economic-report'],
        interest: 'low',
        availableFte: 0.1
      }
    ]
  },
  {
    id: 'expert-anton-vlasov',
    fullName: 'Антон Власов',
    title: 'Руководитель продуктовой экономики INFRAPLAN',
    summary:
      'Эксперт по инвестиционному анализу и связке производственных сценариев с финансовыми моделями.',
    domains: ['economic-evaluation'],
    modules: ['module-infraplan-economics'],
    competencies: [
      'Финансовое моделирование CAPEX/OPEX',
      'Расчёт NPV/IRR для инфраструктурных проектов',
      'Интеграция с ERP и бюджетными системами',
      'Сценарное моделирование инвестиционных программ'
    ],
    consultingSkills: [
      'Подготовка инвестиционных комитетов',
      'Финансовый аудит цифровых инициатив',
      'Воркшопы по управлению портфелем проектов',
      'Методическая поддержка по KPI инвестиций'
    ],
    softSkills: [
      'Переговоры с инвесторами',
      'Финансовый сторителлинг для руководства',
      'Управление заинтересованными сторонами',
      'Презентация сложных экономических моделей'
    ],
    focusAreas: [
      'Автоматизация инвестиционных досье',
      'Увязка экономических расчётов с производственными данными',
      'Подготовка сценариев для сделок M&A'
    ],
    experienceYears: 14,
    location: 'Москва',
    contact: 'a.vlasov@nedra.digital',
    languages: ['ru', 'en'],
    notableProjects: [
      'Единая модель NPV для Nedra.Production внедрена в трёх дирекциях',
      'Сопровождал сделки по покупке активов в Арктическом регионе'
    ],
    availability: 'busy',
    availabilityComment: 'Свободные слоты с ноября, возможна точечная экспертиза документов',
    skills: [
      {
        id: 'financial-modeling',
        level: 'E',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2022-01-01',
          to: '2024-04-20',
          description: 'Подготовка инвестиционных моделей для масштабирования INFRAPLAN'
        },
        artifacts: ['artifact-infraplan-economic-report'],
        interest: 'high',
        availableFte: 0.1
      },
      {
        id: 'scenario-planning',
        level: 'Ad',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2024-03-01',
          to: '2024-01-30',
          description: 'Сценарный анализ инвестиционных программ для портфеля месторождений'
        },
        artifacts: ['artifact-infraplan-economic-report'],
        interest: 'medium',
        availableFte: 0.05
      },
      {
        id: 'ma-support',
        level: 'P',
        proofStatus: 'screened',
        evidence: [],
        usage: {
          from: '2022-11-01',
          description: 'Экспертиза сделок по покупке активов в Арктическом регионе'
        },
        artifacts: [],
        interest: 'medium',
        availableFte: 0.05
      }
    ]
  },
  {
    id: 'expert-raisa-chistyakova',
    fullName: 'Раиса Чистякова',
    title: 'Технический лидер по телеметрии цифровых двойников',
    summary:
      'Организует сбор и обработку высоконагруженных потоков телеметрии, строит устойчивые пайплайны ClickHouse и Kafka.',
    domains: ['real-time-monitoring'],
    modules: ['module-dtwin-monitoring'],
    competencies: [
      'Стриминговая обработка телеметрии',
      'Оркестрация ETL-пайплайнов',
      'Архитектура ClickHouse для событийных данных',
      'Интеграция промышленного IoT',
      'Проектирование SLO для систем мониторинга'
    ],
    consultingSkills: [
      'Запуск ситуационных центров мониторинга',
      'Аудит готовности к промышленному IoT',
      'Настройка процессов Site Reliability для телеметрии',
      'Формирование карты технических рисков',
      'Настройка процессов каталогизации данных'
    ],
    softSkills: [
      'Координация команд эксплуатации',
      'Быстрая диагностика инцидентов',
      'Коммуникация с подрядчиками IoT',
      'Обучение инженеров мониторинга'
    ],
    focusAreas: [
      'Снижение задержек стриминга данных',
      'Консолидация событийного стека в холдинге',
      'Экосистема датчиков и edge-устройств'
    ],
    experienceYears: 11,
    location: 'Пермь',
    contact: 'r.chistyakova@nedra.digital',
    languages: ['ru', 'en'],
    notableProjects: [
      'Организовала потоковую обработку 520 тыс. сообщений/сек для ситуационных центров',
      'Создала стандарт подключения подрядчиков IoT к Digital Twin'
    ],
    availability: 'partial',
    availabilityComment: 'Доступна для аудитов и предпроектной диагностики на 2–3 дня в месяц',
    skills: [
      {
        id: 'telemetry-streaming',
        level: 'E',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2022-04-01',
          to: '2024-03-01',
          description: 'Поддержка ClickHouse и Kafka пайплайнов с нагрузкой 500k сообщений/сек'
        },
        artifacts: ['artifact-dtwin-telemetry-cube'],
        interest: 'high',
        availableFte: 0.2
      },
      {
        id: 'iot-integration',
        level: 'Ad',
        proofStatus: 'screened',
        evidence: [],
        usage: {
          from: '2024-02-01',
          description: 'Интеграция промышленного IoT с ситуационными центрами и Digital Twin'
        },
        artifacts: ['artifact-dtwin-telemetry-cube'],
        interest: 'medium',
        availableFte: 0.15
      },
      {
        id: 'sre-monitoring',
        level: 'Ad',
        proofStatus: 'claimed',
        evidence: [],
        usage: {
          from: '2021-11-01',
          to: '2024-10-01',
          description: 'Настройка SLO/SLI для событийных систем мониторинга'
        },
        artifacts: [],
        interest: 'high',
        availableFte: 0.1
      }
    ]
  },
  {
    id: 'expert-elizar-kopylov',
    fullName: 'Елизар Копылов',
    title: 'Лидер продуктовой аналитики цифровых двойников',
    summary:
      'Занимается разработкой ML-ядра рекомендаций по оптимизации добычи и связывает модели с операционной деятельностью.',
    domains: ['production-optimization'],
    modules: ['module-dtwin-optimizer'],
    competencies: [
      'Математическое моделирование режимов добычи',
      'Машинное обучение и A/B в производстве',
      'Интеграция с SCADA и MES системами',
      'Интеграция промышленного IoT',
      'Оркестрация ML inference на GPU'
    ],
    consultingSkills: [
      'Диагностика зрелости цифровых двойников',
      'Фасилитация Value Discovery с производством',
      'Запуск пилотов оптимизации режима добычи',
      'Настройка процессов MLOps в добыче'
    ],
    softSkills: [
      'Коучинг дата-сайентистов',
      'Перевод технических результатов на бизнес-язык',
      'Фасилитация discovery-сессий',
      'Управление ожиданиями заказчиков'
    ],
    focusAreas: [
      'Управление портфелем сценариев оптимизации',
      'Связка рекомендаций с KPI добычи',
      'Инженерная культура работы с ML-моделями'
    ],
    experienceYears: 8,
    location: 'Казань',
    contact: 'e.kopylov@nedra.digital',
    languages: ['ru', 'en'],
    notableProjects: [
      'Повысил эффективность фонтанных скважин на 4% в пилоте Digital Twin',
      'Внедрил процесс MLOps для Nedra.Production в пяти регионах'
    ],
    availability: 'available',
    availabilityComment: 'Готов подключиться к пилотам и пресейлам, приоритет — оптимизация добычи',
    skills: [
      {
        id: 'production-ml',
        level: 'E',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2022-08-01',
          to: '2024-02-15',
          description: 'Обучение и внедрение ML-моделей оптимизации добычи на 5 активах'
        },
        artifacts: ['artifact-dtwin-optimization-orders'],
        interest: 'high',
        availableFte: 0.35
      },
      {
        id: 'mlops-production',
        level: 'Ad',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2024-01-10',
          to: '2024-03-10',
          description: 'Организация конвейера MLOps для Digital Twin'
        },
        artifacts: ['artifact-dtwin-optimization-orders'],
        interest: 'medium',
        availableFte: 0.25
      },
      {
        id: 'value-discovery',
        level: 'P',
        proofStatus: 'screened',
        evidence: [],
        usage: {
          from: '2024-06-01',
          description: 'Фасилитация discovery-сессий с производством по выбору сценариев'
        },
        artifacts: [],
        interest: 'high',
        availableFte: 0.2
      }
    ]
  },
  {
    id: 'expert-igor-shamov',
    fullName: 'Игорь Шамов',
    title: 'Эксперт по дистанционному управлению производством',
    summary:
      'Построил замкнутый цикл предписание — исполнение, занимается интеграцией SCADA, MES и систем лицензирования.',
    domains: ['remote-control'],
    modules: ['module-dtwin-remote-control'],
    competencies: [
      'Интеграция SCADA и MES',
      'Кибербезопасность дистанционных операций',
      'Управление исполнительными устройствами',
      'Проектирование граничных сервисов для Remote Ops'
    ],
    consultingSkills: [
      'Аудит готовности к дистанционному управлению',
      'Разработка дорожных карт Remote Ops',
      'Обучение операторов цифровых двойников',
      'Организация change management в производстве'
    ],
    softSkills: [
      'Управление удалёнными командами',
      'Коммуникация с операторами смены',
      'Кризисное реагирование в производстве',
      'Развитие культуры безопасности'
    ],
    focusAreas: [
      'Замкнутый цикл предписание–исполнение',
      'Безопасность удалённых операций',
      'Интеграция с подрядчиками автоматизации'
    ],
    experienceYears: 13,
    location: 'Сургут',
    contact: 'i.shamov@nedra.digital',
    languages: ['ru'],
    notableProjects: [
      'Запустил дистанционное управление 120 кустовыми площадками',
      'Разработал стандарт интеграции Remote Ops с подрядчиками HSE'
    ],
    availability: 'partial',
    availabilityComment: 'Находится в проектах внедрения, доступен для очных воркшопов раз в месяц',
    skills: [
      {
        id: 'remote-ops-integration',
        level: 'E',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2021-09-01',
          to: '2024-02-28',
          description: 'Интеграция SCADA, MES и дистанционного управления на кустовых площадках'
        },
        artifacts: ['artifact-dtwin-remote-commands'],
        interest: 'high',
        availableFte: 0.2
      },
      {
        id: 'remote-ops-security',
        level: 'Ad',
        proofStatus: 'screened',
        evidence: [],
        usage: {
          from: '2022-05-01',
          description: 'Оценка и настройка кибербезопасности дистанционных операций'
        },
        artifacts: [],
        interest: 'medium',
        availableFte: 0.15
      },
      {
        id: 'change-management',
        level: 'P',
        proofStatus: 'claimed',
        evidence: [],
        usage: {
          from: '2024-04-01',
          to: '2024-01-10',
          description: 'Организация change management при внедрении Remote Ops'
        },
        artifacts: [],
        interest: 'medium',
        availableFte: 0.1
      }
    ]
  },
  {
    id: 'expert-vladimir-romanov',
    fullName: 'Владимир Романов',
    title: 'Методолог программ внутрискважинных работ',
    summary:
      'Отвечает за связку планирования ремонтно-изоляционных работ с производственными целями и управлением подрядчиками.',
    domains: ['workover-planning'],
    modules: ['module-wwo-planner'],
    competencies: [
      'Оптимизация ремонтов фонда скважин',
      'Производственное планирование и балансировка ресурсов',
      'Моделирование процессов на Camunda BPM',
      'Управление портфелем подрядчиков'
    ],
    consultingSkills: [
      'Реструктуризация процессов ГТМ',
      'Аудит KPI и SLA подрядчиков',
      'Фасилитация проектных сессий WWO',
      'Организация программ изменений для подрядчиков',
      'Разработка регламентов взаимодействия в поле'
    ],
    softSkills: [
      'Наставничество производственных менеджеров',
      'Медиативные навыки с подрядчиками',
      'Структурирование рабочих групп',
      'Презентация производственных решений'
    ],
    focusAreas: [
      'Связь планирования и исполнения',
      'Управление подрядчиками и околопроизводственными рисками',
      'Цифровые шаблоны ремонтных программ'
    ],
    experienceYears: 15,
    location: 'Самара',
    contact: 'v.romanov@nedra.digital',
    languages: ['ru'],
    notableProjects: [
      'Сократил цикл согласования программ ГТМ с 14 до 5 дней',
      'Внедрил цифровые регламенты взаимодействия с подрядчиками в трёх промыслах'
    ],
    availability: 'available',
    availabilityComment: 'Готов вести консалтинговые треки и наставничество по WWO-процессам',
    skills: [
      {
        id: 'wwo-planning',
        level: 'E',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2021-03-01',
          to: '2024-02-01',
          description: 'Оптимизация и согласование программ ГТМ для 3 промыслов'
        },
        artifacts: ['artifact-wwo-plan'],
        interest: 'high',
        availableFte: 0.3
      },
      {
        id: 'contractor-management',
        level: 'Ad',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2022-05-01',
          to: '2024-03-20',
          description: 'Выстраивание взаимодействия с подрядчиками и SLA по ремонтам'
        },
        artifacts: [],
        interest: 'medium',
        availableFte: 0.25
      },
      {
        id: 'process-digitization',
        level: 'P',
        proofStatus: 'screened',
        evidence: [],
        usage: {
          from: '2024-09-01',
          description: 'Перевод регламентов WWO в цифровые шаблоны'
        },
        artifacts: ['artifact-wwo-operations-log'],
        interest: 'high',
        availableFte: 0.2
      }
    ]
  },
  {
    id: 'expert-margarita-kurganskaya',
    fullName: 'Маргарита Курганская',
    title: 'Эксперт по операционному сопровождению в поле',
    summary:
      'Фокусируется на цифровизации работы бригад, мобильных решениях и контроле исполнения ремонтов в полевых условиях.',
    domains: ['field-execution'],
    modules: ['module-wwo-execution'],
    competencies: [
      'Диспетчеризация бригад и ресурсов',
      'Мобильные решения для полевых сотрудников',
      'MQTT и обмен с исполнительными устройствами',
      'Контроль соблюдения HSE требований'
    ],
    consultingSkills: [
      'Настройка оперативных штабов в полевых условиях',
      'Обучение бригад цифровым инструментам',
      'Диагностика процессов HSE и операционной безопасности',
      'Организация программ изменений для подрядчиков'
    ],
    softSkills: [
      'Коммуникация с полевыми бригадами',
      'Наставничество сменных руководителей',
      'Разрешение конфликтов на площадке',
      'Мотивация к использованию цифровых инструментов'
    ],
    focusAreas: [
      'Достоверность факта исполнения работ',
      'Интеграция мобильных приложений с ERP',
      'Развитие культуры цифрового отчётности в поле'
    ],
    experienceYears: 10,
    location: 'Нижневартовск',
    contact: 'm.kurganskaya@nedra.digital',
    languages: ['ru'],
    notableProjects: [
      'Запустила мобильный контроль ремонтов для 240 бригад',
      'Сформировала программу обучения операторов цифровым инструментам WWO'
    ],
    availability: 'busy',
    availabilityComment: 'Полная загрузка текущими внедрениями, возможны дистанционные консультации',
    skills: [
      {
        id: 'field-dispatching',
        level: 'E',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2022-06-01',
          to: '2024-04-05',
          description: 'Диспетчеризация бригад и контроль исполнения ремонтов'
        },
        artifacts: ['artifact-wwo-operations-log'],
        interest: 'high',
        availableFte: 0.05
      },
      {
        id: 'mobile-solutions',
        level: 'Ad',
        proofStatus: 'screened',
        evidence: [],
        usage: {
          from: '2024-01-01',
          description: 'Внедрение мобильных приложений для полевых сотрудников'
        },
        artifacts: [],
        interest: 'medium',
        availableFte: 0.05
      },
      {
        id: 'hse-compliance',
        level: 'P',
        proofStatus: 'refuted',
        evidence: [
          {
            status: 'refuted',
            initiativeId: 'initiative-remote-operations',
            comment: 'Проверка показала отсутствие практического опыта по HSE'
          }
        ],
        usage: {
          from: '2022-09-01',
          to: '2024-12-01',
          description: 'Контроль соблюдения HSE требований во время ремонтов'
        },
        artifacts: [],
        interest: 'medium',
        availableFte: 0.05
      }
    ]
  },
  {
    id: 'expert-denis-laptev',
    fullName: 'Денис Лаптев',
    title: 'Руководитель аналитики качества внутрискважинных работ',
    summary:
      'Выстраивает систему показателей эффективности ремонтов, соединяет данные поля и управленческую отчётность.',
    domains: ['quality-analytics'],
    modules: ['module-wwo-analytics'],
    competencies: [
      'Аналитика эффективности ремонтов',
      'BI и визуализация производственных KPI',
      'Прогнозирование производственных эффектов',
      'Data storytelling для руководителей'
    ],
    consultingSkills: [
      'Формирование системы показателей WWO',
      'Стратегические сессии по качеству ремонтов',
      'Обучение аналитиков storytelling и презентации данных',
      'Диагностика зрелости аналитических процессов'
    ],
    softSkills: [
      'Наставничество аналитиков',
      'Презентация данных для руководства',
      'Фасилитация обсуждений KPI',
      'Управление ожиданиями заказчиков аналитики'
    ],
    focusAreas: [
      'Связка полевых данных и управленческой аналитики',
      'Повышение прозрачности решений в WWO',
      'Автоматизация отчётности для ситуационных центров'
    ],
    experienceYears: 9,
    location: 'Екатеринбург',
    contact: 'd.laptev@nedra.digital',
    languages: ['ru', 'en'],
    notableProjects: [
      'Создал единый дэшборд эффективности ремонтов для 12 предприятий',
      'Организовал программу развития аналитиков WWO Academy'
    ],
    availability: 'partial',
    availabilityComment: 'Может вести до двух параллельных консалтинговых треков',
    skills: [
      {
        id: 'wwo-analytics',
        level: 'E',
        proofStatus: 'validated',
        evidence: [],
        usage: {
          from: '2022-03-01',
          to: '2024-03-25',
          description: 'Разработка BI-дашбордов эффективности ремонтов'
        },
        artifacts: ['artifact-wwo-performance-dashboard'],
        interest: 'high',
        availableFte: 0.25
      },
      {
        id: 'forecasting',
        level: 'Ad',
        proofStatus: 'screened',
        evidence: [],
        usage: {
          from: '2024-02-01',
          to: '2024-01-15',
          description: 'Прогнозирование производственных эффектов от ремонтов'
        },
        artifacts: [],
        interest: 'medium',
        availableFte: 0.2
      },
      {
        id: 'data-storytelling',
        level: 'Ad',
        proofStatus: 'claimed',
        evidence: [],
        usage: {
          from: '2021-10-01',
          description: 'Обучение аналитиков storytelling и презентации данных'
        },
        artifacts: [],
        interest: 'high',
        availableFte: 0.15
      }
    ]
  }
];


export const moduleNameById: Record<string, string> = modules.reduce((acc, module) => {
  acc[module.id] = module.name;
  return acc;
}, {} as Record<string, string>);

export type ArtifactNode = {
  id: string;
  name: string;
  description: string;
  domainId: string;
  producedBy?: string;
  consumerIds: string[];
  dataType: string;
  sampleUrl: string;
};

export const artifacts: ArtifactNode[] = [
  {
    id: 'artifact-infraplan-source-pack',
    name: 'Пакет исходных данных INFRAPLAN',
    description:
      'Нормализованный набор инженерных и технологических данных для моделирования инфраструктуры.',
    domainId: 'data-preparation',
    producedBy: 'module-infraplan-datahub',
    consumerIds: [
      'module-infraplan-layout',
      'module-infraplan-economics',
      'module-dtwin-optimizer'
    ],
    dataType: 'Excel',
    sampleUrl: 'https://storage.nedra.digital/samples/infraplan-source-pack.zip'
  },
  {
    id: 'artifact-infraplan-layout',
    name: 'Сценарии размещения объектов',
    description:
      'Набор оптимизированных конфигураций размещения площадных и линейных объектов обустройства.',
    domainId: 'layout-optimization',
    producedBy: 'module-infraplan-layout',
    consumerIds: ['module-infraplan-economics'],
    dataType: 'LAS',
    sampleUrl: 'https://storage.nedra.digital/samples/infraplan-layout.json'
  },
  {
    id: 'artifact-infraplan-economic-report',
    name: 'Экономический отчёт INFRAPLAN',
    description:
      'Инвестиционные показатели по каждому варианту инфраструктуры с расчётом NPV, IRR и срока окупаемости.',
    domainId: 'economic-evaluation',
    producedBy: 'module-infraplan-economics',
    consumerIds: [],
    dataType: 'PDF',
    sampleUrl: 'https://storage.nedra.digital/samples/infraplan-economics.pdf'
  },
  {
    id: 'artifact-dtwin-telemetry-cube',
    name: 'Куб телеметрии DIGITAL TWIN',
    description:
      'Агрегированные данные телеметрии по объектам наземной инфраструктуры в режиме реального времени.',
    domainId: 'real-time-monitoring',
    producedBy: 'module-dtwin-monitoring',
    consumerIds: ['module-dtwin-optimizer'],
    dataType: 'Parquet',
    sampleUrl: 'https://storage.nedra.digital/samples/dtwin-telemetry.parquet'
  },
  {
    id: 'artifact-dtwin-optimization-orders',
    name: 'Пакет команд оптимизации',
    description:
      'Рекомендации цифрового двойника по изменению режимов работы оборудования и инфраструктуры.',
    domainId: 'production-optimization',
    producedBy: 'module-dtwin-optimizer',
    consumerIds: ['module-dtwin-remote-control'],
    dataType: 'JSON',
    sampleUrl: 'https://storage.nedra.digital/samples/dtwin-optimization-orders.json'
  },
  {
    id: 'artifact-dtwin-remote-commands',
    name: 'Поток дистанционных команд',
    description:
      'Структурированный поток управляющих команд, передаваемых на исполнительные устройства.',
    domainId: 'remote-control',
    producedBy: 'module-dtwin-remote-control',
    consumerIds: [],
    dataType: 'Avro',
    sampleUrl: 'https://storage.nedra.digital/samples/dtwin-remote-commands.avro'
  },
  {
    id: 'artifact-wwo-plan',
    name: 'План внутрискважинных работ',
    description:
      'Утверждённый календарь ГТМ и ТКРС по фонду скважин с назначением подрядчиков и ресурсов.',
    domainId: 'workover-planning',
    producedBy: 'module-wwo-planner',
    consumerIds: ['module-wwo-execution', 'module-wwo-analytics'],
    dataType: 'XLSX',
    sampleUrl: 'https://storage.nedra.digital/samples/wwo-plan.xlsx'
  },
  {
    id: 'artifact-wwo-operations-log',
    name: 'Журнал исполнения WWO',
    description:
      'Фактический журнал проведения ремонтных работ с показателями продолжительности и качественными отметками.',
    domainId: 'field-execution',
    producedBy: 'module-wwo-execution',
    consumerIds: ['module-wwo-analytics', 'module-wwo-planner'],
    dataType: 'CSV',
    sampleUrl: 'https://storage.nedra.digital/samples/wwo-operations-log.csv'
  },
  {
    id: 'artifact-wwo-performance-dashboard',
    name: 'Дашборд эффективности WWO',
    description:
      'Набор визуализаций KPI по ремонтам, экономическому эффекту и соблюдению регламентов.',
    domainId: 'quality-analytics',
    producedBy: 'module-wwo-analytics',
    consumerIds: [],
    dataType: 'Power BI',
    sampleUrl: 'https://storage.nedra.digital/samples/wwo-performance-dashboard.pdf'
  }
];

export const artifactNameById: Record<string, string> = artifacts.reduce((acc, artifact) => {
  acc[artifact.id] = artifact.name;
  return acc;
}, {} as Record<string, string>);

export type GraphLink = {
  source: string;
  target: string;
  type:
    | 'domain'
    | 'dependency'
    | 'produces'
    | 'consumes'
    | 'initiative-domain'
    | 'initiative-plan';
};

export const initiativeLinks: GraphLink[] = initiativeNodes.flatMap((initiative) => {
  const domainLinks: GraphLink[] = initiative.domains.map((domainId) => ({
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

const moduleById: Record<string, ModuleNode> = modules.reduce((acc, module) => {
  acc[module.id] = module;
  return acc;
}, {} as Record<string, ModuleNode>);

export const moduleLinks: GraphLink[] = modules.flatMap((module) => {
  const domainLinks: GraphLink[] = module.domains.map((domainId) => ({
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
    .filter((input) => input.sourceId && artifactNameById[input.sourceId])
    .map((input) => ({
      source: input.sourceId as string,
      target: module.id,
      type: 'consumes'
    }));

  return [...domainLinks, ...dependencyLinks, ...produceLinks, ...consumeLinks];
});

type InitiativeExtra = Partial<Omit<Initiative, keyof InitiativeNode>>;

const initiativeExtras: Record<string, InitiativeExtra> = {
  'initiative-dtwin-remote': {
    status: 'initiated',
    owner: 'Раиса Чистякова',
    expectedImpact: 'Сокращение простоев и аварийных остановок на 15%',
    targetModuleName: 'DTwin Remote Monitoring',
    lastUpdated: '2024-11-12T08:30:00.000Z',
    risks: [
      {
        id: 'risk-dtwin-connectivity',
        description: 'Неустойчивый канал связи с месторождением может сорвать сроки пилота.',
        severity: 'high',
        createdAt: '2024-11-05T10:00:00.000Z'
      },
      {
        id: 'risk-dtwin-staff',
        description: 'Нет выделенного архитектора на этапе построения пайплайна телеметрии.',
        severity: 'medium',
        createdAt: '2024-11-07T14:20:00.000Z'
      }
    ],
    roles: [
      {
        id: 'dtwin-architect',
        role: 'Архитектор',
        required: 1,
        pinnedExpertIds: ['expert-raisa-chistyakova'],
        workItems: [
          {
            id: 'dtwin-arch-pipeline',
            title: 'Архитектура потоков телеметрии',
            description: 'Схема доставки данных и требования к отказоустойчивости.',
            startDay: 0,
            durationDays: 18,
            effortDays: 18,
            tasks: ['streaming-pipelines'],
            assignedExpertId: 'expert-raisa-chistyakova'
          },
          {
            id: 'dtwin-arch-quality',
            title: 'Контроль качества и каталогизация',
            description: 'Метрики потерь данных и управление справочниками.',
            startDay: 12,
            durationDays: 12,
            effortDays: 12,
            tasks: ['data-governance'],
            assignedExpertId: 'expert-viktoria-berezhnaya'
          }
        ],
        candidates: [
          {
            expertId: 'expert-raisa-chistyakova',
            score: 92,
            fitComment:
              'Вела внедрение телеметрии в INFRAPLAN, знает пайплайны и ограничения инфраструктуры.',
            riskTags: ['Высокая вовлечённость в действующих проектах'],
            scoreDetails: [
              { criterion: 'Соответствие домену', weight: 0.4, value: 0.95 },
              { criterion: 'Опыт внедрения двойников', weight: 0.35, value: 0.9 },
              {
                criterion: 'Доступность',
                weight: 0.25,
                value: 0.75,
                comment: 'Свободно 20% времени, требуется поддержка лидом команды.'
              }
            ]
          },
          {
            expertId: 'expert-pavel-kolosov',
            score: 78,
            fitComment:
              'Опыт проектирования сервисов телеметрии через графовые модели, но меньше работал с потоковой частью.',
            riskTags: ['Низкая доступность в Q4'],
            scoreDetails: [
              { criterion: 'Соответствие домену', weight: 0.4, value: 0.7 },
              { criterion: 'Опыт внедрения двойников', weight: 0.35, value: 0.65 },
              {
                criterion: 'Доступность',
                weight: 0.25,
                value: 0.4,
                comment: 'Запланированы консультации для других активов.'
              }
            ]
          }
        ]
      },
      {
        id: 'dtwin-backend',
        role: 'Backend',
        required: 2,
        pinnedExpertIds: [],
        workItems: [
          {
            id: 'dtwin-backend-stream',
            title: 'Настройка пайплайнов',
            description: 'Подготовка ETL и потоковой обработки для телеметрии.',
            startDay: 5,
            durationDays: 14,
            effortDays: 14,
            tasks: ['streaming-pipelines'],
            assignedExpertId: 'expert-viktoria-berezhnaya'
          },
          {
            id: 'dtwin-backend-api',
            title: 'Интерфейсы SCADA',
            description: 'Интеграция с диспетчерскими сервисами и тестирование API.',
            startDay: 18,
            durationDays: 10,
            effortDays: 10,
            tasks: ['Интеграция SCADA'],
            assignedExpertId: 'expert-anton-vlasov'
          }
        ],
        candidates: [
          {
            expertId: 'expert-viktoria-berezhnaya',
            score: 88,
            fitComment: 'Может закрыть потоковую часть и обеспечение качества инженерных данных.',
            riskTags: ['Параллельная поддержка DataHub'],
            scoreDetails: [
              { criterion: 'Работа с телеметрией', weight: 0.35, value: 0.9 },
              { criterion: 'Инженерия данных', weight: 0.35, value: 0.95 },
              {
                criterion: 'Доступность',
                weight: 0.3,
                value: 0.65,
                comment: 'Готова подключиться на 30% времени.'
              }
            ]
          },
          {
            expertId: 'expert-anton-vlasov',
            score: 62,
            fitComment: 'Финансовый аналитик, может взять управленческую отчётность, но не профильный backend.',
            riskTags: ['Несоответствие основной компетенции'],
            scoreDetails: [
              { criterion: 'Работа с телеметрией', weight: 0.35, value: 0.2 },
              { criterion: 'Инженерия данных', weight: 0.35, value: 0.4 },
              { criterion: 'Доступность', weight: 0.3, value: 0.8 }
            ]
          }
        ]
      },
      {
        id: 'dtwin-analyst',
        role: 'Аналитик',
        required: 1,
        pinnedExpertIds: [],
        candidates: [
          {
            expertId: 'expert-viktoria-berezhnaya',
            score: 74,
            fitComment: 'Владеет методикой каталогизации данных и сможет описать входные наборы.',
            riskTags: ['Может перегореть при совмещении ролей'],
            scoreDetails: [
              { criterion: 'Знание домена', weight: 0.4, value: 0.9 },
              { criterion: 'Навыки аналитики', weight: 0.3, value: 0.75 },
              { criterion: 'Доступность', weight: 0.3, value: 0.5 }
            ]
          },
          {
            expertId: 'expert-pavel-kolosov',
            score: 68,
            fitComment:
              'Может поддержать архитектурный анализ ограничений, но не готов к ежедневной аналитике.',
            riskTags: ['Нужен дополнительный аналитик для описания бизнес-процессов'],
            scoreDetails: [
              { criterion: 'Знание домена', weight: 0.4, value: 0.75 },
              { criterion: 'Навыки аналитики', weight: 0.3, value: 0.65 },
              { criterion: 'Доступность', weight: 0.3, value: 0.4 }
            ]
          }
        ]
      }
    ],
    potentialModules: [
      'module-dtwin-monitoring',
      'module-dtwin-optimizer',
      'module-dtwin-remote-control'
    ],
    works: [
      {
        id: 'dtwin-work-architecture',
        title: 'Проектирование архитектуры потоков данных',
        description: 'Детализация пайплайна телеметрии и схемы отказоустойчивости.',
        effortHours: 240
      },
      {
        id: 'dtwin-work-modeling',
        title: 'Настройка моделей отклонений и алертов',
        description: 'Подбор алгоритмов и сценариев реагирования для диспетчеров.',
        effortHours: 200
      },
      {
        id: 'dtwin-work-rollout',
        title: 'Пилотное развертывание и обучение команды',
        description: 'Запуск на удалённом промысле и обучение операторов ситуационного центра.',
        effortHours: 160
      }
    ],
    requirements: [
      {
        id: 'dtwin-req-architect',
        role: 'Архитектор',
        skills: ['Архитектура цифровых двойников', 'Стриминговые платформы'],
        count: 1,
        comment: 'Вовлечённость не менее 0.5 FTE на весь пилот.'
      },
      {
        id: 'dtwin-req-backend',
        role: 'Backend',
        skills: ['Stream Processing', 'Интеграция SCADA'],
        count: 2
      },
      {
        id: 'dtwin-req-analyst',
        role: 'Аналитик',
        skills: ['Каталогизация данных', 'Документация процессов'],
        count: 1
      }
    ]
  },
  'initiative-infraplan-economics': {
    status: 'in-progress',
    owner: 'Антон Власов',
    expectedImpact: 'Рост точности оценки сделок M&A на 20%',
    targetModuleName: 'INFRAPLAN Economics M&A',
    lastUpdated: '2024-11-10T15:45:00.000Z',
    risks: [
      {
        id: 'risk-mna-data-quality',
        description:
          'Не выстроен процесс проверки источников финансовых данных при интеграции внешних активов.',
        severity: 'medium',
        createdAt: '2024-11-02T09:10:00.000Z'
      }
    ],
    roles: [
      {
        id: 'mna-owner',
        role: 'Владелец продукта',
        required: 1,
        pinnedExpertIds: ['expert-anton-vlasov'],
        candidates: [
          {
            expertId: 'expert-anton-vlasov',
            score: 95,
            fitComment:
              'Лид экономического блока, ведёт методологию M&A и знает потребности заказчиков.',
            riskTags: ['Высокая загрузка до конца квартала'],
            scoreDetails: [
              { criterion: 'Знание домена', weight: 0.4, value: 0.98 },
              { criterion: 'Опыт сделок M&A', weight: 0.4, value: 0.95 },
              { criterion: 'Доступность', weight: 0.2, value: 0.75 }
            ]
          },
          {
            expertId: 'expert-pavel-kolosov',
            score: 58,
            fitComment:
              'Может поддержать интеграцию пространственных сценариев, но не лидирует финансы.',
            riskTags: ['Низкая вовлечённость в экономический блок'],
            scoreDetails: [
              { criterion: 'Знание домена', weight: 0.4, value: 0.45 },
              { criterion: 'Опыт сделок M&A', weight: 0.4, value: 0.3 },
              { criterion: 'Доступность', weight: 0.2, value: 0.6 }
            ]
          }
        ]
      },
      {
        id: 'mna-analyst',
        role: 'Аналитик',
        required: 2,
        pinnedExpertIds: ['expert-viktoria-berezhnaya'],
        candidates: [
          {
            expertId: 'expert-viktoria-berezhnaya',
            score: 82,
            fitComment:
              'Сформирует витрины данных для финансовых моделей и подключит пайплайны качества.',
            riskTags: ['Требуется поддержка junior-аналитика'],
            scoreDetails: [
              { criterion: 'Знание домена', weight: 0.35, value: 0.85 },
              { criterion: 'Опыт финансовых моделей', weight: 0.35, value: 0.7 },
              { criterion: 'Доступность', weight: 0.3, value: 0.6 }
            ]
          },
          {
            expertId: 'expert-anton-vlasov',
            score: 89,
            fitComment: 'Собирает финансовые сценарии и может выступать методологом анализа.',
            riskTags: ['Загрузка как владельца продукта'],
            scoreDetails: [
              { criterion: 'Знание домена', weight: 0.35, value: 0.95 },
              { criterion: 'Опыт финансовых моделей', weight: 0.35, value: 0.92 },
              { criterion: 'Доступность', weight: 0.3, value: 0.55 }
            ]
          }
        ]
      },
      {
        id: 'mna-frontend',
        role: 'Frontend',
        required: 1,
        pinnedExpertIds: [],
        candidates: [
          {
            expertId: 'expert-pavel-kolosov',
            score: 65,
            fitComment:
              'Имеет опыт интеграции визуализаций, но доступен только на 30% времени.',
            riskTags: ['Низкая доступность в первом квартале'],
            scoreDetails: [
              { criterion: 'Знание домена', weight: 0.35, value: 0.6 },
              { criterion: 'Frontend-экспертиза', weight: 0.35, value: 0.7 },
              { criterion: 'Доступность', weight: 0.3, value: 0.3 }
            ]
          }
        ]
      }
    ],
    potentialModules: ['module-infraplan-economics', 'module-infraplan-datahub'],
    works: [
      {
        id: 'mna-work-data',
        title: 'Подготовка и очистка источников',
        description: 'Инвентаризация финансовых данных и настройка витрин для расчётов.',
        effortHours: 180
      },
      {
        id: 'mna-work-models',
        title: 'Разработка моделей оценки сделок',
        description: 'Настройка сценариев и шаблонов стресс-тестирования.',
        effortHours: 220
      },
      {
        id: 'mna-work-rollout',
        title: 'Запуск и обучение бизнес-команд',
        description: 'Пилот на сделках M&A и обучение финансовых аналитиков.',
        effortHours: 160
      }
    ],
    requirements: [
      {
        id: 'mna-req-owner',
        role: 'Владелец продукта',
        skills: ['Управление продуктом', 'Финансовое моделирование'],
        count: 1,
        comment: 'Необходимо участие в управлении roadmap и коммуникациях.'
      },
      {
        id: 'mna-req-analyst',
        role: 'Аналитик',
        skills: ['Финансовая аналитика', 'DataHub'],
        count: 2
      },
      {
        id: 'mna-req-frontend',
        role: 'Frontend',
        skills: ['React', 'Визуализация данных'],
        count: 1
      }
    ]
  }
};

function buildDefaultWorks(node: InitiativeNode): InitiativeWork[] {
  return node.workItems.map((item, index) => ({
    id: `${item.id}-summary`,
    title: item.title,
    description: item.description,
    effortHours: 120 + index * 40
  }));
}

function buildDefaultRequirements(node: InitiativeNode): InitiativeRequirement[] {
  if (node.requiredSkills.length === 0) {
    return [
      {
        id: `${node.id}-req-1`,
        role: 'Аналитик',
        skills: ['Исследование домена'],
        count: 1
      }
    ];
  }

  return node.requiredSkills.map((skill, index) => ({
    id: `${node.id}-req-${index + 1}`,
    role: 'Эксперт R&D',
    skills: [skill],
    count: 1
  }));
}

export const initiatives: Initiative[] = initiativeNodes.map((node, index) => {
  const extra = initiativeExtras[node.id] ?? {};
  const baseLastUpdated = new Date(Date.UTC(2024, 10, 1 + index)).toISOString();
  const risks = extra.risks ? [...extra.risks] : [];
  const roles = extra.roles ? [...extra.roles] : [];
  const potentialModules = extra.potentialModules
    ? [...extra.potentialModules]
    : [...node.plannedModuleIds];
  const works = extra.works ? [...extra.works] : buildDefaultWorks(node);
  const requirements = extra.requirements
    ? [...extra.requirements]
    : buildDefaultRequirements(node);

  return {
    ...node,
    status: extra.status ?? 'initiated',
    owner: extra.owner ?? 'Ответственный не назначен',
    expectedImpact: extra.expectedImpact ?? 'Эффект не оценён',
    targetModuleName: extra.targetModuleName ?? node.name,
    lastUpdated: extra.lastUpdated ?? baseLastUpdated,
    risks,
    roles,
    potentialModules,
    works,
    requirements
  };
});

experts.forEach((expert) => {
  expert.competencies.forEach((competency) => addCompetencyToRoleIndex(expert.title, competency));
  (expert.competencyRecords ?? []).forEach((record) => addCompetencyToRoleIndex(expert.title, record.name));
});

export { moduleById };

export type ReuseTrendPoint = {
  period: string;
  averageScore: number;
};

export const reuseIndexHistory: ReuseTrendPoint[] = [
  { period: '2024-11', averageScore: 0.42 },
  { period: '2024-12', averageScore: 0.44 },
  { period: '2024-01', averageScore: 0.45 },
  { period: '2024-02', averageScore: 0.47 },
  { period: '2024-03', averageScore: 0.5 },
  { period: '2024-04', averageScore: 0.53 },
  { period: '2024-05', averageScore: 0.55 },
  { period: '2024-06', averageScore: 0.57 },
  { period: '2024-07', averageScore: 0.6 },
  { period: '2024-08', averageScore: 0.62 },
  { period: '2024-09', averageScore: 0.65 },
  { period: '2024-10', averageScore: 0.66 }
];

export {
  skills,
  roleToSkillsMap,
  getSkillsByRole,
  getSkillIdsByRole,
  getKnownRoles,
  getRolesForSkill,
  getSkillNameById,
  skillLevels,
  evidenceStatuses,
  registerSkillDefinition,
  ensureSkillDefinition,
  subscribeToSkillRegistry,
  getSkillRegistryVersion,
  findSkillByName,
  registerAdHocSkill,
  slugifySkillId,
  defaultTeamRoles,
  registerRole,
  renameRole,
  deleteRole,
  setRoleSkills
} from './data/skills';

export type {
  SkillDefinition,
  SkillLevelDescriptor,
  EvidenceStatusDescriptor,
  SkillCategory,
  SkillSource,
  SkillLevelId,
  EvidenceStatusId
} from './data/skills';
