import { Button } from '@consta/uikit/Button';
import { Combobox } from '@consta/uikit/Combobox';
import { Collapse } from '@consta/uikit/Collapse';
import { Modal } from '@consta/uikit/Modal';
import { Select } from '@consta/uikit/Select';
import { Switch } from '@consta/uikit/Switch';
import { Tabs } from '@consta/uikit/Tabs';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import { IconClose } from '@consta/icons/IconClose';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ArtifactNode,
  type DomainNode,
  type Initiative,
  type ExpertCompetencyRecord,
  type ExpertProfile,
  type ExpertSkill,
  type SkillEvidenceStatus,
  type SkillLevel,
  type TeamRole,
  evidenceStatuses,
  getKnownRoles,
  findSkillByName,
  getSkillNameById,
  getRolesForSkill,
  getSkillsByRole,
  registerRoleCompetency,
  registerSkillDefinition,
  skillLevels
} from '../../../data';
import type { TaskListItem } from '../../../types/tasks';
import { addDays, formatIsoDate, startOfDay } from '../../../utils/employeeTasks';
import type { ExpertDraftPayload } from '../../../types/expert';
import type {
  ExpertImportResult,
  MissingDomainEntry,
  MissingCompetencyEntry,
  MissingSkillEntry
} from '../../../utils/expertExcel';
import { useSkillRegistryVersion } from '../../../utils/useSkillRegistryVersion';
import type {
  AdminPanelProps,
  ArtifactDraftPayload,
  DomainDraftPayload,
  ModuleDraftPayload,
  ModuleDraftPrefillRequest,
  UserDraftPayload
} from '../types';
import RoleCompetencyAdmin from './RoleCompetencyAdmin';
import UserManagement from './UserManagement';
import LoginLogsView from './LoginLogsView';
import styles from './AdminPanel.module.css';

type AdminTab = 'module' | 'domain' | 'artifact' | 'expert' | 'role' | 'user' | 'logs';

type SelectItem<Value extends string> = {
  label: string;
  value: Value;
};

type ModuleSectionId = 'general' | 'calculation' | 'technical' | 'nonFunctional';

type ModuleSection = {
  id: ModuleSectionId;
  title: string;
};

type InlineStringCreation = {
  value: string;
  previous: string;
};

type MultiStringCreation = {
  value: string;
  previous: string[];
};

type IndexedStringCreation = {
  index: number;
  value: string;
  previous: string;
};

type TechnologyCreationState = {
  value: string;
  previous: string[];
};

const moduleSections: ModuleSection[] = [
  { id: 'general', title: 'Общая информация' },
  { id: 'calculation', title: 'Расчётный узел' },
  { id: 'technical', title: 'Технические сведения' },
  { id: 'nonFunctional', title: 'Нефункциональные требования' }
];

type DomainSectionId = 'basic' | 'relations';

type ArtifactSectionId = 'basic' | 'relations';

const adminTabs = [
  { label: 'Модули', value: 'module' },
  { label: 'Домены', value: 'domain' },
  { label: 'Артефакты', value: 'artifact' },
  { label: 'Сотрудники', value: 'expert' },
  { label: 'Роли и компетенции', value: 'role' },
  { label: 'Пользователи', value: 'user' },
  { label: 'Журнал входов', value: 'logs' }
] as const satisfies readonly { label: string; value: AdminTab }[];

const ROOT_DOMAIN_OPTION = '__root__';
const CREATE_DATA_TYPE_OPTION = '__create_data_type__';

const statusLabels: Record<ModuleStatus, string> = {
  'in-dev': 'В разработке',
  production: 'В эксплуатации',
  deprecated: 'Устаревший'
};

const clientTypeLabels: Record<ModuleNode['clientType'], string> = {
  desktop: 'Desktop-приложение',
  web: 'Web-интерфейс'
};

const deploymentToolLabels: Record<ModuleNode['deploymentTool'], string> = {
  docker: 'Docker',
  kubernetes: 'Kubernetes'
};

const AdminPanel: React.FC<AdminPanelProps> = ({
  modules,
  domains,
  artifacts,
  experts,
  initiatives,
  employeeTasks,
  moduleDraftPrefill,
  onModuleDraftPrefillApplied,
  onCreateModule,
  onUpdateModule,
  onDeleteModule,
  onCreateDomain,
  onUpdateDomain,
  onDeleteDomain,
  onCreateArtifact,
  onUpdateArtifact,
  onDeleteArtifact,
  onCreateExpert,
  onUpdateExpert,
  onDeleteExpert,

  onUpdateEmployeeTasks,
  users,
  currentUser,
  onCreateUser,
  onUpdateUser,
  onDeleteUser
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('module');
  const skillRegistryVersion = useSkillRegistryVersion();

  const domainLabelMap = useMemo(() => buildDomainLabelMap(domains), [domains]);
  const moduleLabelMap = useMemo(() => buildModuleLabelMap(modules), [modules]);
  const artifactLabelMap = useMemo(() => buildArtifactLabelMap(artifacts), [artifacts]);

  const moduleOptions = useMemo<SelectItem<string>[]>(() => {
    const base = modules
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map<SelectItem<string>>((module) => ({ label: module.name, value: module.id }));
    return [{ label: 'Создать новый модуль', value: '__new__' }, ...base];
  }, [modules]);

  const domainOptions = useMemo<SelectItem<string>[]>(() => {
    const flattened = flattenDomainTree(domains);
    const base = flattened
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map<SelectItem<string>>((domain) => ({ label: domain.name, value: domain.id }));
    return [{ label: 'Создать новый домен', value: '__new__' }, ...base];
  }, [domains]);

  const artifactOptions = useMemo<SelectItem<string>[]>(() => {
    const base = artifacts
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map<SelectItem<string>>((artifact) => ({ label: artifact.name, value: artifact.id }));
    return [{ label: 'Создать новый артефакт', value: '__new__' }, ...base];
  }, [artifacts]);

  const expertOptions = useMemo<SelectItem<string>[]>(() => {
    const base = experts
      .slice()
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
      .map<SelectItem<string>>((expert) => ({ label: expert.fullName, value: expert.id }));
    return [{ label: 'Создать нового сотрудника', value: '__new__' }, ...base];
  }, [experts]);

  const knownCompanyNames = useMemo(() => {
    const names = new Set<string>();
    modules.forEach((module) => {
      module.userStats.companies.forEach((company) => {
        const trimmed = company.name.trim();
        if (trimmed) {
          names.add(trimmed);
        }
      });
      const ridCompany = module.ridOwner.company?.trim();
      if (ridCompany) {
        names.add(ridCompany);
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [modules]);

  const knownProductNames = useMemo(() => buildProductNames(modules), [modules]);
  const knownCreatorCompanies = useMemo(() => buildCreatorCompanies(modules), [modules]);
  const knownLocalizations = useMemo(() => buildLocalizationList(modules), [modules]);
  const knownTechnologyOptions = useMemo(() => buildTechnologyList(modules), [modules]);
  const knownRidCompanyRegistry = useMemo(
    () => buildRidCompanyRegistry(modules),
    [modules]
  );
  const knownLibraryRegistry = useMemo(() => buildLibraryRegistry(modules), [modules]);
  const knownArtifactDataTypes = useMemo(() => buildArtifactDataTypes(artifacts), [artifacts]);
  const knownLocations = useMemo(() => buildLocationList(experts), [experts]);
  const knownLanguages = useMemo(() => buildLanguageList(experts), [experts]);

  const [companyNames, setCompanyNames] = useState<string[]>(knownCompanyNames);
  const [productNames, setProductNames] = useState<string[]>(knownProductNames);
  const [creatorCompanies, setCreatorCompanies] = useState<string[]>(knownCreatorCompanies);
  const [localizations, setLocalizations] = useState<string[]>(knownLocalizations);
  const [technologyOptions, setTechnologyOptions] = useState<string[]>(knownTechnologyOptions);
  const [ridCompanyRegistry, setRidCompanyRegistry] = useState<Record<string, string[]>>(
    knownRidCompanyRegistry
  );
  const [libraryRegistry, setLibraryRegistry] = useState<Record<string, string[]>>(
    knownLibraryRegistry
  );
  const [artifactDataTypes, setArtifactDataTypes] = useState<string[]>(knownArtifactDataTypes);
  const [locations, setLocations] = useState<string[]>(knownLocations);
  const [languageOptions, setLanguageOptions] = useState<string[]>(knownLanguages);

  useEffect(() => {
    setCompanyNames((prev) => mergeStringCollections(prev, knownCompanyNames));
  }, [knownCompanyNames]);

  useEffect(() => {
    setProductNames((prev) => mergeStringCollections(prev, knownProductNames));
  }, [knownProductNames]);

  useEffect(() => {
    setCreatorCompanies((prev) => mergeStringCollections(prev, knownCreatorCompanies));
  }, [knownCreatorCompanies]);

  useEffect(() => {
    setLocalizations((prev) => mergeStringCollections(prev, knownLocalizations));
  }, [knownLocalizations]);

  useEffect(() => {
    setTechnologyOptions((prev) => mergeStringCollections(prev, knownTechnologyOptions));
  }, [knownTechnologyOptions]);

  useEffect(() => {
    setRidCompanyRegistry((prev) => mergeRegistry(prev, knownRidCompanyRegistry));
  }, [knownRidCompanyRegistry]);

  useEffect(() => {
    setLibraryRegistry((prev) => mergeRegistry(prev, knownLibraryRegistry));
  }, [knownLibraryRegistry]);

  useEffect(() => {
    setArtifactDataTypes((prev) => mergeStringCollections(prev, knownArtifactDataTypes));
  }, [knownArtifactDataTypes]);

  useEffect(() => {
    setLocations((prev) => mergeStringCollections(prev, knownLocations));
  }, [knownLocations]);

  useEffect(() => {
    setLanguageOptions((prev) => mergeStringCollections(prev, knownLanguages));
  }, [knownLanguages]);

  const leafDomainIds = useMemo(() => collectLeafDomainIds(domains), [domains]);
  const catalogDomainIds = useMemo(() => collectCatalogDomainIds(domains), [domains]);
  const parentDomainIds = useMemo(
    () => flattenDomainTree(domains).map((domain) => domain.id),
    [domains]
  );
  const domainDescendantMap = useMemo(() => buildDomainDescendantMap(domains), [domains]);
  const domainParentLabelMap = useMemo(
    () => ({ [ROOT_DOMAIN_OPTION]: 'Корневой каталог', ...domainLabelMap }),
    [domainLabelMap]
  );

  const availableRoles = useMemo<TeamRole[]>(
    () => {
      void skillRegistryVersion;
      return getKnownRoles();
    },
    [skillRegistryVersion]
  );

  const [selectedModuleId, setSelectedModuleId] = useState<string>('__new__');
  const [selectedDomainId, setSelectedDomainId] = useState<string>('__new__');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>('__new__');
  const [selectedExpertId, setSelectedExpertId] = useState<string>('__new__');

  const forbiddenParentIds = useMemo(() => {
    if (selectedDomainId === '__new__') {
      return [] as string[];
    }
    const descendants = domainDescendantMap[selectedDomainId] ?? [];
    return [selectedDomainId, ...descendants];
  }, [domainDescendantMap, selectedDomainId]);

  const [moduleDraft, setModuleDraft] = useState<ModuleDraftPayload>(() => createDefaultModuleDraft());
  const [moduleStep, setModuleStep] = useState<number>(0);

  const [domainDraft, setDomainDraft] = useState<DomainDraftPayload>(() => createDefaultDomainDraft());
  const [domainStep, setDomainStep] = useState<number>(0);

  const [artifactDraft, setArtifactDraft] = useState<ArtifactDraftPayload>(() => createDefaultArtifactDraft());
  const [artifactStep, setArtifactStep] = useState<number>(0);
  const [expertDraft, setExpertDraft] = useState<ExpertDraftPayload>(() => createDefaultExpertDraft());

  const [userDraft, setUserDraft] = useState<UserDraftPayload>({ username: '', role: 'user' });
  const [selectedUserId, setSelectedUserId] = useState<string>('__new__');

  const moduleDraftPrefillKey = moduleDraftPrefill?.id;

  useEffect(() => {
    const nextOption = moduleOptions.find((item) => item.value === selectedModuleId);
    if (!nextOption) {
      setSelectedModuleId('__new__');
      setModuleDraft(createDefaultModuleDraft());
      setModuleStep(0);
      return;
    }

    if (nextOption.value === '__new__') {
      setModuleDraft(createDefaultModuleDraft());
      setModuleStep(0);
      return;
    }

    const target = modules.find((module) => module.id === nextOption.value);
    if (target) {
      let draft = moduleToDraft(target);
      if (
        moduleDraftPrefill &&
        moduleDraftPrefill.mode === 'edit' &&
        moduleDraftPrefill.moduleId === target.id
      ) {
        draft = applyModuleDraftPrefill(draft, moduleDraftPrefill.draft);
        if (onModuleDraftPrefillApplied) {
          onModuleDraftPrefillApplied();
        }
      }
      setModuleDraft(draft);
      setModuleStep(0);
    }
  }, [
    moduleOptions,
    modules,
    selectedModuleId,
    moduleDraftPrefill,
    moduleDraftPrefillKey,
    onModuleDraftPrefillApplied
  ]);

  useEffect(() => {
    if (!moduleDraftPrefill) {
      return;
    }
    setActiveTab('module');
    if (
      moduleDraftPrefill.mode === 'edit' &&
      moduleDraftPrefill.moduleId &&
      moduleOptions.some((item) => item.value === moduleDraftPrefill.moduleId)
    ) {
      setSelectedModuleId(moduleDraftPrefill.moduleId);
      setModuleStep(0);
      return;
    }

    setSelectedModuleId('__new__');
    setModuleStep(0);
    setModuleDraft((prev) => applyModuleDraftPrefill(prev, moduleDraftPrefill.draft));
    if (onModuleDraftPrefillApplied) {
      onModuleDraftPrefillApplied();
    }
  }, [
    moduleDraftPrefillKey,
    moduleDraftPrefill,
    moduleOptions,
    onModuleDraftPrefillApplied
  ]);

  useEffect(() => {
    const nextOption = domainOptions.find((item) => item.value === selectedDomainId);
    if (!nextOption) {
      setSelectedDomainId('__new__');
      setDomainDraft(createDefaultDomainDraft());
      setDomainStep(0);
      return;
    }

    if (nextOption.value === '__new__') {
      setDomainDraft(createDefaultDomainDraft());
      setDomainStep(0);
      return;
    }

    const target = findDomainById(domains, nextOption.value);
    if (target) {
      setDomainDraft(domainToDraft(target, domains, modules));
      setDomainStep(0);
    }
  }, [domainOptions, domains, modules, selectedDomainId]);

  useEffect(() => {
    const nextOption = artifactOptions.find((item) => item.value === selectedArtifactId);
    if (!nextOption) {
      setSelectedArtifactId('__new__');
      setArtifactDraft(createDefaultArtifactDraft());
      setArtifactStep(0);
      return;
    }

    if (nextOption.value === '__new__') {
      setArtifactDraft(createDefaultArtifactDraft());
      setArtifactStep(0);
      return;
    }

    const target = artifacts.find((artifact) => artifact.id === nextOption.value);
    if (target) {
      setArtifactDraft(artifactToDraft(target));
      setArtifactStep(0);
    }
  }, [artifactOptions, artifacts, selectedArtifactId]);

  useEffect(() => {
    const nextOption = expertOptions.find((item) => item.value === selectedExpertId);
    if (!nextOption) {
      setSelectedExpertId('__new__');
      setExpertDraft(createDefaultExpertDraft());
      return;
    }

    if (nextOption.value === '__new__') {
      setExpertDraft(createDefaultExpertDraft());
      return;
    }

    const target = experts.find((expert) => expert.id === nextOption.value);
    if (target) {
      setExpertDraft(expertToDraft(target));
    }
  }, [expertOptions, experts, selectedExpertId]);

  const handleModuleSubmit = () => {
    if (selectedModuleId === '__new__' && moduleDraft.domainIds.length === 0) {
      setModuleStep(0);
      return;
    }

    if (selectedModuleId === '__new__') {
      onCreateModule(moduleDraft);
      setModuleDraft(createDefaultModuleDraft());
      setModuleStep(0);
    } else {
      onUpdateModule(selectedModuleId, moduleDraft);
    }
  };

  const handleModuleDelete = () => {
    if (selectedModuleId === '__new__') {
      return;
    }
    onDeleteModule(selectedModuleId);
    setSelectedModuleId('__new__');
  };

  const handleDomainSubmit = () => {
    if (selectedDomainId === '__new__') {
      onCreateDomain(domainDraft);
      setDomainDraft(createDefaultDomainDraft());
      setDomainStep(0);
    } else {
      onUpdateDomain(selectedDomainId, domainDraft);
    }
  };

  const handleDomainDelete = () => {
    if (selectedDomainId === '__new__') {
      return;
    }
    onDeleteDomain(selectedDomainId);
    setSelectedDomainId('__new__');
  };

  const handleArtifactSubmit = () => {
    if (selectedArtifactId === '__new__') {
      onCreateArtifact(artifactDraft);
      setArtifactDraft(createDefaultArtifactDraft());
      setArtifactStep(0);
    } else {
      onUpdateArtifact(selectedArtifactId, artifactDraft);
    }
  };

  const handleArtifactDelete = () => {
    if (selectedArtifactId === '__new__') {
      return;
    }
    onDeleteArtifact(selectedArtifactId);
    setSelectedArtifactId('__new__');
  };

  const handleExpertSubmit = () => {
    if (selectedExpertId === '__new__') {
      onCreateExpert(expertDraft);
      setExpertDraft(createDefaultExpertDraft());
    } else {
      onUpdateExpert(selectedExpertId, expertDraft);
    }
  };

  const handleExpertDelete = () => {
    if (selectedExpertId === '__new__') {
      return;
    }
    onDeleteExpert(selectedExpertId);
    setSelectedExpertId('__new__');
  };

  const handleUserSubmit = () => {
    if (selectedUserId === '__new__') {
      onCreateUser(userDraft);
      setUserDraft({ username: '', role: 'user' });
    } else {
      onUpdateUser(selectedUserId, userDraft);
    }
  };

  const handleUserEdit = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (user) {
      setSelectedUserId(userId);
      setUserDraft({ username: user.username, role: user.role });
    }
  };

  const handleUserDelete = (userId: string) => {
    onDeleteUser(userId);
    if (selectedUserId === userId) {
      setSelectedUserId('__new__');
      setUserDraft({ username: '', role: 'user' });
    }
  };

  const registerCompanyName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setCompanyNames((prev) => mergeStringCollections(prev, [trimmed]));
  };

  const registerProductName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setProductNames((prev) => mergeStringCollections(prev, [trimmed]));
  };

  const registerCreatorCompany = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setCreatorCompanies((prev) => mergeStringCollections(prev, [trimmed]));
  };

  const registerLocalization = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setLocalizations((prev) => mergeStringCollections(prev, [trimmed]));
  };

  const registerTechnology = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setTechnologyOptions((prev) => mergeStringCollections(prev, [trimmed]));
  };

  const registerRidCompany = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setRidCompanyRegistry((prev) => mergeRegistry(prev, { [trimmed]: [] }));
  };

  const registerRidDivision = (company: string, division: string) => {
    const normalizedCompany = company.trim();
    const normalizedDivision = division.trim();
    if (!normalizedCompany || !normalizedDivision) {
      return;
    }
    setRidCompanyRegistry((prev) =>
      mergeRegistry(prev, { [normalizedCompany]: [normalizedDivision] })
    );
  };

  const registerLibrary = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setLibraryRegistry((prev) => mergeRegistry(prev, { [trimmed]: [] }));
  };

  const registerLibraryVersion = (library: string, version: string) => {
    const trimmedLibrary = library.trim();
    const trimmedVersion = version.trim();
    if (!trimmedLibrary || !trimmedVersion) {
      return;
    }
    setLibraryRegistry((prev) =>
      mergeRegistry(prev, { [trimmedLibrary]: [trimmedVersion] })
    );
  };

  const registerArtifactDataType = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setArtifactDataTypes((prev) => mergeStringCollections(prev, [trimmed]));
  };

  const registerLocation = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setLocations((prev) => mergeStringCollections(prev, [trimmed]));
  };

  const registerLanguage = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setLanguageOptions((prev) => mergeStringCollections(prev, [trimmed]));
  };

  const moduleSelectValue = moduleOptions.find((item) => item.value === selectedModuleId) ?? moduleOptions[0];
  const domainSelectValue = domainOptions.find((item) => item.value === selectedDomainId) ?? domainOptions[0];
  const artifactSelectValue =
    artifactOptions.find((item) => item.value === selectedArtifactId) ?? artifactOptions[0];
  const expertSelectValue = expertOptions.find((item) => item.value === selectedExpertId) ?? expertOptions[0];

  const tabVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, x: 20, transition: { duration: 0.2 } }
  };

  return (
    <div className={styles.container}>
      <div className={styles.selector}>
        <Text size="s" weight="semibold" className={styles.selectorTitle}>
          Панель администратора
        </Text>
        <Text size="xs" view="secondary" className={styles.selectorHint}>
          Выберите тип сущности и карточку для редактирования либо создайте новую.
        </Text>
        <Tabs
          size="s"
          items={adminTabs}
          value={adminTabs.find((tab) => tab.value === activeTab)}
          getItemLabel={(item) => item.label}
          getItemKey={(item) => item.value}
          onChange={(tab) => {
            setActiveTab(tab.value);
          }}
        />
        <div className={styles.selectorActions}>
          {activeTab === 'module' && (
            <Select<SelectItem<string>>
              size="s"
              items={moduleOptions}
              value={moduleSelectValue}
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              onChange={(value) => {
                if (value) {
                  setSelectedModuleId(value.value);
                }
              }}
            />
          )}
          {activeTab === 'domain' && (
            <Select<SelectItem<string>>
              size="s"
              items={domainOptions}
              value={domainSelectValue}
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              onChange={(value) => {
                if (value) {
                  setSelectedDomainId(value.value);
                }
              }}
            />
          )}
          {activeTab === 'artifact' && (
            <Select<SelectItem<string>>
              size="s"
              items={artifactOptions}
              value={artifactSelectValue}
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              onChange={(value) => {
                if (value) {
                  setSelectedArtifactId(value.value);
                }
              }}
            />
          )}
          {activeTab === 'expert' && (
            <Select<SelectItem<string>>
              size="s"
              items={expertOptions}
              value={expertSelectValue}
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              onChange={(value) => {
                if (value) {
                  setSelectedExpertId(value.value);
                }
              }}
            />
          )}
        </div>
      </div>

      <div className={styles.formWrapper}>
        <AnimatePresence mode="wait">
          {activeTab === 'module' && (
            <motion.div
              key="module"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={tabVariants}
              style={{ width: '100%' }}
            >
              <ModuleForm
                moduleKey={selectedModuleId}
                mode={selectedModuleId === '__new__' ? 'create' : 'edit'}
                draft={moduleDraft}
                step={moduleStep}
                domainItems={leafDomainIds}
                domainLabelMap={domainLabelMap}
                moduleItems={modules.map((module) => module.id)}
                moduleLabelMap={moduleLabelMap}
                artifactItems={artifacts.map((artifact) => artifact.id)}
                artifactLabelMap={artifactLabelMap}
                productNames={productNames}
                onRegisterProduct={registerProductName}
                creatorCompanies={creatorCompanies}
                onRegisterCreatorCompany={registerCreatorCompany}
                localizations={localizations}
                onRegisterLocalization={registerLocalization}
                ridCompanyRegistry={ridCompanyRegistry}
                onRegisterRidCompany={registerRidCompany}
                onRegisterRidDivision={registerRidDivision}
                technologyOptions={technologyOptions}
                onRegisterTechnology={registerTechnology}
                libraryRegistry={libraryRegistry}
                onRegisterLibrary={registerLibrary}
                onRegisterLibraryVersion={registerLibraryVersion}
                companyNames={companyNames}
                onRegisterCompany={registerCompanyName}
                onChange={setModuleDraft}
                onStepChange={setModuleStep}
                onSubmit={handleModuleSubmit}
                onDelete={selectedModuleId === '__new__' ? undefined : handleModuleDelete}
              />
            </motion.div>
          )}

          {activeTab === 'domain' && (
            <motion.div
              key="domain"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={tabVariants}
              style={{ width: '100%' }}
            >
              <DomainForm
                mode={selectedDomainId === '__new__' ? 'create' : 'edit'}
                draft={domainDraft}
                step={domainStep}
                parentCatalogIds={catalogDomainIds}
                parentDomainIds={parentDomainIds}
                forbiddenParentIds={forbiddenParentIds}
                parentLabelMap={domainParentLabelMap}
                moduleItems={modules.map((module) => module.id)}
                moduleLabelMap={moduleLabelMap}
                currentDomainId={selectedDomainId === '__new__' ? undefined : selectedDomainId}
                onChange={setDomainDraft}
                onStepChange={setDomainStep}
                onSubmit={handleDomainSubmit}
                onDelete={selectedDomainId === '__new__' ? undefined : handleDomainDelete}
              />
            </motion.div>
          )}

          {activeTab === 'artifact' && (
            <motion.div
              key="artifact"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={tabVariants}
              style={{ width: '100%' }}
            >
              <ArtifactForm
                mode={selectedArtifactId === '__new__' ? 'create' : 'edit'}
                draft={artifactDraft}
                step={artifactStep}
                domainItems={leafDomainIds}
                domainLabelMap={domainLabelMap}
                moduleItems={modules.map((module) => module.id)}
                moduleLabelMap={moduleLabelMap}
                artifactItems={artifacts.map((artifact) => artifact.id)}
                artifactLabelMap={artifactLabelMap}
                dataTypes={artifactDataTypes}
                onRegisterDataType={registerArtifactDataType}
                onChange={setArtifactDraft}
                onStepChange={setArtifactStep}
                onSubmit={handleArtifactSubmit}
                onDelete={selectedArtifactId === '__new__' ? undefined : handleArtifactDelete}
              />
            </motion.div>
          )}

          {activeTab === 'expert' && (
            <motion.div
              key="expert"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={tabVariants}
              style={{ width: '100%' }}
            >
              <ExpertForm
                mode={selectedExpertId === '__new__' ? 'create' : 'edit'}
                draft={expertDraft}
                expertId={selectedExpertId === '__new__' ? null : selectedExpertId}
                availableRoles={availableRoles}
                initiatives={initiatives}
                tasks={employeeTasks}
                domainItems={parentDomainIds}
                domainLabelMap={domainLabelMap}
                moduleLabelMap={moduleLabelMap}
                locations={locations}
                onRegisterLocation={registerLocation}
                languages={languageOptions}
                onRegisterLanguage={registerLanguage}
                onChange={setExpertDraft}
                onSubmit={handleExpertSubmit}
                onUpdateTasks={onUpdateEmployeeTasks}
                onDelete={selectedExpertId === '__new__' ? undefined : handleExpertDelete}
              />
            </motion.div>
          )}

          {activeTab === 'role' && (
            <motion.div
              key="role"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={tabVariants}
              style={{ width: '100%' }}
            >
              <RoleCompetencyAdmin />
            </motion.div>
          )}

          {activeTab === 'user' && (
            <motion.div
              key="user"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={tabVariants}
              style={{ width: '100%' }}
            >
              <UserManagement
                users={users}
                selectedUserId={selectedUserId}
                userDraft={userDraft}
                onUserDraftChange={setUserDraft}
                onSubmit={handleUserSubmit}
                onEdit={handleUserEdit}
                onDelete={handleUserDelete}
                currentUser={currentUser}
              />
            </motion.div>
          )}

          {activeTab === 'logs' && (
            <motion.div
              key="logs"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={tabVariants}
              style={{ width: '100%' }}
            >
              <LoginLogsView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

type ModuleFormProps = {
  moduleKey: string | null;
  mode: 'create' | 'edit';
  draft: ModuleDraftPayload;
  step: number;
  domainItems: string[];
  domainLabelMap: Record<string, string>;
  moduleItems: string[];
  moduleLabelMap: Record<string, string>;
  artifactItems: string[];
  artifactLabelMap: Record<string, string>;
  productNames: string[];
  onRegisterProduct: (value: string) => void;
  creatorCompanies: string[];
  onRegisterCreatorCompany: (value: string) => void;
  localizations: string[];
  onRegisterLocalization: (value: string) => void;
  ridCompanyRegistry: Record<string, string[]>;
  onRegisterRidCompany: (value: string) => void;
  onRegisterRidDivision: (company: string, division: string) => void;
  technologyOptions: string[];
  onRegisterTechnology: (value: string) => void;
  libraryRegistry: Record<string, string[]>;
  onRegisterLibrary: (value: string) => void;
  onRegisterLibraryVersion: (library: string, version: string) => void;
  companyNames: string[];
  onRegisterCompany: (value: string) => void;
  onChange: (draft: ModuleDraftPayload) => void;
  onStepChange: (step: number) => void;
  onSubmit: () => void;
  onDelete?: () => void;
};

const ModuleForm: React.FC<ModuleFormProps> = ({
  moduleKey,
  mode,
  draft,
  step,
  domainItems,
  domainLabelMap,
  moduleItems,
  moduleLabelMap,
  artifactItems,
  artifactLabelMap,
  productNames,
  onRegisterProduct,
  creatorCompanies,
  onRegisterCreatorCompany,
  localizations,
  onRegisterLocalization,
  ridCompanyRegistry,
  onRegisterRidCompany,
  onRegisterRidDivision,
  technologyOptions,
  onRegisterTechnology,
  libraryRegistry,
  onRegisterLibrary,
  onRegisterLibraryVersion,
  companyNames,
  onRegisterCompany,
  onChange,
  onStepChange,
  onSubmit,
  onDelete
}) => {
  const skillRegistryVersion = useSkillRegistryVersion();
  const current = Math.min(Math.max(step, 0), moduleSections.length - 1);
  const goToStep = (next: number) => {
    onStepChange(Math.min(Math.max(next, 0), moduleSections.length - 1));
  };

  const statusItems = useMemo<SelectItem<ModuleStatus>[]>(
    () =>
      (['in-dev', 'production', 'deprecated'] as ModuleStatus[]).map((status) => ({
        label: statusLabels[status],
        value: status
      })),
    []
  );

  const clientTypeItems = useMemo<SelectItem<ModuleNode['clientType']>[]>(
    () =>
      (Object.keys(clientTypeLabels) as ModuleNode['clientType'][]).map((type) => ({
        label: clientTypeLabels[type],
        value: type
      })),
    []
  );

  const deploymentItems = useMemo<SelectItem<ModuleNode['deploymentTool']>[]>(
    () =>
      (Object.keys(deploymentToolLabels) as ModuleNode['deploymentTool'][]).map((tool) => ({
        label: deploymentToolLabels[tool],
        value: tool
      })),
    []
  );

  const teamRoleItems = useMemo<SelectItem<TeamRole>[]>(
    () => {
      void skillRegistryVersion;
      return getKnownRoles().map((role) => ({ label: role, value: role }));
    },
    [skillRegistryVersion]
  );

  const CREATE_PRODUCT_OPTION = '__create_product__';
  const CREATE_CREATOR_COMPANY_OPTION = '__create_creator_company__';
  const CREATE_LOCALIZATION_OPTION = '__create_localization__';
  const CREATE_RID_COMPANY_OPTION = '__create_rid_company__';
  const CREATE_RID_DIVISION_OPTION = '__create_rid_division__';
  const CREATE_TECHNOLOGY_OPTION = '__create_technology__';
  const CREATE_COMPANY_USAGE_OPTION = '__create_company_usage__';
  const CREATE_LIBRARY_OPTION = '__create_library__';
  const CREATE_LIBRARY_VERSION_OPTION = '__create_library_version__';

  const [productCreation, setProductCreation] = useState<InlineStringCreation | null>(null);
  const [creatorCompanyCreation, setCreatorCompanyCreation] = useState<InlineStringCreation | null>(
    null
  );
  const [localizationCreation, setLocalizationCreation] = useState<InlineStringCreation | null>(null);
  const [ridCompanyCreation, setRidCompanyCreation] = useState<InlineStringCreation | null>(null);
  const [ridDivisionCreation, setRidDivisionCreation] = useState<InlineStringCreation | null>(null);
  const [technologyCreation, setTechnologyCreation] = useState<TechnologyCreationState | null>(null);
  const [companyUsageCreation, setCompanyUsageCreation] = useState<IndexedStringCreation | null>(null);
  const [libraryCreation, setLibraryCreation] = useState<IndexedStringCreation | null>(null);
  const [libraryVersionCreation, setLibraryVersionCreation] = useState<IndexedStringCreation | null>(
    null
  );

  useEffect(() => {
    setProductCreation(null);
    setCreatorCompanyCreation(null);
    setLocalizationCreation(null);
    setRidCompanyCreation(null);
    setRidDivisionCreation(null);
    setTechnologyCreation(null);
    setCompanyUsageCreation(null);
    setLibraryCreation(null);
    setLibraryVersionCreation(null);
  }, [moduleKey]);

  const buildItems = (values: Iterable<string>, extra?: string) => {
    const set = new Set<string>();
    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed) {
        set.add(trimmed);
      }
    }
    if (extra) {
      const trimmed = extra.trim();
      if (trimmed) {
        set.add(trimmed);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  };

  const productItems = useMemo(
    () => [...buildItems(productNames, draft.productName), CREATE_PRODUCT_OPTION],
    [draft.productName, productNames]
  );

  const creatorCompanyItems = useMemo(
    () => [...buildItems(creatorCompanies, draft.creatorCompany), CREATE_CREATOR_COMPANY_OPTION],
    [creatorCompanies, draft.creatorCompany]
  );

  const localizationItems = useMemo(() => {
    const base = buildItems(localizations, draft.localization);
    if (!base.includes('ru')) {
      base.push('ru');
    }
    base.sort((a, b) => a.localeCompare(b, 'ru'));
    base.push(CREATE_LOCALIZATION_OPTION);
    return base;
  }, [draft.localization, localizations]);

  const ridCompanyItems = useMemo(
    () => [...buildItems(Object.keys(ridCompanyRegistry), draft.ridOwner.company), CREATE_RID_COMPANY_OPTION],
    [draft.ridOwner.company, ridCompanyRegistry]
  );

  const ridDivisionItems = useMemo(() => {
    const company = draft.ridOwner.company.trim();
    const base = company ? buildItems(ridCompanyRegistry[company] ?? [], draft.ridOwner.division) : [];
    if (company) {
      base.push(CREATE_RID_DIVISION_OPTION);
    }
    return base;
  }, [draft.ridOwner.company, draft.ridOwner.division, ridCompanyRegistry]);

  const technologyItems = useMemo(() => {
    const base = buildItems([...technologyOptions, ...draft.technologyStack]);
    base.push(CREATE_TECHNOLOGY_OPTION);
    return base;
  }, [draft.technologyStack, technologyOptions]);

  const companyUsageItems = useMemo(() => {
    const base = buildItems([
      ...companyNames,
      ...draft.userStats.companies.map((company) => company.name)
    ]);
    base.push(CREATE_COMPANY_USAGE_OPTION);
    return base;
  }, [companyNames, draft.userStats.companies]);

  const libraryItems = useMemo(() => {
    const base = buildItems([
      ...Object.keys(libraryRegistry),
      ...draft.libraries.map((library) => library.name)
    ]);
    base.push(CREATE_LIBRARY_OPTION);
    return base;
  }, [draft.libraries, libraryRegistry]);

  const handleBasicFieldChange = <Key extends keyof ModuleDraftPayload>(
    key: Key,
    value: ModuleDraftPayload[Key]
  ) => {
    onChange({ ...draft, [key]: value });
  };

  const handleRegisterIfNeeded = (value: string, existing: string[], register: (val: string) => void) => {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    if (!existing.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      register(normalized);
    }
  };

  const handleProductSelection = (value: string | null) => {
    if (!value) {
      setProductCreation(null);
      handleBasicFieldChange('productName', '');
      return;
    }
    if (value === CREATE_PRODUCT_OPTION) {
      setProductCreation({ value: '', previous: draft.productName });
      return;
    }
    setProductCreation(null);
    handleRegisterIfNeeded(value, productNames, onRegisterProduct);
    handleBasicFieldChange('productName', value);
  };

  const confirmProductCreation = () => {
    if (!productCreation) {
      return;
    }
    const next = productCreation.value.trim();
    if (!next) {
      setProductCreation(null);
      return;
    }
    onRegisterProduct(next);
    handleBasicFieldChange('productName', next);
    setProductCreation(null);
  };

  const cancelProductCreation = () => {
    if (!productCreation) {
      return;
    }
    handleBasicFieldChange('productName', productCreation.previous);
    setProductCreation(null);
  };

  const handleCreatorCompanySelection = (value: string | null) => {
    if (!value) {
      setCreatorCompanyCreation(null);
      handleBasicFieldChange('creatorCompany', '');
      return;
    }
    if (value === CREATE_CREATOR_COMPANY_OPTION) {
      setCreatorCompanyCreation({ value: '', previous: draft.creatorCompany });
      return;
    }
    setCreatorCompanyCreation(null);
    handleRegisterIfNeeded(value, creatorCompanies, onRegisterCreatorCompany);
    handleBasicFieldChange('creatorCompany', value);
  };

  const confirmCreatorCompanyCreation = () => {
    if (!creatorCompanyCreation) {
      return;
    }
    const next = creatorCompanyCreation.value.trim();
    if (!next) {
      setCreatorCompanyCreation(null);
      return;
    }
    onRegisterCreatorCompany(next);
    handleBasicFieldChange('creatorCompany', next);
    setCreatorCompanyCreation(null);
  };

  const cancelCreatorCompanyCreation = () => {
    if (!creatorCompanyCreation) {
      return;
    }
    handleBasicFieldChange('creatorCompany', creatorCompanyCreation.previous);
    setCreatorCompanyCreation(null);
  };

  const handleLocalizationSelection = (value: string | null) => {
    if (!value) {
      setLocalizationCreation(null);
      handleBasicFieldChange('localization', 'ru');
      return;
    }
    if (value === CREATE_LOCALIZATION_OPTION) {
      setLocalizationCreation({ value: '', previous: draft.localization });
      return;
    }
    setLocalizationCreation(null);
    handleRegisterIfNeeded(value, localizations, onRegisterLocalization);
    handleBasicFieldChange('localization', value);
  };

  const confirmLocalizationCreation = () => {
    if (!localizationCreation) {
      return;
    }
    const next = localizationCreation.value.trim() || 'ru';
    onRegisterLocalization(next);
    handleBasicFieldChange('localization', next);
    setLocalizationCreation(null);
  };

  const cancelLocalizationCreation = () => {
    if (!localizationCreation) {
      return;
    }
    handleBasicFieldChange('localization', localizationCreation.previous || 'ru');
    setLocalizationCreation(null);
  };

  const handleRidCompanySelection = (value: string | null) => {
    if (!value) {
      setRidCompanyCreation(null);
      setRidDivisionCreation(null);
      onChange({ ...draft, ridOwner: { company: '', division: '' } });
      return;
    }
    if (value === CREATE_RID_COMPANY_OPTION) {
      setRidCompanyCreation({ value: '', previous: draft.ridOwner.company });
      return;
    }
    setRidCompanyCreation(null);
    setRidDivisionCreation(null);
    handleRegisterIfNeeded(value, Object.keys(ridCompanyRegistry), onRegisterRidCompany);
    onChange({ ...draft, ridOwner: { company: value, division: '' } });
  };

  const confirmRidCompanyCreation = () => {
    if (!ridCompanyCreation) {
      return;
    }
    const next = ridCompanyCreation.value.trim();
    if (!next) {
      setRidCompanyCreation(null);
      return;
    }
    onRegisterRidCompany(next);
    onChange({ ...draft, ridOwner: { company: next, division: '' } });
    setRidCompanyCreation(null);
    setRidDivisionCreation(null);
  };

  const cancelRidCompanyCreation = () => {
    if (!ridCompanyCreation) {
      return;
    }
    onChange({ ...draft, ridOwner: { ...draft.ridOwner, company: ridCompanyCreation.previous } });
    setRidCompanyCreation(null);
  };

  const handleRidDivisionSelection = (value: string | null) => {
    if (!value) {
      setRidDivisionCreation(null);
      onChange({ ...draft, ridOwner: { ...draft.ridOwner, division: '' } });
      return;
    }
    if (value === CREATE_RID_DIVISION_OPTION) {
      setRidDivisionCreation({ value: '', previous: draft.ridOwner.division });
      return;
    }
    setRidDivisionCreation(null);
    const company = draft.ridOwner.company.trim();
    if (company) {
      onRegisterRidDivision(company, value);
    }
    onChange({ ...draft, ridOwner: { ...draft.ridOwner, division: value } });
  };

  const confirmRidDivisionCreation = () => {
    if (!ridDivisionCreation) {
      return;
    }
    const next = ridDivisionCreation.value.trim();
    if (!next) {
      setRidDivisionCreation(null);
      return;
    }
    const company = draft.ridOwner.company.trim();
    if (company) {
      onRegisterRidDivision(company, next);
    }
    onChange({ ...draft, ridOwner: { ...draft.ridOwner, division: next } });
    setRidDivisionCreation(null);
  };

  const cancelRidDivisionCreation = () => {
    if (!ridDivisionCreation) {
      return;
    }
    onChange({ ...draft, ridOwner: { ...draft.ridOwner, division: ridDivisionCreation.previous } });
    setRidDivisionCreation(null);
  };

  const handleTechnologySelection = (values: string[] | null) => {
    const nextValues = values ?? [];
    if (nextValues.includes(CREATE_TECHNOLOGY_OPTION)) {
      setTechnologyCreation({ value: '', previous: draft.technologyStack });
      return;
    }
    const normalized = Array.from(
      new Set(
        nextValues
          .map((item) => item.trim())
          .filter((item) => item && item !== CREATE_TECHNOLOGY_OPTION)
      )
    );
    normalized.forEach((item) => handleRegisterIfNeeded(item, technologyOptions, onRegisterTechnology));
    onChange({ ...draft, technologyStack: normalized });
  };

  const confirmTechnologyCreation = () => {
    if (!technologyCreation) {
      return;
    }
    const next = technologyCreation.value.trim();
    if (!next) {
      setTechnologyCreation(null);
      return;
    }
    onRegisterTechnology(next);
    const updated = Array.from(new Set([...technologyCreation.previous, next]));
    onChange({ ...draft, technologyStack: updated });
    setTechnologyCreation(null);
  };

  const cancelTechnologyCreation = () => {
    if (!technologyCreation) {
      return;
    }
    onChange({ ...draft, technologyStack: technologyCreation.previous });
    setTechnologyCreation(null);
  };

  const handleRemoveTechnology = (value: string) => {
    onChange({
      ...draft,
      technologyStack: draft.technologyStack.filter((item) => item !== value)
    });
  };

  const handleTeamChange = (
    index: number,
    patch: Partial<Pick<TeamMember, 'fullName' | 'role'>>
  ) => {
    onChange({
      ...draft,
      projectTeam: draft.projectTeam.map((member, memberIndex) =>
        memberIndex === index ? { ...member, ...patch } : member
      )
    });
  };

  const handleAddTeamMember = () => {
    onChange({
      ...draft,
      projectTeam: [
        ...draft.projectTeam,
        { id: `member-${draft.projectTeam.length + 1}`, fullName: '', role: 'Аналитик' }
      ]
    });
  };

  const handleRemoveTeamMember = (index: number) => {
    onChange({
      ...draft,
      projectTeam:
        draft.projectTeam.length <= 1
          ? draft.projectTeam
          : draft.projectTeam.filter((_, memberIndex) => memberIndex !== index)
    });
  };

  const handleUserCompanyChange = (
    index: number,
    patch: Partial<{ name: string; licenses: number }>
  ) => {
    const next = draft.userStats.companies.map((company, companyIndex) =>
      companyIndex === index ? { ...company, ...patch } : company
    );
    onChange({
      ...draft,
      userStats: { companies: next }
    });
  };

  const handleCompanyUsageSelection = (index: number, value: string | null) => {
    if (!value) {
      setCompanyUsageCreation((prev) => (prev?.index === index ? null : prev));
      handleUserCompanyChange(index, { name: '' });
      return;
    }
    if (value === CREATE_COMPANY_USAGE_OPTION) {
      setCompanyUsageCreation({
        index,
        value: '',
        previous: draft.userStats.companies[index]?.name ?? ''
      });
      return;
    }
    setCompanyUsageCreation((prev) => (prev?.index === index ? null : prev));
    handleRegisterIfNeeded(value, companyNames, onRegisterCompany);
    handleUserCompanyChange(index, { name: value });
  };

  const confirmCompanyUsageCreation = () => {
    if (!companyUsageCreation) {
      return;
    }
    const next = companyUsageCreation.value.trim();
    if (!next) {
      setCompanyUsageCreation(null);
      return;
    }
    onRegisterCompany(next);
    handleUserCompanyChange(companyUsageCreation.index, { name: next });
    setCompanyUsageCreation(null);
  };

  const cancelCompanyUsageCreation = () => {
    if (!companyUsageCreation) {
      return;
    }
    handleUserCompanyChange(companyUsageCreation.index, { name: companyUsageCreation.previous });
    setCompanyUsageCreation(null);
  };

  const handleAddUserCompany = () => {
    onChange({
      ...draft,
      userStats: {
        companies: [...draft.userStats.companies, { name: '', licenses: 0 }]
      }
    });
  };

  const handleRemoveUserCompany = (index: number) => {
    onChange({
      ...draft,
      userStats: {
        companies:
          draft.userStats.companies.length <= 1
            ? draft.userStats.companies
            : draft.userStats.companies.filter((_, companyIndex) => companyIndex !== index)
      }
    });
  };

  const handleLibrariesChange = (index: number, patch: Partial<LibraryDependency>) => {
    const next = draft.libraries.map((library, libraryIndex) =>
      libraryIndex === index ? { ...library, ...patch } : library
    );
    onChange({ ...draft, libraries: next });
  };

  const handleLibrarySelection = (index: number, value: string | null) => {
    if (!value) {
      setLibraryCreation((prev) => (prev?.index === index ? null : prev));
      setLibraryVersionCreation((prev) => (prev?.index === index ? null : prev));
      handleLibrariesChange(index, { name: '', version: '' });
      return;
    }
    if (value === CREATE_LIBRARY_OPTION) {
      setLibraryCreation({ index, value: '', previous: draft.libraries[index]?.name ?? '' });
      return;
    }
    setLibraryCreation((prev) => (prev?.index === index ? null : prev));
    setLibraryVersionCreation((prev) => (prev?.index === index ? null : prev));
    onRegisterLibrary(value);
    handleLibrariesChange(index, { name: value, version: '' });
  };

  const confirmLibraryCreation = () => {
    if (!libraryCreation) {
      return;
    }
    const next = libraryCreation.value.trim();
    if (!next) {
      setLibraryCreation(null);
      return;
    }
    onRegisterLibrary(next);
    handleLibrariesChange(libraryCreation.index, { name: next, version: '' });
    setLibraryCreation(null);
  };

  const cancelLibraryCreation = () => {
    if (!libraryCreation) {
      return;
    }
    handleLibrariesChange(libraryCreation.index, { name: libraryCreation.previous });
    setLibraryCreation(null);
  };

  const handleLibraryVersionSelection = (index: number, value: string | null) => {
    if (!value) {
      setLibraryVersionCreation((prev) => (prev?.index === index ? null : prev));
      handleLibrariesChange(index, { version: '' });
      return;
    }
    if (value === CREATE_LIBRARY_VERSION_OPTION) {
      setLibraryVersionCreation({
        index,
        value: '',
        previous: draft.libraries[index]?.version ?? ''
      });
      return;
    }
    setLibraryVersionCreation((prev) => (prev?.index === index ? null : prev));
    const libraryName = draft.libraries[index]?.name.trim();
    if (libraryName) {
      onRegisterLibraryVersion(libraryName, value);
    }
    handleLibrariesChange(index, { version: value });
  };

  const confirmLibraryVersionCreation = () => {
    if (!libraryVersionCreation) {
      return;
    }
    const next = libraryVersionCreation.value.trim();
    if (!next) {
      setLibraryVersionCreation(null);
      return;
    }
    const libraryName = draft.libraries[libraryVersionCreation.index]?.name.trim();
    if (libraryName) {
      onRegisterLibraryVersion(libraryName, next);
    }
    handleLibrariesChange(libraryVersionCreation.index, { version: next });
    setLibraryVersionCreation(null);
  };

  const cancelLibraryVersionCreation = () => {
    if (!libraryVersionCreation) {
      return;
    }
    handleLibrariesChange(libraryVersionCreation.index, { version: libraryVersionCreation.previous });
    setLibraryVersionCreation(null);
  };

  const handleAddLibrary = () => {
    onChange({
      ...draft,
      libraries: [...draft.libraries, { name: '', version: '' }]
    });
  };

  const handleRemoveLibrary = (index: number) => {
    setLibraryCreation((prev) => (prev?.index === index ? null : prev));
    setLibraryVersionCreation((prev) => (prev?.index === index ? null : prev));
    onChange({
      ...draft,
      libraries:
        draft.libraries.length <= 1
          ? draft.libraries
          : draft.libraries.filter((_, libraryIndex) => libraryIndex !== index)
    });
  };

  const handleDataInChange = (index: number, patch: Partial<ModuleInput>) => {
    onChange({
      ...draft,
      dataIn: draft.dataIn.map((input, inputIndex) =>
        inputIndex === index ? { ...input, ...patch } : input
      )
    });
  };

  const handleAddDataIn = () => {
    onChange({
      ...draft,
      dataIn: [...draft.dataIn, { id: `input-${draft.dataIn.length + 1}`, label: '', sourceId: undefined }]
    });
  };

  const handleRemoveDataIn = (index: number) => {
    onChange({
      ...draft,
      dataIn:
        draft.dataIn.length <= 1
          ? draft.dataIn
          : draft.dataIn.filter((_, inputIndex) => inputIndex !== index)
    });
  };

  const handleDataOutChange = (index: number, patch: Partial<ModuleOutput>) => {
    onChange({
      ...draft,
      dataOut: draft.dataOut.map((output, outputIndex) =>
        outputIndex === index ? { ...output, ...patch } : output
      )
    });
  };

  const handleAddDataOut = () => {
    onChange({
      ...draft,
      dataOut: [...draft.dataOut, { id: `output-${draft.dataOut.length + 1}`, label: '', artifactId: undefined }]
    });
  };

  const handleRemoveDataOut = (index: number) => {
    onChange({
      ...draft,
      dataOut:
        draft.dataOut.length <= 1
          ? draft.dataOut
          : draft.dataOut.filter((_, outputIndex) => outputIndex !== index)
    });
  };

  const renderGeneralSection = () => (
    <>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Название модуля
        </Text>
        <TextField
          size="s"
          value={draft.name}
          onChange={(value) => handleBasicFieldChange('name', value ?? '')}
        />
      </label>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Статус
          </Text>
          <Select<SelectItem<ModuleStatus>>
            size="s"
            items={statusItems}
            value={statusItems.find((item) => item.value === draft.status) ?? null}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
            onChange={(item) => item && handleBasicFieldChange('status', item.value)}
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Компания-разработчик
          </Text>
          <Combobox<string>
            size="s"
            items={creatorCompanyItems}
            value={
              creatorCompanyCreation
                ? CREATE_CREATOR_COMPANY_OPTION
                : draft.creatorCompany.trim() || null
            }
            getItemKey={(item) => item}
            getItemLabel={(item) =>
              item === CREATE_CREATOR_COMPANY_OPTION ? 'Добавить компанию…' : item || '—'
            }
            placeholder="Выберите компанию"
            onChange={handleCreatorCompanySelection}
          />
          {creatorCompanyCreation && (
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                value={creatorCompanyCreation.value}
                onChange={(event) =>
                  setCreatorCompanyCreation({ ...creatorCompanyCreation, value: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmCreatorCompanyCreation();
                  }
                }}
                placeholder="Введите название компании"
              />
              <div className={styles.inlineButtons}>
                <Button size="xs" label="Сохранить" view="primary" onClick={confirmCreatorCompanyCreation} />
                <Button size="xs" label="Отмена" view="ghost" onClick={cancelCreatorCompanyCreation} />
              </div>
            </div>
          )}
        </label>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Продукт
          </Text>
          <Combobox<string>
            size="s"
            items={productItems}
            value={productCreation ? CREATE_PRODUCT_OPTION : draft.productName.trim() || null}
            getItemKey={(item) => item}
            getItemLabel={(item) => (item === CREATE_PRODUCT_OPTION ? 'Добавить продукт…' : item || '—')}
            placeholder="Выберите продукт"
            onChange={handleProductSelection}
          />
          {productCreation && (
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                value={productCreation.value}
                onChange={(event) =>
                  setProductCreation({ ...productCreation, value: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmProductCreation();
                  }
                }}
                placeholder="Введите название продукта"
              />
              <div className={styles.inlineButtons}>
                <Button size="xs" label="Сохранить" view="primary" onClick={confirmProductCreation} />
                <Button size="xs" label="Отмена" view="ghost" onClick={cancelProductCreation} />
              </div>
            </div>
          )}
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Локализация
          </Text>
          <Combobox<string>
            size="s"
            items={localizationItems}
            value={
              localizationCreation
                ? CREATE_LOCALIZATION_OPTION
                : draft.localization.trim() || 'ru'
            }
            getItemKey={(item) => item}
            getItemLabel={(item) => (item === CREATE_LOCALIZATION_OPTION ? 'Добавить локализацию…' : item)}
            placeholder="Выберите локализацию"
            onChange={handleLocalizationSelection}
          />
          {localizationCreation && (
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                value={localizationCreation.value}
                onChange={(event) =>
                  setLocalizationCreation({ ...localizationCreation, value: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmLocalizationCreation();
                  }
                }}
                placeholder="Например, ru"
              />
              <div className={styles.inlineButtons}>
                <Button size="xs" label="Сохранить" view="primary" onClick={confirmLocalizationCreation} />
                <Button size="xs" label="Отмена" view="ghost" onClick={cancelLocalizationCreation} />
              </div>
            </div>
          )}
        </label>
      </div>
      <div className={styles.metricDisplay}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Оценка переиспользования
        </Text>
        <Text size="m" weight="semibold">{draft.reuseScore}%</Text>
        <Text size="xs" view="secondary" className={styles.metricHint}>
          Значение вычисляется автоматически и используется как справочная метрика.
        </Text>
      </div>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Описание
        </Text>
        <textarea
          className={styles.textarea}
          value={draft.description}
          onChange={(event) => handleBasicFieldChange('description', event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Доменные области
        </Text>
        <Combobox<string>
          size="s"
          items={domainItems}
          value={draft.domainIds}
          multiple
          getItemKey={(item) => item}
          getItemLabel={(item) => domainLabelMap[item] ?? item}
          placeholder="Выберите конечные домены"
          onChange={(value) => handleBasicFieldChange('domainIds', value ?? [])}
        />
        {mode === 'create' && draft.domainIds.length === 0 && (
          <Text size="xs" className={styles.error}>
            Укажите хотя бы один конечный домен.
          </Text>
        )}
      </label>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Владелец РИД — компания
          </Text>
          <Combobox<string>
            size="s"
            items={ridCompanyItems}
            value={
              ridCompanyCreation
                ? CREATE_RID_COMPANY_OPTION
                : draft.ridOwner.company.trim() || null
            }
            getItemKey={(item) => item}
            getItemLabel={(item) => (item === CREATE_RID_COMPANY_OPTION ? 'Добавить компанию…' : item)}
            placeholder="Выберите компанию"
            onChange={handleRidCompanySelection}
          />
          {ridCompanyCreation && (
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                value={ridCompanyCreation.value}
                onChange={(event) =>
                  setRidCompanyCreation({ ...ridCompanyCreation, value: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmRidCompanyCreation();
                  }
                }}
                placeholder="Введите компанию"
              />
              <div className={styles.inlineButtons}>
                <Button size="xs" label="Сохранить" view="primary" onClick={confirmRidCompanyCreation} />
                <Button size="xs" label="Отмена" view="ghost" onClick={cancelRidCompanyCreation} />
              </div>
            </div>
          )}
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Владелец РИД — подразделение
          </Text>
          <Combobox<string>
            size="s"
            items={ridDivisionItems}
            value={
              ridDivisionCreation
                ? CREATE_RID_DIVISION_OPTION
                : draft.ridOwner.division.trim() || null
            }
            getItemKey={(item) => item}
            getItemLabel={(item) => (item === CREATE_RID_DIVISION_OPTION ? 'Добавить подразделение…' : item)}
            placeholder="Выберите подразделение"
            disabled={!draft.ridOwner.company.trim()}
            onChange={handleRidDivisionSelection}
          />
          {ridDivisionCreation && (
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                value={ridDivisionCreation.value}
                onChange={(event) =>
                  setRidDivisionCreation({ ...ridDivisionCreation, value: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmRidDivisionCreation();
                  }
                }}
                placeholder="Введите подразделение"
              />
              <div className={styles.inlineButtons}>
                <Button size="xs" label="Сохранить" view="primary" onClick={confirmRidDivisionCreation} />
                <Button size="xs" label="Отмена" view="ghost" onClick={cancelRidDivisionCreation} />
              </div>
            </div>
          )}
        </label>
      </div>
      <div className={styles.subSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Технологический стек
        </Text>
        <div className={styles.chipList}>
          {draft.technologyStack.length > 0 ? (
            draft.technologyStack.map((technology) => (
              <span key={technology} className={styles.chip}>
                <Text size="xs">{technology}</Text>
                <button
                  type="button"
                  className={styles.chipButton}
                  onClick={() => handleRemoveTechnology(technology)}
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <Text size="xs" view="secondary">
              Технологии не выбраны
            </Text>
          )}
        </div>
        <Combobox<string>
          size="s"
          items={technologyItems}
          value={draft.technologyStack}
          multiple
          getItemKey={(item) => item}
          getItemLabel={(item) => (item === CREATE_TECHNOLOGY_OPTION ? 'Добавить технологию…' : item)}
          placeholder="Добавьте технологию из справочника"
          onChange={handleTechnologySelection}
        />
        {technologyCreation && (
          <div className={styles.inlineForm}>
            <input
              className={styles.input}
              value={technologyCreation.value}
              onChange={(event) =>
                setTechnologyCreation({ ...technologyCreation, value: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  confirmTechnologyCreation();
                }
              }}
              placeholder="Например, React"
            />
            <div className={styles.inlineButtons}>
              <Button size="xs" label="Сохранить" view="primary" onClick={confirmTechnologyCreation} />
              <Button size="xs" label="Отмена" view="ghost" onClick={cancelTechnologyCreation} />
            </div>
          </div>
        )}
      </div>
      <div className={styles.subSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Команда проекта
        </Text>
        <div className={styles.listStack}>
          {draft.projectTeam.map((member, index) => (
            <div key={member.id} className={styles.inlineGroup}>
              <TextField
                size="s"
                value={member.fullName}
                placeholder="ФИО"
                onChange={(value) => handleTeamChange(index, { fullName: value ?? '' })}
              />
              <Select<SelectItem<TeamRole>>
                size="s"
                items={teamRoleItems}
                value={teamRoleItems.find((item) => item.value === member.role) ?? null}
                getItemLabel={(item) => item.label}
                getItemKey={(item) => item.value}
                onChange={(item) => item && handleTeamChange(index, { role: item.value })}
              />
              <Button
                size="xs"
                view="ghost"
                label="Удалить"
                onClick={() => handleRemoveTeamMember(index)}
              />
            </div>
          ))}
        </div>
        <Button size="xs" view="secondary" label="Добавить участника" onClick={handleAddTeamMember} />
      </div>
      <div className={styles.subSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Компании и лицензии
        </Text>
        <div className={styles.listStack}>
          {draft.userStats.companies.map((company, index) => (
            <div key={`${company.name || 'company'}-${index}`} className={styles.inlineGroup}>
              <Combobox<string>
                size="s"
                items={companyUsageItems}
                value={
                  companyUsageCreation?.index === index
                    ? CREATE_COMPANY_USAGE_OPTION
                    : company.name.trim() || null
                }
                getItemKey={(item) => item}
                getItemLabel={(item) => (item === CREATE_COMPANY_USAGE_OPTION ? 'Добавить компанию…' : item || '—')}
                placeholder="Выберите компанию"
                onChange={(value) => handleCompanyUsageSelection(index, value)}
              />
              {companyUsageCreation?.index === index && (
                <div className={styles.inlineForm}>
                  <input
                    className={styles.input}
                    value={companyUsageCreation.value}
                    onChange={(event) =>
                      setCompanyUsageCreation({ ...companyUsageCreation, value: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        confirmCompanyUsageCreation();
                      }
                    }}
                    placeholder="Введите компанию"
                  />
                  <div className={styles.inlineButtons}>
                    <Button size="xs" label="Сохранить" view="primary" onClick={confirmCompanyUsageCreation} />
                    <Button size="xs" label="Отмена" view="ghost" onClick={cancelCompanyUsageCreation} />
                  </div>
                </div>
              )}
              <TextField
                size="s"
                type="number"
                value={String(company.licenses)}
                placeholder="Лицензии"
                onChange={(value) =>
                  handleUserCompanyChange(index, {
                    licenses: Number(value ?? company.licenses)
                  })
                }
              />
              <Button
                size="xs"
                view="ghost"
                label="Удалить"
                onClick={() => handleRemoveUserCompany(index)}
              />
            </div>
          ))}
        </div>
        <Button size="xs" view="secondary" label="Добавить компанию" onClick={handleAddUserCompany} />
      </div>
    </>
  );

  const renderCalculationSection = () => (
    <>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Зависимые модули
        </Text>
        <Combobox<string>
          size="s"
          items={moduleItems.filter((item) => item !== moduleKey)}
          value={draft.dependencyIds}
          multiple
          getItemKey={(item) => item}
          getItemLabel={(item) => moduleLabelMap[item] ?? item}
          placeholder="Выберите зависимости"
          onChange={(value) => handleBasicFieldChange('dependencyIds', value ?? [])}
        />
      </label>
      <div className={styles.subSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Входные данные
        </Text>
        <div className={styles.listStack}>
          {draft.dataIn.map((input, index) => (
            <div key={input.id || `input-${index}`} className={styles.dataRow}>
              <TextField
                size="s"
                value={input.id}
                placeholder="ID"
                onChange={(value) => handleDataInChange(index, { id: value ?? '' })}
              />
              <TextField
                size="s"
                value={input.label}
                placeholder="Описание"
                onChange={(value) => handleDataInChange(index, { label: value ?? '' })}
              />
              <Combobox<string>
                size="s"
                items={artifactItems}
                value={input.sourceId ?? null}
                getItemKey={(item) => item}
                getItemLabel={(item) => artifactLabelMap[item] ?? item}
                placeholder="Артефакт"
                onChange={(value) => handleDataInChange(index, { sourceId: value ?? undefined })}
              />
              <Button
                size="xs"
                view="ghost"
                label="Удалить"
                onClick={() => handleRemoveDataIn(index)}
              />
            </div>
          ))}
        </div>
        <Button size="xs" view="secondary" label="Добавить вход" onClick={handleAddDataIn} />
      </div>
      <div className={styles.subSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Выходные данные
        </Text>
        <div className={styles.listStack}>
          {draft.dataOut.map((output, index) => (
            <div key={output.id || `output-${index}`} className={styles.dataRow}>
              <TextField
                size="s"
                value={output.id}
                placeholder="ID"
                onChange={(value) => handleDataOutChange(index, { id: value ?? '' })}
              />
              <TextField
                size="s"
                value={output.label}
                placeholder="Описание"
                onChange={(value) => handleDataOutChange(index, { label: value ?? '' })}
              />
              <Combobox<string>
                size="s"
                items={artifactItems}
                value={output.artifactId ?? null}
                getItemKey={(item) => item}
                getItemLabel={(item) => artifactLabelMap[item] ?? item}
                placeholder="Артефакт"
                onChange={(value) => handleDataOutChange(index, { artifactId: value ?? undefined })}
              />
              <Button
                size="xs"
                view="ghost"
                label="Удалить"
                onClick={() => handleRemoveDataOut(index)}
              />
            </div>
          ))}
        </div>
        <Button size="xs" view="secondary" label="Добавить выход" onClick={handleAddDataOut} />
      </div>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Описание алгоритма расчёта модуля
        </Text>
        <textarea
          className={styles.textarea}
          value={draft.formula}
          onChange={(event) => handleBasicFieldChange('formula', event.target.value)}
        />
      </label>
    </>
  );

  const renderTechnicalSection = () => (
    <>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Репозиторий
          </Text>
          <TextField
            size="s"
            value={draft.repository ?? ''}
            onChange={(value) => handleBasicFieldChange('repository', value ?? '')}
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            API
          </Text>
          <TextField
            size="s"
            value={draft.api ?? ''}
            onChange={(value) => handleBasicFieldChange('api', value ?? '')}
          />
        </label>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Спецификация
          </Text>
          <TextField
            size="s"
            value={draft.specificationUrl}
            onChange={(value) => handleBasicFieldChange('specificationUrl', value ?? '')}
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Контракты API
          </Text>
          <TextField
            size="s"
            value={draft.apiContractsUrl}
            onChange={(value) => handleBasicFieldChange('apiContractsUrl', value ?? '')}
          />
        </label>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Технический проект
          </Text>
          <TextField
            size="s"
            value={draft.techDesignUrl}
            onChange={(value) => handleBasicFieldChange('techDesignUrl', value ?? '')}
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Диаграмма архитектуры
          </Text>
          <TextField
            size="s"
            value={draft.architectureDiagramUrl}
            onChange={(value) => handleBasicFieldChange('architectureDiagramUrl', value ?? '')}
          />
        </label>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Клиентское приложение
          </Text>
          <Select<SelectItem<ModuleNode['clientType']>>
            size="s"
            items={clientTypeItems}
            value={clientTypeItems.find((item) => item.value === draft.clientType) ?? null}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
            onChange={(item) => item && handleBasicFieldChange('clientType', item.value)}
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Инструмент деплоя
          </Text>
          <Select<SelectItem<ModuleNode['deploymentTool']>>
            size="s"
            items={deploymentItems}
            value={deploymentItems.find((item) => item.value === draft.deploymentTool) ?? null}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
            onChange={(item) => item && handleBasicFieldChange('deploymentTool', item.value)}
          />
        </label>
      </div>
      <div className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Интеграция с сервером лицензирования
        </Text>
        <Switch
          size="s"
          checked={draft.licenseServerIntegrated}
          onChange={({ target }) =>
            handleBasicFieldChange('licenseServerIntegrated', target.checked)
          }
        />
      </div>
      <div className={styles.subSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Библиотеки
        </Text>
        <div className={styles.listStack}>
          {draft.libraries.map((library, index) => {
            const libraryName = library.name.trim();
            const versionItems = (() => {
              const base = buildItems(libraryName ? libraryRegistry[libraryName] ?? [] : [], library.version);
              if (libraryName) {
                base.push(CREATE_LIBRARY_VERSION_OPTION);
              }
              return base;
            })();
            return (
              <div key={`${library.name || 'library'}-${index}`} className={styles.inlineGroup}>
                <Combobox<string>
                  size="s"
                  items={libraryItems}
                  value={
                    libraryCreation?.index === index
                      ? CREATE_LIBRARY_OPTION
                      : library.name.trim() || null
                  }
                  getItemKey={(item) => item}
                  getItemLabel={(item) => (item === CREATE_LIBRARY_OPTION ? 'Добавить библиотеку…' : item || '—')}
                  placeholder="Выберите библиотеку"
                  onChange={(value) => handleLibrarySelection(index, value)}
                />
                {libraryCreation?.index === index && (
                  <div className={styles.inlineForm}>
                    <input
                      className={styles.input}
                      value={libraryCreation.value}
                      onChange={(event) =>
                        setLibraryCreation({ ...libraryCreation, value: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          confirmLibraryCreation();
                        }
                      }}
                      placeholder="Введите библиотеку"
                    />
                    <div className={styles.inlineButtons}>
                      <Button size="xs" label="Сохранить" view="primary" onClick={confirmLibraryCreation} />
                      <Button size="xs" label="Отмена" view="ghost" onClick={cancelLibraryCreation} />
                    </div>
                  </div>
                )}
                <Combobox<string>
                  size="s"
                  items={versionItems}
                  value={
                    libraryVersionCreation?.index === index
                      ? CREATE_LIBRARY_VERSION_OPTION
                      : library.version.trim() || null
                  }
                  disabled={!libraryName}
                  getItemKey={(item) => item}
                  getItemLabel={(item) => (item === CREATE_LIBRARY_VERSION_OPTION ? 'Добавить версию…' : item || '—')}
                  placeholder="Выберите версию"
                  onChange={(value) => handleLibraryVersionSelection(index, value)}
                />
                {libraryVersionCreation?.index === index && (
                  <div className={styles.inlineForm}>
                    <input
                      className={styles.input}
                      value={libraryVersionCreation.value}
                      onChange={(event) =>
                        setLibraryVersionCreation({ ...libraryVersionCreation, value: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          confirmLibraryVersionCreation();
                        }
                      }}
                      placeholder="Введите версию"
                    />
                    <div className={styles.inlineButtons}>
                      <Button size="xs" label="Сохранить" view="primary" onClick={confirmLibraryVersionCreation} />
                      <Button size="xs" label="Отмена" view="ghost" onClick={cancelLibraryVersionCreation} />
                    </div>
                  </div>
                )}
                <Button
                  size="xs"
                  view="ghost"
                  label="Удалить"
                  onClick={() => handleRemoveLibrary(index)}
                />
              </div>
            );
          })}
        </div>
        <Button size="xs" view="secondary" label="Добавить библиотеку" onClick={handleAddLibrary} />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Покрытие тестами, %
          </Text>
          <TextField
            size="s"
            type="number"
            value={String(draft.metrics.coverage)}
            onChange={(value) =>
              handleBasicFieldChange('metrics', {
                ...draft.metrics,
                coverage: Number(value ?? draft.metrics.coverage)
              })
            }
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Автоматизация регрессии, %
          </Text>
          <TextField
            size="s"
            type="number"
            value={String(draft.metrics.automationRate)}
            onChange={(value) =>
              handleBasicFieldChange('metrics', {
                ...draft.metrics,
                automationRate: Number(value ?? draft.metrics.automationRate)
              })
            }
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Количество тестов
          </Text>
          <TextField
            size="s"
            type="number"
            value={String(draft.metrics.tests)}
            onChange={(value) =>
              handleBasicFieldChange('metrics', {
                ...draft.metrics,
                tests: Number(value ?? draft.metrics.tests)
              })
            }
          />
        </label>
      </div>
    </>
  );

  const renderNonFunctionalSection = () => (
    <>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Время отклика, мс
          </Text>
          <TextField
            size="s"
            type="number"
            value={String(draft.nonFunctional.responseTimeMs)}
            onChange={(value) =>
              handleBasicFieldChange('nonFunctional', {
                ...draft.nonFunctional,
                responseTimeMs: Number(value ?? draft.nonFunctional.responseTimeMs)
              })
            }
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Пропускная способность, rps
          </Text>
          <TextField
            size="s"
            type="number"
            value={String(draft.nonFunctional.throughputRps)}
            onChange={(value) =>
              handleBasicFieldChange('nonFunctional', {
                ...draft.nonFunctional,
                throughputRps: Number(value ?? draft.nonFunctional.throughputRps)
              })
            }
          />
        </label>
      </div>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Потребление ресурсов
        </Text>
        <TextField
          size="s"
          value={draft.nonFunctional.resourceConsumption}
          onChange={(value) =>
            handleBasicFieldChange('nonFunctional', {
              ...draft.nonFunctional,
              resourceConsumption: value ?? ''
            })
          }
        />
      </label>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Базовое количество пользователей
        </Text>
        <TextField
          size="s"
          type="number"
          value={String(draft.nonFunctional.baselineUsers)}
          onChange={(value) =>
            handleBasicFieldChange('nonFunctional', {
              ...draft.nonFunctional,
              baselineUsers: Number(value ?? draft.nonFunctional.baselineUsers)
            })
          }
        />
      </label>
    </>
  );

  return (
    <div className={styles.formBody}>
      <div className={styles.formHeader}>
        <div>
          <Text size="l" weight="semibold" className={styles.formTitle}>
            {mode === 'create' ? 'Создание модуля' : 'Редактирование модуля'}
          </Text>
          <Text size="xs" view="secondary" className={styles.formSubtitle}>
            Заполните ключевые сведения и связи модуля перед публикацией в графе.
          </Text>
        </div>
        {onDelete && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button size="s" view="clear" label="Удалить модуль" onClick={onDelete} />
          </motion.div>
        )}
      </div>
      <Tabs
        value={moduleSections[current]}
        onChange={({ value }) => {
          const index = moduleSections.findIndex((s) => s.id === value.id);
          if (index >= 0) goToStep(index);
        }}
        items={moduleSections}
        getItemLabel={(item) => item.title}
        getItemKey={(item) => item.id}
        size="s"
        className={styles.moduleTabs}
      />
      <div className={styles.moduleFormContent}>
        {moduleSections[current].id === 'general' && renderGeneralSection()}
        {moduleSections[current].id === 'calculation' && renderCalculationSection()}
        {moduleSections[current].id === 'technical' && renderTechnicalSection()}
        {moduleSections[current].id === 'nonFunctional' && renderNonFunctionalSection()}

        <div className={styles.stepActions}>
          {current > 0 && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button size="s" view="ghost" label="Назад" onClick={() => goToStep(current - 1)} />
            </motion.div>
          )}
          {current < moduleSections.length - 1 ? (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button size="s" label="Далее" onClick={() => goToStep(current + 1)} />
            </motion.div>
          ) : (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button size="s" view="primary" label="Сохранить модуль" onClick={onSubmit} />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};


type DomainFormProps = {
  mode: 'create' | 'edit';
  draft: DomainDraftPayload;
  step: number;
  parentCatalogIds: string[];
  parentDomainIds: string[];
  forbiddenParentIds: string[];
  parentLabelMap: Record<string, string>;
  moduleItems: string[];
  moduleLabelMap: Record<string, string>;
  currentDomainId?: string;
  onChange: (draft: DomainDraftPayload) => void;
  onStepChange: (step: number) => void;
  onSubmit: () => void;
  onDelete?: () => void;
};

const domainSections: DomainSectionId[] = ['basic', 'relations'];

const DomainForm: React.FC<DomainFormProps> = ({
  mode,
  draft,
  step,
  parentCatalogIds,
  parentDomainIds,
  forbiddenParentIds,
  parentLabelMap,
  moduleItems,
  moduleLabelMap,
  currentDomainId,
  onChange,
  onStepChange,
  onSubmit,
  onDelete
}) => {
  const goToStep = (next: number) => {
    onStepChange(Math.min(Math.max(next, 0), domainSections.length - 1));
  };

  const current = Math.min(Math.max(step, 0), domainSections.length - 1);

  const parentOptions = useMemo<string[]>(() => {
    const values = new Set<string>();
    parentCatalogIds.forEach((id) => values.add(id));
    parentDomainIds.forEach((id) => values.add(id));
    if (draft.parentId) {
      values.add(draft.parentId);
    }
    const filtered = Array.from(values).filter((id) =>
      id && id !== currentDomainId && !forbiddenParentIds.includes(id)
    );
    return ['__root__', ...filtered];
  }, [currentDomainId, draft.parentId, forbiddenParentIds, parentCatalogIds, parentDomainIds]);

  const handleParentChange = (value: string | null) => {
    if (!value || value === '__root__') {
      onChange({ ...draft, parentId: undefined, isCatalogRoot: false });
      return;
    }
    onChange({ ...draft, parentId: value, isCatalogRoot: false });
  };

  const renderBasicSection = () => (
    <>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Название домена
        </Text>
        <TextField
          size="s"
          value={draft.name}
          onChange={(value) => onChange({ ...draft, name: value ?? '' })}
        />
      </label>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Описание
        </Text>
        <textarea
          className={styles.textarea}
          value={draft.description}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
        />
      </label>
      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Родительский раздел
          </Text>
          <Combobox<string>
            size="s"
            items={parentOptions}
            value={draft.parentId ?? '__root__'}
            getItemKey={(item) => item}
            getItemLabel={(item) =>
              item === '__root__' ? 'Корень каталога' : parentLabelMap[item] ?? item
            }
            onChange={handleParentChange}
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Каталожный раздел
          </Text>
          <Switch
            size="s"
            checked={draft.isCatalogRoot}
            onChange={({ target }) =>
              onChange({ ...draft, isCatalogRoot: target.checked })
            }
          />
        </label>
      </div>
    </>
  );

  const renderRelationsSection = () => (
    <>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Связанные модули
        </Text>
        <Combobox<string>
          size="s"
          items={moduleItems}
          value={draft.moduleIds}
          multiple
          getItemKey={(item) => item}
          getItemLabel={(item) => moduleLabelMap[item] ?? item}
          onChange={(value) => onChange({ ...draft, moduleIds: value ?? [] })}
        />
      </label>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Экспертное сообщество
        </Text>
        <TextField
          size="s"
          value={draft.experts.join(', ')}
          placeholder="Через запятую"
          onChange={(value) =>
            onChange({
              ...draft,
              experts: (value ?? '')
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            })
          }
        />
      </label>
      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Ссылка на мероприятия
        </Text>
        <TextField
          size="s"
          value={draft.meetupLink}
          onChange={(value) => onChange({ ...draft, meetupLink: value ?? '' })}
        />
      </label>
    </>
  );

  return (
    <div className={styles.formBody}>
      <div className={styles.formHeader}>
        <div>
          <Text size="l" weight="semibold" className={styles.formTitle}>
            {mode === 'create' ? 'Создание домена' : 'Редактирование домена'}
          </Text>
          <Text size="xs" view="secondary" className={styles.formSubtitle}>
            Уточните положение в каталоге и связанные модули доменной области.
          </Text>
        </div>
        {onDelete && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button size="s" view="clear" label="Удалить домен" onClick={onDelete} />
          </motion.div>
        )}
      </div>
      {domainSections.map((section, index) => (
        <Collapse
          key={section}
          isOpen={current === index}
          onClick={() => goToStep(index)}
          label={
            <div className={styles.collapseLabel}>
              <Text size="s" weight="semibold">
                {section === 'basic' ? 'Основные сведения' : 'Связи и эксперты'}
              </Text>
              <Text size="xs" view="secondary">
                Раздел {index + 1} из {domainSections.length}
              </Text>
            </div>
          }
        >
          <div className={styles.sectionContent}>
            {section === 'basic' ? renderBasicSection() : renderRelationsSection()}
          </div>
          <div className={styles.stepActions}>
            {index > 0 && (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button size="s" view="ghost" label="Назад" onClick={() => goToStep(index - 1)} />
              </motion.div>
            )}
            {index < domainSections.length - 1 ? (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button size="s" label="Далее" onClick={() => goToStep(index + 1)} />
              </motion.div>
            ) : (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button size="s" view="primary" label="Сохранить домен" onClick={onSubmit} />
              </motion.div>
            )}
          </div>
        </Collapse>
      ))}
    </div>
  );
};

type ArtifactFormProps = {
  mode: 'create' | 'edit';
  draft: ArtifactDraftPayload;
  step: number;
  domainItems: string[];
  domainLabelMap: Record<string, string>;
  moduleItems: string[];
  moduleLabelMap: Record<string, string>;
  artifactItems: string[];
  artifactLabelMap: Record<string, string>;
  dataTypes: string[];
  onRegisterDataType: (value: string) => void;
  onChange: (draft: ArtifactDraftPayload) => void;
  onStepChange: (step: number) => void;
  onSubmit: () => void;
  onDelete?: () => void;
};

const artifactSections: ArtifactSectionId[] = ['basic', 'relations'];

const ArtifactForm: React.FC<ArtifactFormProps> = ({
  mode,
  draft,
  step,
  domainItems,
  domainLabelMap,
  moduleItems,
  moduleLabelMap,
  dataTypes,
  onRegisterDataType,
  onChange,
  onStepChange,
  onSubmit,
  onDelete
}) => {
  const goToStep = (next: number) => {
    onStepChange(Math.min(Math.max(next, 0), artifactSections.length - 1));
  };

  const current = Math.min(Math.max(step, 0), artifactSections.length - 1);

  const [dataTypeCreation, setDataTypeCreation] = useState<
    { value: string; previous: string } | null
  >(null);

  useEffect(() => {
    setDataTypeCreation(null);
  }, [draft]);

  const dataTypeItems = useMemo<SelectItem<string>[]>(() => {
    const values = new Set(dataTypes);
    const currentValue = draft.dataType.trim();
    if (currentValue) {
      values.add(currentValue);
    }
    return [
      ...Array.from(values)
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map<SelectItem<string>>((value) => ({ label: value, value })),
      { label: 'Добавить новый тип', value: CREATE_DATA_TYPE_OPTION }
    ];
  }, [dataTypes, draft.dataType]);

  const selectedDataTypeItem =
    dataTypeCreation
      ? dataTypeItems.find((item) => item.value === CREATE_DATA_TYPE_OPTION) ?? null
      : dataTypeItems.find((item) => item.value === draft.dataType.trim()) ?? null;

  const handleDataTypeSelection = (item: SelectItem<string> | null) => {
    if (!item) {
      return;
    }
    if (item.value === CREATE_DATA_TYPE_OPTION) {
      setDataTypeCreation({ value: '', previous: draft.dataType });
      return;
    }
    setDataTypeCreation(null);
    onChange({ ...draft, dataType: item.value });
  };

  const updateDataTypeCreationValue = (value: string) => {
    setDataTypeCreation((prev) =>
      prev ? { ...prev, value } : { value, previous: draft.dataType }
    );
  };

  const confirmDataTypeCreation = () => {
    if (!dataTypeCreation) {
      return;
    }
    const trimmed = dataTypeCreation.value.trim();
    if (!trimmed) {
      return;
    }
    onRegisterDataType(trimmed);
    setDataTypeCreation(null);
    onChange({ ...draft, dataType: trimmed });
  };

  const cancelDataTypeCreation = () => {
    if (!dataTypeCreation) {
      return;
    }
    setDataTypeCreation(null);
    onChange({ ...draft, dataType: dataTypeCreation.previous });
  };

  return (
    <div className={styles.formBody}>
      <div className={styles.formHeader}>
        <div>
          <Text size="l" weight="semibold" className={styles.formTitle}>
            {mode === 'create' ? 'Создание артефакта' : 'Редактирование артефакта'}
          </Text>
          <Text size="xs" view="secondary" className={styles.formSubtitle}>
            Опишите артефакт и свяжите его с модулем-источником и потребителями.
          </Text>
        </div>
        {onDelete && <Button view="clear" label="Удалить артефакт" size="s" onClick={onDelete} />}
      </div>

      {artifactSections.map((section, index) => (
        <Collapse
          key={section}
          isOpen={current === index}
          onClick={() => goToStep(index)}
          label={
            <div className={styles.collapseLabel}>
              <Text size="s" weight="semibold">
                {index === 0 ? 'Основные сведения' : 'Связи'}
              </Text>
              <Text size="xs" view="secondary">
                Раздел {index + 1} из {artifactSections.length}
              </Text>
            </div>
          }
        >
          <div className={styles.sectionContent}>
            {section === 'basic' && (
              <>
                <label className={styles.field}>
                  <Text size="xs" weight="semibold" className={styles.label}>
                    Название
                  </Text>
                  <input
                    className={styles.input}
                    value={draft.name}
                    onChange={(event) => onChange({ ...draft, name: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <Text size="xs" weight="semibold" className={styles.label}>
                    Описание
                  </Text>
                  <textarea
                    className={styles.textarea}
                    value={draft.description}
                    onChange={(event) => onChange({ ...draft, description: event.target.value })}
                  />
                </label>
                <div className={styles.field}>
                  <Text size="xs" weight="semibold" className={styles.label}>
                    Тип данных
                  </Text>
                  <Select<SelectItem<string>>
                    size="s"
                    items={dataTypeItems}
                    value={selectedDataTypeItem}
                    getItemLabel={(item) => item.label}
                    getItemKey={(item) => item.value}
                    placeholder="Выберите тип данных"
                    onChange={handleDataTypeSelection}
                  />
                  {dataTypeCreation && (
                    <div className={styles.inlineForm}>
                      <input
                        className={styles.input}
                        value={dataTypeCreation.value}
                        onChange={(event) => updateDataTypeCreationValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            confirmDataTypeCreation();
                          }
                        }}
                        placeholder="Например, CSV"
                      />
                      <div className={styles.inlineButtons}>
                        <Button size="xs" label="Сохранить" view="primary" onClick={confirmDataTypeCreation} />
                        <Button size="xs" label="Отмена" view="ghost" onClick={cancelDataTypeCreation} />
                      </div>
                    </div>
                  )}
                </div>
                <label className={styles.field}>
                  <Text size="xs" weight="semibold" className={styles.label}>
                    Пример данных (URL)
                  </Text>
                  <input
                    className={styles.input}
                    value={draft.sampleUrl}
                    onChange={(event) => onChange({ ...draft, sampleUrl: event.target.value })}
                  />
                </label>
              </>
            )}

            {section === 'relations' && (
              <>
                <label className={styles.field}>
                  <Text size="xs" weight="semibold" className={styles.label}>
                    Доменная область
                  </Text>
                  <Combobox<string>
                    size="s"
                    items={domainItems}
                    value={draft.domainId}
                    getItemKey={(item) => item}
                    getItemLabel={(item) => domainLabelMap[item] ?? item}
                    onChange={(value) => onChange({ ...draft, domainId: value ?? undefined })}
                  />
                </label>
                <label className={styles.field}>
                  <Text size="xs" weight="semibold" className={styles.label}>
                    Модуль-источник
                  </Text>
                  <Combobox<string>
                    size="s"
                    items={moduleItems}
                    value={draft.producedBy}
                    getItemKey={(item) => item}
                    getItemLabel={(item) => moduleLabelMap[item] ?? item}
                    onChange={(value) => onChange({ ...draft, producedBy: value ?? undefined })}
                  />
                </label>
                <label className={styles.field}>
                  <Text size="xs" weight="semibold" className={styles.label}>
                    Модули-потребители
                  </Text>
                  <Combobox<string>
                    size="s"
                    items={moduleItems}
                    value={draft.consumerIds}
                    multiple
                    getItemKey={(item) => item}
                    getItemLabel={(item) => moduleLabelMap[item] ?? item}
                    onChange={(value) => onChange({ ...draft, consumerIds: value ?? [] })}
                  />
                </label>
              </>
            )}

            <div className={styles.stepActions}>
              {index > 0 && (
                <Button
                  size="s"
                  view="ghost"
                  label="Вернуться к предыдущему разделу"
                  onClick={() => goToStep(index - 1)}
                />
              )}
              {index < artifactSections.length - 1 ? (
                <Button
                  size="s"
                  label="Заполнить следующий раздел"
                  onClick={() => goToStep(index + 1)}
                />
              ) : (
                <Button size="s" view="primary" label="Сохранить артефакт" onClick={onSubmit} />
              )}
            </div>
          </div>
        </Collapse>
      ))}
    </div>
  );
};

type ExpertFormProps = {
  mode: 'create' | 'edit';
  draft: ExpertDraftPayload;
  expertId: string | null;
  availableRoles: TeamRole[];
  initiatives: Initiative[];
  tasks: TaskListItem[];
  domainItems: string[];
  domainLabelMap: Record<string, string>;
  moduleLabelMap: Record<string, string>;
  locations: string[];
  onRegisterLocation: (value: string) => void;
  languages: string[];
  onRegisterLanguage: (value: string) => void;
  onChange: (draft: ExpertDraftPayload) => void;
  onSubmit: () => void;
  onUpdateTasks: (tasks: TaskListItem[]) => void;
  onDelete?: () => void;
};

type ExpertImportDialogState = {
  draft: ExpertDraftPayload;
  result: ExpertImportResult;
  pendingSkills: MissingSkillEntry[];
  pendingCompetencies: MissingCompetencyEntry[];
  pendingDomains: MissingDomainEntry[];
  fileName: string;
};

type SkillGap = {
  definition: ReturnType<typeof getSkillsByRole>[number];
  currentLevel: SkillLevel | null;
  targetLevel: SkillLevel;
  suggestedInitiative?: Initiative;
  isTheoretical: boolean;
};

const TARGET_SKILL_LEVEL: SkillLevel = 'E';
const SKILL_LEVEL_RANK: Record<SkillLevel, number> = {
  A: 0,
  W: 1,
  P: 2,
  Ad: 3,
  E: 4
};

const ExpertForm: React.FC<ExpertFormProps> = ({
  mode,
  draft,
  expertId,
  availableRoles,
  initiatives,
  tasks,
  domainItems,
  domainLabelMap,
  moduleLabelMap,
  locations,
  onRegisterLocation,
  languages,
  onRegisterLanguage,
  onChange,
  onSubmit,
  onUpdateTasks,
  onDelete
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importState, setImportState] = useState<ExpertImportDialogState | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const skillRegistryVersion = useSkillRegistryVersion();
  const expertExcelRef = useRef<Promise<typeof import('../utils/expertExcel')> | null>(null);

  const loadExpertExcel = () => {
    if (!expertExcelRef.current) {
      expertExcelRef.current = import('../utils/expertExcel');
    }
    return expertExcelRef.current;
  };

  const handleDraftChange = <Key extends keyof ExpertDraftPayload>(
    key: Key,
    value: ExpertDraftPayload[Key]
  ) => {
    onChange({ ...draft, [key]: value });
  };

  const parseList = (value: string): string[] =>
    value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

  const formatList = (values: string[]): string => values.join('\n');

  const slugifySkillId = (name: string): string =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

  const buildExportFileName = () => {
    const baseName = draft.fullName.trim() || 'expert-profile';
    const normalized = baseName
      .replace(/[^0-9A-Za-zА-Яа-яЁё\s-]+/g, '')
      .trim()
      .replace(/\s+/g, '_');
    return `${normalized || 'expert-profile'}.xlsx`;
  };

  const openImportPreview = (result: ExpertImportResult, fileName: string) => {
    const normalizedDraft = cloneExpertDraft(result.draft);
    setImportState({
      draft: normalizedDraft,
      result: {
        ...result,
        errors: [...result.errors],
        warnings: [...result.warnings],
        missingHardSkills: [...result.missingHardSkills],
        missingCompetencies: [...result.missingCompetencies],
        missingDomains: [...result.missingDomains]
      },
      pendingSkills: [...result.missingHardSkills],
      pendingCompetencies: [...result.missingCompetencies],
      pendingDomains: [...result.missingDomains],
      fileName
    });
    setIsImportModalOpen(true);
  };

  const handleExpertExport = async () => {
    try {
      const { exportExpertToExcel } = await loadExpertExcel();
      const buffer = await exportExpertToExcel({
        draft,
        expertId,
        domainLabelMap,
        moduleLabelMap
      });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = buildExportFileName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportError('Не удалось экспортировать профиль. Попробуйте ещё раз.');
      console.error('Failed to export expert profile', error);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportClose = () => {
    setIsImportModalOpen(false);
    setImportState(null);
  };

  const ensureImportedSkillsRegistered = useCallback(() => {
    if (!importState) {
      return;
    }
    const importRole = importState.draft.title.trim();

    importState.draft.skills.forEach((skill) => {
      const existingName = getSkillNameById(skill.id);
      const currentRoles = getRolesForSkill(skill.id);
      const shouldAttachRole = importRole
        ? !currentRoles.includes(importRole as TeamRole)
        : false;

      if (!existingName || shouldAttachRole) {
        registerSkillDefinition({
          id: skill.id,
          name: existingName ?? skill.id,
          description: existingName ?? skill.id,
          category: 'hard',
          sources: [],
          recommendedLevel: 'P',
          evidenceStatus: 'screened',
          roles: shouldAttachRole ? [...currentRoles, importRole as TeamRole] : currentRoles
        });
      }
    });
  }, [importState]);

  const handleImportApply = () => {
    if (!importState) {
      return;
    }
    ensureImportedSkillsRegistered();
    onChange(importState.draft);
    setImportState(null);
    setIsImportModalOpen(false);
    setImportError(null);
  };

  const handleImportRoleSelect = (item: SelectItem<string> | null) => {
    if (!importState || !item) {
      return;
    }
    setImportState((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, draft: { ...prev.draft, title: item.value } };
    });
  };

  const handleImportRoleInput = (value: string | null) => {
    setImportState((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, draft: { ...prev.draft, title: value ?? '' } };
    });
  };

  const handleRegisterMissingSkill = (entry: MissingSkillEntry) => {
    const importRole = importState?.draft.title.trim();
    const definitionRoles = entry.definition.roles ?? [];
    const hasImportRole = importRole
      ? definitionRoles.includes(importRole as TeamRole)
      : false;
    const definitionToRegister = hasImportRole
      ? entry.definition
      : importRole
        ? { ...entry.definition, roles: [...definitionRoles, importRole as TeamRole] }
        : entry.definition;
    registerSkillDefinition(definitionToRegister);
    setImportState((prev) => {
      if (!prev) {
        return prev;
      }
      const pendingSkills = prev.pendingSkills.filter(
        (item) => item.requestedId !== entry.requestedId
      );
      const remainingMissing = prev.result.missingHardSkills.filter(
        (item) => item.requestedId !== entry.requestedId
      );
      return {
        ...prev,
        pendingSkills,
        result: {
          ...prev.result,
          missingHardSkills: remainingMissing,
          warnings: [
            ...prev.result.warnings,
            `Навык «${entry.definition.name}» добавлен в базу и будет импортирован.`
          ]
        }
      };
    });
  };

  const handleSkipMissingSkill = (entry: MissingSkillEntry) => {
    setImportState((prev) => {
      if (!prev) {
        return prev;
      }
      const pendingSkills = prev.pendingSkills.filter(
        (item) => item.requestedId !== entry.requestedId
      );
      const remainingMissing = prev.result.missingHardSkills.filter(
        (item) => item.requestedId !== entry.requestedId
      );
      const filteredSkills = prev.draft.skills.filter((skill) => skill.id !== entry.requestedId);
      const nextCompetencies = updateCompetenciesFromSkills(
        filteredSkills,
        prev.draft.competencies,
        prev.draft.competencyRecords ?? []
      );
      return {
        ...prev,
        draft: {
          ...prev.draft,
          skills: filteredSkills,
          competencies: nextCompetencies.names,
          competencyRecords: nextCompetencies.records
        },
        pendingSkills,
        result: {
          ...prev.result,
          missingHardSkills: remainingMissing,
          warnings: [
            ...prev.result.warnings,
            `Навык «${entry.definition.name}» будет исключён из профиля.`
          ]
        }
      };
    });
  };

  const handleRegisterMissingCompetency = (entry: MissingCompetencyEntry) => {
    registerRoleCompetency(entry.roleTitle, entry.competencyName);
    setImportState((prev) => {
      if (!prev) {
        return prev;
      }

      const normalizedRole = entry.roleTitle.trim();
      const existingDefinition = findSkillByName(entry.competencyName);
      const competencyRecord = prev.draft.competencyRecords?.find(
        (record) => record.name === entry.competencyName
      );
      const level = competencyRecord?.level ?? 'P';
      const proofStatus = competencyRecord?.proofStatus ?? 'screened';
      const skillId = existingDefinition?.id ?? slugifySkillId(entry.competencyName);
      const mergedRoles = existingDefinition?.roles ?? [];
      const shouldAttachRole =
        normalizedRole && !mergedRoles.includes(normalizedRole as TeamRole)
          ? [...mergedRoles, normalizedRole as TeamRole]
          : mergedRoles;

      registerSkillDefinition({
        id: skillId,
        name: existingDefinition?.name ?? entry.competencyName,
        description: existingDefinition?.description ?? entry.competencyName,
        category: 'hard',
        sources: existingDefinition?.sources ?? [],
        recommendedLevel: existingDefinition?.recommendedLevel ?? level,
        evidenceStatus: existingDefinition?.evidenceStatus ?? proofStatus,
        roles: shouldAttachRole
      });

      const existingSkill = prev.draft.skills.find((skill) => skill.id === skillId);
      const nextSkills = existingSkill
        ? prev.draft.skills.map((skill) =>
          skill.id === skillId ? { ...skill, level, proofStatus } : skill
        )
        : [
          ...prev.draft.skills,
          {
            id: skillId,
            level,
            proofStatus,
            evidence: [],
            artifacts: [],
            createdAt: new Date().toISOString(),
            interest: 'medium',
            availableFte: 0
          }
        ];

      const nextCompetencies = updateCompetenciesFromSkills(
        nextSkills,
        prev.draft.competencies,
        prev.draft.competencyRecords ?? []
      );

      const pendingCompetencies = prev.pendingCompetencies.filter(
        (item) =>
          item.competencyName !== entry.competencyName || item.roleTitle !== entry.roleTitle
      );
      const remainingMissing = prev.result.missingCompetencies.filter(
        (item) =>
          item.competencyName !== entry.competencyName || item.roleTitle !== entry.roleTitle
      );
      return {
        ...prev,
        draft: {
          ...prev.draft,
          skills: nextSkills,
          competencies: nextCompetencies.names,
          competencyRecords: nextCompetencies.records
        },
        pendingCompetencies,
        result: {
          ...prev.result,
          missingCompetencies: remainingMissing,
          warnings: [
            ...prev.result.warnings,
            `Компетенция «${entry.competencyName}» добавлена как hard skill и связана с ролью «${entry.roleTitle || 'роль не указана'
            }».`
          ]
        }
      };
    });
  };

  const handleSkipMissingCompetency = (entry: MissingCompetencyEntry) => {
    setImportState((prev) => {
      if (!prev) {
        return prev;
      }
      const pendingCompetencies = prev.pendingCompetencies.filter(
        (item) =>
          item.competencyName !== entry.competencyName || item.roleTitle !== entry.roleTitle
      );
      const remainingMissing = prev.result.missingCompetencies.filter(
        (item) =>
          item.competencyName !== entry.competencyName || item.roleTitle !== entry.roleTitle
      );
      const filteredCompetencies = prev.draft.competencies.filter(
        (competency) => competency !== entry.competencyName
      );
      const filteredRecords = (prev.draft.competencyRecords ?? []).filter(
        (record) => record.name !== entry.competencyName
      );
      return {
        ...prev,
        draft: {
          ...prev.draft,
          competencies: filteredCompetencies,
          competencyRecords: filteredRecords
        },
        pendingCompetencies,
        result: {
          ...prev.result,
          missingCompetencies: remainingMissing,
          warnings: [
            ...prev.result.warnings,
            `Компетенция «${entry.competencyName}» будет исключена из профиля.`
          ]
        }
      };
    });
  };

  const handleResolveMissingDomain = (entry: MissingDomainEntry, targetId: string) => {
    setImportState((prev) => {
      if (!prev) {
        return prev;
      }
      const pendingDomains = prev.pendingDomains.filter(
        (item) => item.requestedValue !== entry.requestedValue || item.source !== entry.source
      );
      const remainingMissing = prev.result.missingDomains.filter(
        (item) => item.requestedValue !== entry.requestedValue || item.source !== entry.source
      );
      const domainSet = new Set(prev.draft.domains);
      domainSet.add(targetId);
      const resolvedLabel = domainLabelMap[targetId] ?? targetId;
      return {
        ...prev,
        draft: { ...prev.draft, domains: Array.from(domainSet) },
        pendingDomains,
        result: {
          ...prev.result,
          missingDomains: remainingMissing,
          warnings: [
            ...prev.result.warnings,
            `Домен «${entry.requestedValue}» сопоставлен с «${resolvedLabel}».`
          ]
        }
      };
    });
  };

  const handleSkipMissingDomain = (entry: MissingDomainEntry) => {
    setImportState((prev) => {
      if (!prev) {
        return prev;
      }
      const pendingDomains = prev.pendingDomains.filter(
        (item) => item.requestedValue !== entry.requestedValue || item.source !== entry.source
      );
      const remainingMissing = prev.result.missingDomains.filter(
        (item) => item.requestedValue !== entry.requestedValue || item.source !== entry.source
      );
      return {
        ...prev,
        pendingDomains,
        result: {
          ...prev.result,
          missingDomains: remainingMissing,
          warnings: [
            ...prev.result.warnings,
            `Домен «${entry.requestedValue}» будет пропущен.`
          ]
        }
      };
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    event.target.value = '';
    setImportError(null);
    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const { parseExpertWorkbook } = await loadExpertExcel();
      const result = await parseExpertWorkbook({
        buffer,
        domainLabelMap,
        moduleLabelMap
      });
      openImportPreview(result, file.name);
    } catch (error) {
      setImportError('Не удалось обработать файл. Проверьте формат и попробуйте снова.');
      console.error('Failed to import expert profile', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExperienceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = Number(event.target.value);
    const normalized = Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
    handleDraftChange('experienceYears', normalized);
  };

  const nameParts = useMemo(() => parseFullName(draft.fullName), [draft.fullName]);
  const { lastName, firstName, middleName } = nameParts;

  const roleItems = useMemo<SelectItem<string>[]>(() => {
    const base = availableRoles.map<SelectItem<string>>((role) => ({ label: role, value: role }));
    if (draft.title && !base.some((item) => item.value === draft.title)) {
      return [{ label: draft.title, value: draft.title }, ...base];
    }
    return base;
  }, [availableRoles, draft.title]);

  const existingRoleItems = useMemo<SelectItem<string>[]>(
    () => availableRoles.map((role) => ({ label: role, value: role })),
    [availableRoles]
  );

  const domainOptions = useMemo<SelectItem<string>[]>(
    () => domainItems.map((id) => ({ label: domainLabelMap[id] ?? id, value: id })),
    [domainItems, domainLabelMap]
  );

  const selectedRole = useMemo(() => {
    const normalized = draft.title.trim();
    return normalized ? (normalized as TeamRole) : null;
  }, [draft.title]);

  const hardSkillDefinitions = useMemo(() => {
    void skillRegistryVersion;
    if (!selectedRole) {
      return [] as ReturnType<typeof getSkillsByRole>;
    }
    return getSkillsByRole(selectedRole).filter((definition) => definition.category === 'hard');
  }, [selectedRole, skillRegistryVersion]);

  const softSkillDefinitions = useMemo(() => {
    void skillRegistryVersion;
    if (!selectedRole) {
      return [] as ReturnType<typeof getSkillsByRole>;
    }
    return getSkillsByRole(selectedRole).filter((definition) => definition.category === 'soft');
  }, [selectedRole, skillRegistryVersion]);

  const hardSkillMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getSkillsByRole>[number]>();
    hardSkillDefinitions.forEach((definition) => {
      map.set(definition.id, definition);
    });
    return map;
  }, [hardSkillDefinitions]);

  const hardSkillLevelItems = useMemo<SelectItem<SkillLevel>[]>(
    () =>
      skillLevels.map((descriptor) => ({
        label: `${descriptor.label} (${descriptor.id})`,
        value: descriptor.id
      })),
    []
  );

  const hardSkillEvidenceItems = useMemo<SelectItem<SkillEvidenceStatus>[]>(
    () =>
      evidenceStatuses.map((descriptor) => ({
        label: descriptor.label,
        value: descriptor.id as SkillEvidenceStatus
      })),
    []
  );

  const skillLevelLabelMap = useMemo(() => {
    const map = new Map<SkillLevel, string>();
    skillLevels.forEach((descriptor) => map.set(descriptor.id, descriptor.label));
    return map;
  }, []);

  const CREATE_LOCATION_OPTION = '__create_location__';
  const CREATE_LANGUAGE_OPTION = '__create_language__';

  const [locationCreation, setLocationCreation] = useState<InlineStringCreation | null>(null);
  const [languageCreation, setLanguageCreation] = useState<MultiStringCreation | null>(null);

  const locationItems = useMemo(() => {
    const base = mergeStringCollections(locations, draft.location ? [draft.location] : []);
    return [...base, CREATE_LOCATION_OPTION];
  }, [draft.location, locations]);

  const languageItems = useMemo(() => {
    const base = mergeStringCollections(languages, draft.languages);
    return [...base, CREATE_LANGUAGE_OPTION];
  }, [draft.languages, languages]);

  const importRoleName = importState?.draft.title.trim() ?? '';
  const isImportRoleKnown = !importRoleName || availableRoles.includes(importRoleName);
  const importRoleSelection = importState?.draft.title
    ? existingRoleItems.find((item) => item.value === importState.draft.title) ?? null
    : null;

  const findInitiativeForSkill = useCallback(
    (definition: ReturnType<typeof getSkillsByRole>[number]) => {
      const normalizedName = definition.name.toLowerCase();
      const normalizedId = definition.id.toLowerCase();

      return initiatives.find((initiative) => {
        const requirementMatch = initiative.requirements?.some((requirement) =>
          requirement.skills.some((skill) => {
            const normalizedSkill = skill.toLowerCase();
            return (
              normalizedSkill.includes(normalizedName) ||
              normalizedSkill.includes(normalizedId)
            );
          })
        );

        const skillMatch = initiative.requiredSkills.some((skill) => {
          const normalizedSkill = skill.toLowerCase();
          return (
            normalizedSkill.includes(normalizedName) || normalizedSkill.includes(normalizedId)
          );
        });

        return requirementMatch || skillMatch;
      });
    },
    [initiatives]
  );

  const hardSkillGaps = useMemo<SkillGap[]>(() => {
    return hardSkillDefinitions
      .map((definition) => {
        const skill = draft.skills.find((entry) => entry.id === definition.id);
        const currentLevel = skill?.level ?? null;
        const currentRank = currentLevel ? SKILL_LEVEL_RANK[currentLevel] : -1;
        if (currentRank >= SKILL_LEVEL_RANK[TARGET_SKILL_LEVEL]) {
          return null;
        }

        return {
          definition,
          currentLevel,
          targetLevel: TARGET_SKILL_LEVEL,
          suggestedInitiative: findInitiativeForSkill(definition) ?? undefined,
          isTheoretical: definition.recommendedLevel === 'A'
        } satisfies SkillGap;
      })
      .filter((entry): entry is SkillGap => Boolean(entry));
  }, [draft.skills, findInitiativeForSkill, hardSkillDefinitions]);

  const updateCompetenciesFromSkills = useCallback(
    (
      skills: ExpertSkill[],
      currentCompetencies: string[],
      currentRecords: ExpertCompetencyRecord[]
    ): { names: string[]; records: ExpertCompetencyRecord[] } => {
      const activeNames = new Set<string>();
      const derivedRecords = new Map<string, ExpertCompetencyRecord>();

      skills.forEach((skill) => {
        const definition = hardSkillMap.get(skill.id);
        const resolvedName = definition?.name ?? getSkillNameById(skill.id) ?? skill.id;
        if (!resolvedName) {
          return;
        }
        activeNames.add(resolvedName);
        derivedRecords.set(resolvedName, {
          name: resolvedName,
          level: skill.level,
          proofStatus: skill.proofStatus
        });
      });

      const preserved = currentCompetencies.filter((competency) => !activeNames.has(competency));
      const names = mergeStringCollections(preserved, Array.from(activeNames));

      const recordMap = new Map<string, ExpertCompetencyRecord>();
      currentRecords.forEach((record) => {
        if (!recordMap.has(record.name)) {
          recordMap.set(record.name, { ...record });
        }
      });

      const records = names.map((name) => {
        const derived = derivedRecords.get(name);
        if (derived) {
          return derived;
        }
        const existing = recordMap.get(name);
        return existing ? { ...existing } : { name };
      });

      return { names, records };
    },
    [hardSkillMap]
  );

  const areArraysEqual = (first: string[], second: string[]): boolean => {
    if (first.length !== second.length) {
      return false;
    }
    return first.every((value, index) => value === second[index]);
  };

  const areCompetencyRecordsEqual = (
    first: ExpertCompetencyRecord[],
    second: ExpertCompetencyRecord[]
  ): boolean => {
    if (first.length !== second.length) {
      return false;
    }
    return first.every((record, index) => {
      const other = second[index];
      return (
        record.name === other.name &&
        record.level === other.level &&
        record.proofStatus === other.proofStatus
      );
    });
  };

  const handleHardSkillToggle = (definition: ReturnType<typeof getSkillsByRole>[number], enabled: boolean) => {
    if (enabled) {
      const existing = draft.skills.find((entry) => entry.id === definition.id);
      const nextSkills = existing
        ? draft.skills
        : [
          ...draft.skills,
          {
            id: definition.id,
            level: definition.recommendedLevel as SkillLevel,
            proofStatus: 'claimed' as SkillEvidenceStatus,
            evidence: [],
            createdAt: new Date().toISOString(),
            artifacts: [],
            interest: 'medium',
            availableFte: 0
          }
        ];
      const nextCompetencies = updateCompetenciesFromSkills(
        nextSkills,
        draft.competencies,
        draft.competencyRecords ?? []
      );
      onChange({
        ...draft,
        skills: nextSkills,
        competencies: nextCompetencies.names,
        competencyRecords: nextCompetencies.records
      });
      return;
    }
    const nextSkills = draft.skills.filter((entry) => entry.id !== definition.id);
    const nextCompetencies = updateCompetenciesFromSkills(
      nextSkills,
      draft.competencies,
      draft.competencyRecords ?? []
    );
    onChange({
      ...draft,
      skills: nextSkills,
      competencies: nextCompetencies.names,
      competencyRecords: nextCompetencies.records
    });
  };

  const handleHardSkillLevelChange = (skillId: string, level: SkillLevel) => {
    const nextSkills = draft.skills.map((skill) =>
      skill.id === skillId
        ? {
          ...skill,
          level
        }
        : skill
    );
    const nextCompetencies = updateCompetenciesFromSkills(
      nextSkills,
      draft.competencies,
      draft.competencyRecords ?? []
    );
    onChange({
      ...draft,
      skills: nextSkills,
      competencies: nextCompetencies.names,
      competencyRecords: nextCompetencies.records
    });
  };

  const handleHardSkillEvidenceChange = (skillId: string, status: SkillEvidenceStatus) => {
    const nextSkills = draft.skills.map((skill) =>
      skill.id === skillId
        ? {
          ...skill,
          proofStatus: status
        }
        : skill
    );
    const nextCompetencies = updateCompetenciesFromSkills(
      nextSkills,
      draft.competencies,
      draft.competencyRecords ?? []
    );
    onChange({
      ...draft,
      skills: nextSkills,
      competencies: nextCompetencies.names,
      competencyRecords: nextCompetencies.records
    });
  };

  const handleSoftSkillToggle = (skillName: string, enabled: boolean) => {
    const current = new Set(draft.softSkills ?? []);
    if (enabled) {
      current.add(skillName);
    } else {
      current.delete(skillName);
    }
    onChange({ ...draft, softSkills: mergeStringCollections([], Array.from(current)) });
  };

  const handleGenerateDevelopmentPlan = useCallback(() => {
    if (!expertId) {
      setPlanError('Сохраните профиль, чтобы сформировать план развития и привязать задачи.');
      setPlanStatus(null);
      return;
    }

    if (hardSkillGaps.length === 0) {
      setPlanError('Все hard skills уже соответствуют эталону роли.');
      setPlanStatus(null);
      return;
    }

    const prefix = `devplan-${expertId}-`;
    const today = startOfDay(new Date());
    let previousTaskId: string | null = null;

    const planTasks: TaskListItem[] = hardSkillGaps.map((gap, index) => {
      const id = `${prefix}${gap.definition.id}`;
      const durationDays = gap.isTheoretical ? 7 : 14;
      const relation = gap.suggestedInitiative
        ? ({ type: 'initiative', targetId: gap.suggestedInitiative.id } as const)
        : ({ type: 'methodology' } as const);

      const description = gap.isTheoretical
        ? `Обучение навыку «${gap.definition.name}»: теория и закрепление базовых подходов.`
        : gap.suggestedInitiative
          ? `Практика навыка «${gap.definition.name}» через инициативу «${gap.suggestedInitiative.name}».`
          : `Подберите инициативу с запросом на «${gap.definition.name}» для практической отработки.`;

      const schedule =
        previousTaskId === null
          ? ({
            type: 'start-duration',
            startDate: formatIsoDate(addDays(today, index * 2)),
            durationDays
          } as const)
          : ({ type: 'after-task', predecessorId: previousTaskId, durationDays } as const);

      previousTaskId = id;

      return {
        id,
        name: `Развитие: ${gap.definition.name}`,
        priority: 'medium',
        status: 'new',
        assigneeId: expertId,
        description,
        schedule,
        relation
      } satisfies TaskListItem;
    });

    const filteredTasks = tasks.filter((task) => !task.id.startsWith(prefix));
    onUpdateTasks([...filteredTasks, ...planTasks]);
    setPlanStatus(`План развития обновлён: добавлено ${planTasks.length} задач(и).`);
    setPlanError(null);
  }, [expertId, hardSkillGaps, onUpdateTasks, tasks]);

  useEffect(() => {
    if (!hardSkillDefinitions.length) {
      return;
    }
    const recalculated = updateCompetenciesFromSkills(
      draft.skills,
      draft.competencies,
      draft.competencyRecords ?? []
    );
    if (
      !areArraysEqual(recalculated.names, draft.competencies) ||
      !areCompetencyRecordsEqual(recalculated.records, draft.competencyRecords ?? [])
    ) {
      onChange({
        ...draft,
        competencies: recalculated.names,
        competencyRecords: recalculated.records
      });
    }
  }, [draft, hardSkillDefinitions.length, onChange, updateCompetenciesFromSkills]);

  useEffect(() => {
    setPlanError(null);
    setPlanStatus(null);
  }, [expertId]);

  return (
    <div className={styles.formBody}>
      <div className={styles.importToolbar}>
        <Button
          size="s"
          view="ghost"
          label="Импорт из Excel"
          disabled={isImporting}
          onClick={handleImportClick}
        />
        <Button size="s" view="ghost" label="Экспорт в Excel" onClick={handleExpertExport} />
        <Text size="xs" view="secondary" className={styles.importHint}>
          Используйте Excel-шаблон для обмена профилями сотрудников.
        </Text>
      </div>
      {importError && (
        <Text size="xs" view="alert" className={styles.importError}>
          {importError}
        </Text>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={handleFileChange}
      />

      <div className={styles.formHeader}>
        <div>
          <Text size="l" weight="semibold" className={styles.formTitle}>
            {mode === 'create' ? 'Создание сотрудника' : 'Редактирование сотрудника'}
          </Text>
          <Text size="xs" view="secondary" className={styles.formSubtitle}>
            Заполните профиль эксперта, укажите ключевые навыки и области экспертизы.
          </Text>
        </div>
        {onDelete && <Button size="s" view="clear" label="Удалить профиль" onClick={onDelete} />}
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Фамилия
          </Text>
          <TextField
            size="s"
            value={lastName}
            onChange={(value) =>
              handleDraftChange('fullName', composeFullName({
                lastName: value ?? '',
                firstName,
                middleName
              }))
            }
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Имя
          </Text>
          <TextField
            size="s"
            value={firstName}
            onChange={(value) =>
              handleDraftChange('fullName', composeFullName({
                lastName,
                firstName: value ?? '',
                middleName
              }))
            }
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Отчество (при наличии)
          </Text>
          <TextField
            size="s"
            value={middleName}
            onChange={(value) =>
              handleDraftChange('fullName', composeFullName({
                lastName,
                firstName,
                middleName: value ?? ''
              }))
            }
          />
        </label>
      </div>

      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Роль / должность
        </Text>
        <Select<SelectItem<string>>
          size="s"
          items={roleItems}
          value={roleItems.find((item) => item.value === draft.title) ?? null}
          getItemLabel={(item) => item.label}
          getItemKey={(item) => item.value}
          onChange={(item) => item && handleDraftChange('title', item.value)}
        />
      </label>

      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Краткое описание
        </Text>
        <textarea
          className={styles.textarea}
          value={draft.summary}
          onChange={(event) => handleDraftChange('summary', event.target.value)}
        />
      </label>

      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Доменные области
          </Text>
          <Combobox<string>
            size="s"
            items={domainItems}
            value={draft.domains}
            multiple
            getItemKey={(item) => item}
            getItemLabel={(item) => domainLabelMap[item] ?? item}
            placeholder="Выберите домены"
            onChange={(value) => handleDraftChange('domains', value ?? [])}
          />
        </label>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Опыт (лет)
          </Text>
          <input
            type="number"
            min={0}
            className={styles.numberInput}
            value={draft.experienceYears}
            onChange={handleExperienceChange}
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Локация
          </Text>
          <Combobox<string>
            size="s"
            items={locationItems}
            value={
              locationCreation
                ? CREATE_LOCATION_OPTION
                : draft.location.trim() || null
            }
            getItemKey={(item) => item}
            getItemLabel={(item) =>
              item === CREATE_LOCATION_OPTION ? 'Добавить локацию…' : item || '—'
            }
            placeholder="Выберите локацию"
            onChange={(value) => {
              if (!value) {
                setLocationCreation(null);
                handleDraftChange('location', '');
                return;
              }
              if (value === CREATE_LOCATION_OPTION) {
                setLocationCreation({ value: '', previous: draft.location });
                return;
              }
              setLocationCreation(null);
              onRegisterLocation(value);
              handleDraftChange('location', value);
            }}
          />
          {locationCreation && (
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                value={locationCreation.value}
                onChange={(event) =>
                  setLocationCreation({ ...locationCreation, value: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const next = locationCreation.value.trim();
                    if (!next) {
                      return;
                    }
                    onRegisterLocation(next);
                    handleDraftChange('location', next);
                    setLocationCreation(null);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    handleDraftChange('location', locationCreation.previous);
                    setLocationCreation(null);
                  }
                }}
                placeholder="Введите новую локацию"
              />
              <div className={styles.inlineButtons}>
                <Button
                  size="xs"
                  label="Сохранить"
                  view="primary"
                  onClick={() => {
                    const next = locationCreation.value.trim();
                    if (!next) {
                      return;
                    }
                    onRegisterLocation(next);
                    handleDraftChange('location', next);
                    setLocationCreation(null);
                  }}
                />
                <Button
                  size="xs"
                  label="Отмена"
                  view="ghost"
                  onClick={() => {
                    handleDraftChange('location', locationCreation.previous);
                    setLocationCreation(null);
                  }}
                />
              </div>
            </div>
          )}
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Контакты
          </Text>
          <TextField
            size="s"
            value={draft.contact}
            onChange={(value) => handleDraftChange('contact', value ?? '')}
          />
        </label>
      </div>

      <div className={styles.skillMatrix}>
        <div className={`${styles.skillMatrixHeader} ${styles.skillMatrixHeaderWide}`}>
          <Text size="xs" weight="semibold" className={styles.skillMatrixTitle}>
            Hard skills
          </Text>
          <Text size="xs" view="secondary" className={styles.skillMatrixHint}>
            Уровень владения
          </Text>
          <Text size="xs" view="secondary" className={styles.skillMatrixHint}>
            Подтверждение
          </Text>
        </div>
        {selectedRole ? (
          hardSkillDefinitions.length > 0 ? (
            hardSkillDefinitions.map((definition) => {
              const skill = draft.skills.find((entry) => entry.id === definition.id);
              const isActive = Boolean(skill);
              return (
                <div
                  key={definition.id}
                  className={`${styles.skillMatrixRow} ${styles.skillMatrixRowWide}`}
                >
                  <div className={styles.skillMatrixInfo}>
                    <Switch
                      size="s"
                      checked={isActive}
                      label={definition.name}
                      onChange={({ target }) =>
                        handleHardSkillToggle(definition, target.checked)
                      }
                    />
                    <Text size="xs" view="secondary" className={styles.skillMatrixDescription}>
                      {definition.description}
                    </Text>
                  </div>
                  <div className={styles.skillMatrixControl}>
                    <Select<SelectItem<SkillLevel>>
                      size="s"
                      disabled={!isActive}
                      items={hardSkillLevelItems}
                      value={
                        isActive && skill
                          ? hardSkillLevelItems.find((item) => item.value === skill.level) ?? null
                          : null
                      }
                      getItemLabel={(item) => item.label}
                      getItemKey={(item) => item.value}
                      onChange={(item) =>
                        item && handleHardSkillLevelChange(definition.id, item.value)
                      }
                    />
                  </div>
                  <div className={styles.skillMatrixControl}>
                    <Select<SelectItem<SkillEvidenceStatus>>
                      size="s"
                      disabled={!isActive}
                      items={hardSkillEvidenceItems}
                      value={
                        isActive && skill
                          ?
                          hardSkillEvidenceItems.find(
                            (item) => item.value === skill.proofStatus
                          ) ?? null
                          : null
                      }
                      getItemLabel={(item) => item.label}
                      getItemKey={(item) => item.value}
                      onChange={(item) =>
                        item && handleHardSkillEvidenceChange(definition.id, item.value)
                      }
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <Text size="xs" view="secondary" className={styles.skillMatrixEmpty}>
              Для выбранной роли нет преднастроенных hard skills.
            </Text>
          )
        ) : (
          <Text size="xs" view="secondary" className={styles.skillMatrixEmpty}>
            Выберите роль, чтобы настроить hard skills.
          </Text>
        )}
      </div>

      <div className={styles.developmentPanel}>
        <div className={styles.developmentHeader}>
          <div>
            <Text size="xs" weight="semibold" className={styles.skillMatrixTitle}>
              Сопоставление с эталонной версией роли
            </Text>
            <Text size="xs" view="secondary" className={styles.skillMatrixHint}>
              Эталон: все hard skills на уровне {skillLevelLabelMap.get(TARGET_SKILL_LEVEL) ?? TARGET_SKILL_LEVEL}.
            </Text>
          </div>
          <Button
            size="s"
            view="primary"
            disabled={!hardSkillGaps.length || !expertId}
            label="Сформировать план развития"
            onClick={handleGenerateDevelopmentPlan}
          />
        </div>
        {planError && (
          <Text size="xs" view="alert" className={styles.planHint}>
            {planError}
          </Text>
        )}
        {planStatus && (
          <Text size="xs" view="success" className={styles.planHint}>
            {planStatus}
          </Text>
        )}
        {hardSkillGaps.length > 0 ? (
          <div className={styles.gapList}>
            {hardSkillGaps.map((gap) => (
              <div key={gap.definition.id} className={styles.gapRow}>
                <div className={styles.gapTitle}>
                  <Text size="s" weight="semibold">
                    {gap.definition.name}
                  </Text>
                  <Text size="xs" view="secondary">
                    {gap.currentLevel
                      ? `${skillLevelLabelMap.get(gap.currentLevel) ?? gap.currentLevel} → ${skillLevelLabelMap.get(gap.targetLevel) ?? gap.targetLevel}`
                      : `Нет оценки → ${skillLevelLabelMap.get(gap.targetLevel) ?? gap.targetLevel}`}
                  </Text>
                </div>
                <Text size="xs" view="secondary" className={styles.skillMatrixDescription}>
                  {gap.definition.description}
                </Text>
                <div className={styles.gapMeta}>
                  <Text size="xs" view="secondary">
                    Требуется: {skillLevelLabelMap.get(gap.targetLevel) ?? gap.targetLevel}
                  </Text>
                  <Text size="xs" view="secondary">
                    Роль ожидает: {skillLevelLabelMap.get(gap.definition.recommendedLevel) ?? gap.definition.recommendedLevel}
                  </Text>
                  <Text size="xs" view="secondary">
                    Формат: {gap.isTheoretical ? 'теория' : 'практика'}
                  </Text>
                </div>
                {gap.suggestedInitiative ? (
                  <Text size="xs" className={styles.gapLink}>
                    Рекомендованный проект: «{gap.suggestedInitiative.name}»
                  </Text>
                ) : (
                  <Text size="xs" view="ghost" className={styles.gapLink}>
                    Подберите инициативу с запросом на этот навык.
                  </Text>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Text size="xs" view="success" className={styles.skillMatrixEmpty}>
            Профиль соответствует эталонной версии роли по hard skills.
          </Text>
        )}
        <Text size="xs" view="secondary" className={styles.planHint}>
          Задачи плана развития появятся в разделе «Задачи моих сотрудников», где можно скорректировать сроки и последовательность.
        </Text>
      </div>

      <div className={styles.skillMatrix}>
        <div className={styles.skillMatrixHeader}>
          <Text size="xs" weight="semibold" className={styles.skillMatrixTitle}>
            Soft skills
          </Text>
        </div>
        {selectedRole ? (
          softSkillDefinitions.length > 0 ? (
            softSkillDefinitions.map((definition) => {
              const isActive = draft.softSkills?.includes(definition.name) ?? false;
              return (
                <div key={definition.id} className={styles.skillMatrixRow}>
                  <div className={styles.skillMatrixInfo}>
                    <Switch
                      size="s"
                      checked={isActive}
                      label={definition.name}
                      onChange={({ target }) =>
                        handleSoftSkillToggle(definition.name, target.checked)
                      }
                    />
                    <Text size="xs" view="secondary" className={styles.skillMatrixDescription}>
                      {definition.description}
                    </Text>
                  </div>
                </div>
              );
            })
          ) : (
            <Text size="xs" view="secondary" className={styles.skillMatrixEmpty}>
              Для выбранной роли нет преднастроенных soft skills.
            </Text>
          )
        ) : (
          <Text size="xs" view="secondary" className={styles.skillMatrixEmpty}>
            Выберите роль, чтобы настроить soft skills.
          </Text>
        )}
      </div>

      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Фокусы и задачи
        </Text>
        <textarea
          className={styles.textarea}
          value={formatList(draft.focusAreas)}
          placeholder="По одному направлению на строку"
          onChange={(event) => handleDraftChange('focusAreas', parseList(event.target.value))}
        />
      </label>

      <label className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Языки
        </Text>
        <Combobox<string>
          size="s"
          items={languageItems}
          value={draft.languages}
          multiple
          getItemKey={(item) => item}
          getItemLabel={(item) =>
            item === CREATE_LANGUAGE_OPTION ? 'Добавить язык…' : item
          }
          placeholder="Выберите языки"
          onChange={(value) => {
            const next = value ?? [];
            if (next.includes(CREATE_LANGUAGE_OPTION)) {
              setLanguageCreation({ value: '', previous: draft.languages });
              return;
            }
            handleDraftChange('languages', next);
          }}
        />
        {languageCreation && (
          <div className={styles.inlineForm}>
            <input
              className={styles.input}
              value={languageCreation.value}
              onChange={(event) =>
                setLanguageCreation({ ...languageCreation, value: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const next = languageCreation.value.trim();
                  if (!next) {
                    return;
                  }
                  onRegisterLanguage(next);
                  handleDraftChange('languages', mergeStringCollections(draft.languages, [next]));
                  setLanguageCreation(null);
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleDraftChange('languages', languageCreation.previous);
                  setLanguageCreation(null);
                }
              }}
              placeholder="Введите новый язык"
            />
            <div className={styles.inlineButtons}>
              <Button
                size="xs"
                label="Сохранить"
                view="primary"
                onClick={() => {
                  const next = languageCreation.value.trim();
                  if (!next) {
                    return;
                  }
                  onRegisterLanguage(next);
                  handleDraftChange('languages', mergeStringCollections(draft.languages, [next]));
                  setLanguageCreation(null);
                }}
              />
              <Button
                size="xs"
                label="Отмена"
                view="ghost"
                onClick={() => {
                  handleDraftChange('languages', languageCreation.previous);
                  setLanguageCreation(null);
                }}
              />
            </div>
          </div>
        )}
      </label>

      <div className={styles.field}>
        <Text size="xs" weight="semibold" className={styles.label}>
          Значимые проекты
        </Text>
        {draft.modules.length > 0 ? (
          <ul className={styles.projectList}>
            {draft.modules.map((moduleId) => (
              <li key={moduleId}>{moduleLabelMap[moduleId] ?? moduleId}</li>
            ))}
          </ul>
        ) : (
          <Text size="xs" view="secondary">
            Проекты появятся после назначения на модули.
          </Text>
        )}
      </div>

      <div className={styles.submitRow}>
        <Text size="xs" view="secondary" className={styles.hint}>
          Всего навыков: {draft.skills.length}. Детальное управление подтверждениями доступно в разделе «Экспертиза».
        </Text>
        <div className={styles.submitButtons}>
          {onDelete && <Button size="s" view="ghost" label="Удалить" onClick={onDelete} />}
          <Button
            size="s"
            view="primary"
            label={mode === 'create' ? 'Создать профиль' : 'Сохранить профиль'}
            disabled={!lastName.trim() || !firstName.trim()}
            onClick={onSubmit}
          />
        </div>
      </div>

      <Modal isOpen={isImportModalOpen && Boolean(importState)} hasOverlay onClose={handleImportClose}>
        {importState && (
          <div className={styles.importModal}>
            <Button
              size="s"
              view="clear"
              iconLeft={IconClose}
              onlyIcon
              label="Закрыть"
              onClick={handleImportClose}
              className={styles.modalCloseButton}
            />
            <Text size="l" weight="semibold">
              Импорт профиля сотрудника
            </Text>
            <div className={styles.importSummary}>
              <div>
                <Text size="xs" view="secondary">
                  Файл
                </Text>
                <Text size="s">{importState.fileName}</Text>
              </div>
              <div>
                <Text size="xs" view="secondary">
                  Имя сотрудника
                </Text>
                <Text size="s">{importState.draft.fullName || 'Не указано'}</Text>
              </div>
              <div>
                <Text size="xs" view="secondary">
                  Количество навыков
                </Text>
                <Text size="s">{importState.draft.skills.length}</Text>
              </div>
              <div>
                <Text size="xs" view="secondary">
                  Домены
                </Text>
                <Text size="s">{importState.draft.domains.length}</Text>
              </div>
            </div>
            {importState.result.requestedExpertId && (
              <Text size="xs" view="secondary">
                Идентификатор из файла: {importState.result.requestedExpertId}
              </Text>
            )}
            {importState.result.errors.length > 0 && (
              <div className={styles.importIssues}>
                <Text size="s" weight="semibold" view="alert">
                  Обнаружены ошибки
                </Text>
                <ul className={styles.importWarningList}>
                  {importState.result.errors.map((message, index) => (
                    <li key={`import-error-${index}`}>
                      <Text size="s" view="alert">
                        {message}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {importState.result.warnings.length > 0 && (
              <div className={styles.importIssues}>
                <Text size="s" weight="semibold" view="warning">
                  Предупреждения
                </Text>
                <ul className={styles.importWarningList}>
                  {importState.result.warnings.map((message, index) => (
                    <li key={`import-warning-${index}`}>
                      <Text size="s" view="warning">
                        {message}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {importState.pendingDomains.length > 0 && (
              <div className={styles.importIssues}>
                <Text size="s" weight="semibold">Неизвестные домены</Text>
                <Text size="xs" view="secondary">
                  Эти доменные области отсутствуют в базе. Сопоставьте их с существующими
                  или пропустите.
                </Text>
                <div className={styles.listStack}>
                  {importState.pendingDomains.map((entry, index) => (
                    <div
                      key={`${entry.source}-${entry.requestedValue}-${index}`}
                      className={styles.importSkillCard}
                    >
                      <Text size="s" weight="semibold">{entry.requestedValue}</Text>
                      <Text size="xs" view="secondary">
                        {entry.source === 'id'
                          ? 'Указан идентификатор, отсутствующий в базе.'
                          : 'Указанное название отсутствует в базе.'}
                      </Text>
                      <Combobox<SelectItem<string>>
                        size="s"
                        placeholder="Выберите существующую доменную область"
                        items={domainOptions}
                        value={null}
                        getItemLabel={(item) => item.label}
                        getItemKey={(item) => item.value}
                        onChange={(item) =>
                          item ? handleResolveMissingDomain(entry, item.value) : undefined
                        }
                      />
                      <div className={styles.importSkillActions}>
                        <Button
                          size="xs"
                          view="ghost"
                          label="Пропустить"
                          onClick={() => handleSkipMissingDomain(entry)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!isImportRoleKnown && (
              <div className={styles.importIssues}>
                <Text size="s" weight="semibold">
                  Новая роль
                </Text>
                <Text size="xs" view="secondary" className={styles.importRoleHint}>
                  Роль «{importState.draft.title || 'не указана'}» отсутствует в текущем списке.
                  Выберите существующую роль или укажите новое название — оно добавится в систему.
                </Text>
                <div className={styles.importRoleFields}>
                  <Select<SelectItem<string>>
                    size="s"
                    placeholder="Выберите из существующих"
                    items={existingRoleItems}
                    value={importRoleSelection}
                    getItemLabel={(item) => item.label}
                    getItemKey={(item) => item.value}
                    onChange={(item) => handleImportRoleSelect(item)}
                  />
                  <TextField
                    size="s"
                    value={importState.draft.title}
                    onChange={(value) => handleImportRoleInput(value)}
                    placeholder="Или добавьте новую роль"
                  />
                </div>
              </div>
            )}
            {importState.pendingSkills.length > 0 && (
              <div className={styles.importIssues}>
                <Text size="s" weight="semibold">
                  Новые hard skills
                </Text>
                <Text size="xs" view="secondary">
                  Эти навыки отсутствуют в базе. Добавьте их или исключите из импорта.
                </Text>
                {importState.pendingSkills.map((entry) => (
                  <div key={entry.requestedId} className={styles.importSkillCard}>
                    <Text size="s" weight="semibold">
                      {entry.definition.name}
                    </Text>
                    <Text size="xs" view="secondary">
                      Категория: {entry.definition.category}, рекомендуемый уровень: {entry.definition.recommendedLevel}
                    </Text>
                    {entry.definition.description && (
                      <Text size="xs" view="secondary">{entry.definition.description}</Text>
                    )}
                    <Text size="xs" view="secondary">
                      Источники:{' '}
                      {entry.definition.sources.length > 0
                        ? entry.definition.sources.join(', ')
                        : 'не указаны'}
                    </Text>
                    <Text size="xs" view="secondary">
                      Роли:{' '}
                      {entry.definition.roles.length > 0
                        ? entry.definition.roles.join(', ')
                        : 'не указаны'}
                    </Text>
                    <Text size="xs" view="secondary">Строка в файле: {entry.rowNumber}</Text>
                    <div className={styles.importSkillActions}>
                      <Button
                        size="xs"
                        view="primary"
                        label="Добавить в базу"
                        onClick={() => handleRegisterMissingSkill(entry)}
                      />
                      <Button
                        size="xs"
                        view="ghost"
                        label="Не импортировать"
                        onClick={() => handleSkipMissingSkill(entry)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {importState.pendingCompetencies.length > 0 && (
              <div className={styles.importIssues}>
                <Text size="s" weight="semibold">
                  Новые компетенции
                </Text>
                <Text size="xs" view="secondary">
                  Эти компетенции отсутствуют в базе для указанной роли. Добавьте их или исключите из импорта.
                </Text>
                {importState.pendingCompetencies.map((entry, index) => (
                  <div
                    key={`${entry.competencyName}-${entry.roleTitle}-${entry.rowNumber}-${index}`}
                    className={styles.importSkillCard}
                  >
                    <Text size="s" weight="semibold">
                      {entry.competencyName}
                    </Text>
                    <Text size="xs" view="secondary">
                      Роль: {entry.roleTitle || 'не указана'}
                    </Text>
                    {entry.levelLabel && (
                      <Text size="xs" view="secondary">
                        Уровень: {entry.levelLabel}
                      </Text>
                    )}
                    {entry.proofLabel && (
                      <Text size="xs" view="secondary">
                        Подтверждение: {entry.proofLabel}
                      </Text>
                    )}
                    <Text size="xs" view="secondary">Строка в файле: {entry.rowNumber}</Text>
                    <div className={styles.importSkillActions}>
                      <Button
                        size="xs"
                        view="primary"
                        label="Добавить в базу"
                        onClick={() => handleRegisterMissingCompetency(entry)}
                      />
                      <Button
                        size="xs"
                        view="ghost"
                        label="Не импортировать"
                        onClick={() => handleSkipMissingCompetency(entry)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.submitButtons}>
              <Button size="s" view="ghost" label="Отмена" onClick={handleImportClose} />
              <Button
                size="s"
                view="primary"
                label="Импортировать"
                disabled={
                  importState.result.errors.length > 0 ||
                  importState.pendingSkills.length > 0 ||
                  importState.pendingCompetencies.length > 0 ||
                  importState.pendingDomains.length > 0
                }
                onClick={handleImportApply}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

function cloneExpertDraft(draft: ExpertDraftPayload): ExpertDraftPayload {
  return {
    ...draft,
    domains: [...draft.domains],
    modules: [...draft.modules],
    competencies: [...draft.competencies],
    competencyRecords: (draft.competencyRecords ?? []).map((record) => ({ ...record })),
    consultingSkills: [...draft.consultingSkills],
    softSkills: [...draft.softSkills],
    focusAreas: [...draft.focusAreas],
    languages: [...draft.languages],
    notableProjects: [...draft.notableProjects],
    skills: draft.skills.map((skill) => ({
      ...skill,
      artifacts: [...skill.artifacts],
      evidence: (skill.evidence ?? []).map((entry) => ({
        ...entry,
        artifactIds: entry.artifactIds ? [...entry.artifactIds] : undefined
      })),
      usage: skill.usage ? { ...skill.usage } : undefined
    }))
  };
}

function createDefaultExpertDraft(): ExpertDraftPayload {
  return {
    fullName: '',
    title: '',
    summary: '',
    domains: [],
    modules: [],
    competencies: [],
    competencyRecords: [],
    consultingSkills: [],
    softSkills: [],
    focusAreas: [],
    experienceYears: 0,
    location: '',
    contact: '',
    languages: [],
    notableProjects: [],
    availability: 'available',
    availabilityComment: '',
    skills: []
  };
}

function expertToDraft(expert: ExpertProfile): ExpertDraftPayload {
  return {
    fullName: expert.fullName,
    title: expert.title,
    summary: expert.summary,
    domains: [...expert.domains],
    modules: [...expert.modules],
    competencies: [...expert.competencies],
    competencyRecords: (expert.competencyRecords ?? []).map((record) => ({ ...record })),
    consultingSkills: [...expert.consultingSkills],
    softSkills: Array.isArray(expert.softSkills) ? [...expert.softSkills] : [],
    focusAreas: [...expert.focusAreas],
    experienceYears: expert.experienceYears,
    location: expert.location,
    contact: expert.contact,
    languages: [...expert.languages],
    notableProjects: [...expert.notableProjects],
    availability: expert.availability,
    availabilityComment: expert.availabilityComment,
    skills: expert.skills.map((skill) => ({
      ...skill,
      artifacts: [...skill.artifacts],
      usage: skill.usage ? { ...skill.usage } : undefined
    }))
  };
}

function createDefaultModuleDraft(): ModuleDraftPayload {
  return {
    name: '',
    description: '',
    productName: '',
    creatorCompany: '',
    status: 'in-dev',
    domainIds: [],
    dependencyIds: [],
    dataIn: [{ id: 'input-1', label: '', sourceId: undefined }],
    dataOut: [{ id: 'output-1', label: '', artifactId: undefined }],
    ridOwner: { company: '', division: '' },
    localization: 'ru',
    userStats: { companies: [{ name: '', licenses: 0 }] },
    technologyStack: [],
    projectTeam: [{ id: 'member-1', fullName: '', role: 'Аналитик' }],
    repository: '',
    api: '',
    specificationUrl: '',
    apiContractsUrl: '',
    techDesignUrl: '',
    architectureDiagramUrl: '',
    licenseServerIntegrated: false,
    libraries: [],
    clientType: 'web',
    deploymentTool: 'docker',
    reuseScore: 0,
    metrics: { coverage: 0, tests: 0, automationRate: 0 },
    formula: '',
    nonFunctional: {
      responseTimeMs: 0,
      throughputRps: 0,
      resourceConsumption: '',
      baselineUsers: 0
    }
  };
}

function createDefaultDomainDraft(): DomainDraftPayload {
  return {
    name: '',
    description: '',
    parentId: undefined,
    moduleIds: [],
    isCatalogRoot: false,
    experts: [],
    meetupLink: ''
  };
}

function createDefaultArtifactDraft(): ArtifactDraftPayload {
  return {
    name: '',
    description: '',
    domainId: undefined,
    producedBy: undefined,
    consumerIds: [],
    dataType: '',
    sampleUrl: ''
  };
}

function moduleToDraft(module: ModuleNode): ModuleDraftPayload {
  return {
    name: module.name,
    description: module.description,
    productName: module.productName,
    creatorCompany: module.creatorCompany,
    status: module.status,
    domainIds: [...module.domains],
    dependencyIds: [...module.dependencies],
    dataIn: module.dataIn.map((input) => ({ ...input })),
    dataOut: module.dataOut.map((output) => ({ ...output })),
    ridOwner: { ...module.ridOwner },
    localization: module.localization,
    userStats: {
      companies: module.userStats.companies.map((company) => ({ ...company }))
    },
    technologyStack: [...module.technologyStack],
    projectTeam: module.projectTeam.map((member) => ({ ...member })),
    repository: module.repository ?? '',
    api: module.api ?? '',
    specificationUrl: module.specificationUrl,
    apiContractsUrl: module.apiContractsUrl,
    techDesignUrl: module.techDesignUrl,
    architectureDiagramUrl: module.architectureDiagramUrl,
    licenseServerIntegrated: module.licenseServerIntegrated,
    libraries: module.libraries.map((library) => ({ ...library })),
    clientType: module.clientType,
    deploymentTool: module.deploymentTool,
    reuseScore: module.reuseScore,
    metrics: { ...module.metrics },
    formula: module.formula,
    nonFunctional: { ...module.nonFunctional }
  };
}

function applyModuleDraftPrefill(
  base: ModuleDraftPayload,
  patch: Partial<ModuleDraftPayload>
): ModuleDraftPayload {
  let next = base;
  let hasChanges = false;

  const ensureCopy = () => {
    if (!hasChanges) {
      next = { ...next };
      hasChanges = true;
    }
  };

  if (patch.name !== undefined) {
    ensureCopy();
    next.name = patch.name;
  }

  if (patch.productName !== undefined) {
    ensureCopy();
    next.productName = patch.productName;
  }

  if (Array.isArray(patch.domainIds)) {
    ensureCopy();
    next.domainIds = [...patch.domainIds];
  }


  if (Array.isArray(patch.projectTeam)) {
    ensureCopy();
    next.projectTeam = patch.projectTeam.map((member, index) => ({
      id: member.id || `member-${index + 1}`,
      fullName: member.fullName,
      role: member.role
    }));
  }

  return next;
}

function domainToDraft(
  domain: DomainNode,
  tree: DomainNode[],
  modules: ModuleNode[]
): DomainDraftPayload {
  const parentId = findDomainParentId(tree, domain.id);
  const relatedModules = modules
    .filter((module) => module.domains.includes(domain.id))
    .map((module) => module.id);
  const isLeaf = (!domain.children || domain.children.length === 0) && !domain.isCatalogRoot;

  return {
    name: domain.name,
    description: domain.description ?? '',
    parentId: parentId ?? undefined,
    moduleIds: isLeaf ? relatedModules : [],
    isCatalogRoot: Boolean(domain.isCatalogRoot),
    experts: [...(domain.experts ?? [])],
    meetupLink: domain.meetupLink ?? ''
  };
}

function artifactToDraft(artifact: ArtifactNode): ArtifactDraftPayload {
  return {
    name: artifact.name,
    description: artifact.description,
    domainId: artifact.domainId,
    producedBy: artifact.producedBy,
    consumerIds: [...artifact.consumerIds],
    dataType: artifact.dataType,
    sampleUrl: artifact.sampleUrl
  };
}

function buildDomainLabelMap(domains: DomainNode[]): Record<string, string> {
  const map: Record<string, string> = {};

  const visit = (nodes: DomainNode[], depth: number) => {
    nodes.forEach((node) => {
      const prefix = depth > 0 ? `${'— '.repeat(depth)}` : '';
      map[node.id] = `${prefix}${node.name}`.trim();
      if (node.children) {
        visit(node.children, depth + 1);
      }
    });
  };

  visit(domains, 0);
  return map;
}

function collectLeafDomainIds(domains: DomainNode[]): string[] {
  return flattenDomainTree(domains)
    .filter((domain) => (!domain.children || domain.children.length === 0) && !domain.isCatalogRoot)
    .map((domain) => domain.id);
}

function collectCatalogDomainIds(domains: DomainNode[]): string[] {
  return flattenDomainTree(domains)
    .filter((domain) => domain.isCatalogRoot)
    .map((domain) => domain.id);
}

function buildModuleLabelMap(modules: ModuleNode[]): Record<string, string> {
  return modules.reduce<Record<string, string>>((acc, module) => {
    acc[module.id] = module.name;
    return acc;
  }, {});
}

function buildArtifactLabelMap(artifacts: ArtifactNode[]): Record<string, string> {
  return artifacts.reduce<Record<string, string>>((acc, artifact) => {
    acc[artifact.id] = artifact.name;
    return acc;
  }, {});
}

function flattenDomainTree(domains: DomainNode[]): DomainNode[] {
  return domains.flatMap((domain) => [domain, ...(domain.children ? flattenDomainTree(domain.children) : [])]);
}

function buildDomainDescendantMap(domains: DomainNode[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  const visit = (node: DomainNode): string[] => {
    const descendants = (node.children ?? []).flatMap((child) => [child.id, ...visit(child)]);
    map[node.id] = descendants;
    return descendants;
  };

  domains.forEach((domain) => {
    visit(domain);
  });

  return map;
}

function findDomainById(domains: DomainNode[], id: string): DomainNode | null {
  for (const domain of domains) {
    if (domain.id === id) {
      return domain;
    }
    if (domain.children) {
      const found = findDomainById(domain.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findDomainParentId(domains: DomainNode[], id: string, parentId: string | null = null): string | null {
  for (const domain of domains) {
    if (domain.id === id) {
      return parentId;
    }
    if (domain.children) {
      const found = findDomainParentId(domain.children, id, domain.id);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

export default AdminPanel;

type FullNameParts = {
  lastName: string;
  firstName: string;
  middleName: string;
};

function parseFullName(fullName: string): FullNameParts {
  const parts = fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const [lastName = '', firstName = '', ...rest] = parts;
  return {
    lastName,
    firstName,
    middleName: rest.join(' ')
  };
}

function composeFullName(parts: FullNameParts): string {
  return [parts.lastName, parts.firstName, parts.middleName]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(' ');
}

function mergeStringCollections(current: string[], incoming: string[]): string[] {
  const values = new Set<string>();

  const append = (items: string[]) => {
    items.forEach((item) => {
      const normalized = item.trim();
      if (normalized) {
        values.add(normalized);
      }
    });
  };

  append(current);
  append(incoming);

  return Array.from(values).sort((a, b) => a.localeCompare(b, 'ru'));
}

function mergeRegistry(
  current: Record<string, string[]>,
  incoming: Record<string, string[]>
): Record<string, string[]> {
  const registry = new Map<string, Set<string>>();

  const append = (source: Record<string, string[]>) => {
    Object.entries(source).forEach(([rawKey, values]) => {
      const key = rawKey.trim();
      if (!key) {
        return;
      }

      const target = registry.get(key) ?? new Set<string>();
      values.forEach((value) => {
        const normalized = value.trim();
        if (normalized) {
          target.add(normalized);
        }
      });
      registry.set(key, target);
    });
  };

  append(current);
  append(incoming);

  return Array.from(registry.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
    .reduce<Record<string, string[]>>((acc, [company, divisions]) => {
      acc[company] = Array.from(divisions).sort((a, b) => a.localeCompare(b, 'ru'));
      return acc;
    }, {});
}

function buildLocationList(experts: ExpertProfile[]): string[] {
  const values = new Set<string>();
  experts.forEach((expert) => {
    const location = expert.location.trim();
    if (location) {
      values.add(location);
    }
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildLanguageList(experts: ExpertProfile[]): string[] {
  const values = new Set<string>();
  experts.forEach((expert) => {
    (expert.languages ?? []).forEach((language) => {
      const normalized = language.trim();
      if (normalized) {
        values.add(normalized);
      }
    });
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildProductNames(modules: ModuleNode[]): string[] {
  const names = new Set<string>();

  modules.forEach((module) => {
    const normalized = module.productName.trim();
    if (normalized) {
      names.add(normalized);
    }
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildCreatorCompanies(modules: ModuleNode[]): string[] {
  const companies = new Set<string>();

  modules.forEach((module) => {
    const normalized = module.creatorCompany.trim();
    if (normalized) {
      companies.add(normalized);
    }
  });

  return Array.from(companies).sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildLocalizationList(modules: ModuleNode[]): string[] {
  const localizations = new Set<string>();

  modules.forEach((module) => {
    const normalized = module.localization.trim();
    if (normalized) {
      localizations.add(normalized);
    }
  });

  return Array.from(localizations).sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildTechnologyList(modules: ModuleNode[]): string[] {
  const technologies = new Set<string>();

  modules.forEach((module) => {
    module.technologyStack.forEach((tech) => {
      const normalized = tech.trim();
      if (normalized) {
        technologies.add(normalized);
      }
    });
  });

  return Array.from(technologies).sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildRidCompanyRegistry(modules: ModuleNode[]): Record<string, string[]> {
  const registry = new Map<string, Set<string>>();

  modules.forEach((module) => {
    const company = module.ridOwner.company.trim();
    if (!company) {
      return;
    }

    const division = module.ridOwner.division.trim();
    const target = registry.get(company) ?? new Set<string>();
    if (division) {
      target.add(division);
    }
    registry.set(company, target);
  });

  return Array.from(registry.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
    .reduce<Record<string, string[]>>((acc, [company, divisions]) => {
      acc[company] = Array.from(divisions).sort((a, b) => a.localeCompare(b, 'ru'));
      return acc;
    }, {});
}

function buildLibraryRegistry(modules: ModuleNode[]): Record<string, string[]> {
  const registry = new Map<string, Set<string>>();

  modules.forEach((module) => {
    module.libraries.forEach((library) => {
      const name = library.name.trim();
      if (!name) {
        return;
      }

      const version = library.version.trim();
      const target = registry.get(name) ?? new Set<string>();
      if (version) {
        target.add(version);
      }
      registry.set(name, target);
    });
  });

  return Array.from(registry.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
    .reduce<Record<string, string[]>>((acc, [library, versions]) => {
      acc[library] = Array.from(versions).sort((a, b) => a.localeCompare(b, 'ru'));
      return acc;
    }, {});
}

function buildArtifactDataTypes(artifacts: ArtifactNode[]): string[] {
  const types = new Set<string>();

  artifacts.forEach((artifact) => {
    const normalized = artifact.dataType.trim();
    if (normalized) {
      types.add(normalized);
    }
  });

  return Array.from(types).sort((a, b) => a.localeCompare(b, 'ru'));
}
