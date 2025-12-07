import type {
  ArtifactNode,
  DomainNode,
  ExpertProfile,
  Initiative,
  ModuleNode,
  ModuleStatus,
  ModuleMetrics,
  ModuleInput,
  ModuleOutput,
  NonFunctionalRequirements,
  RidOwner,
  TeamMember,
  LibraryDependency,
  UserStats
} from '../../data';
import type { ExpertDraftPayload } from '../../types/expert';
import type { TaskListItem } from '../../types/tasks';

type AdminUserRole = 'admin' | 'user';

export type AdminUser = { id: string; username: string; role: AdminUserRole };

export type UserDraftPayload = {
  username: string;
  password?: string;
  role: AdminUserRole;
};

export type ModuleDraftPayload = {
  name: string;
  description: string;
  productName: string;
  creatorCompany: string;
  status: ModuleStatus;
  domainIds: string[];
  dependencyIds: string[];
  dataIn: ModuleInput[];
  dataOut: ModuleOutput[];
  ridOwner: RidOwner;
  localization: string;
  userStats: UserStats;
  technologyStack: string[];
  projectTeam: Array<Pick<TeamMember, 'id' | 'fullName' | 'role'>>;
  repository?: string;
  api?: string;
  specificationUrl: string;
  apiContractsUrl: string;
  techDesignUrl: string;
  architectureDiagramUrl: string;
  licenseServerIntegrated: boolean;
  libraries: LibraryDependency[];
  clientType: ModuleNode['clientType'];
  deploymentTool: ModuleNode['deploymentTool'];
  reuseScore: number;
  metrics: ModuleMetrics;
  formula: string;
  nonFunctional: NonFunctionalRequirements;
};

export type ModuleDraftPrefillRequest = {
  id: number;
  mode: 'create' | 'edit';
  draft: Partial<ModuleDraftPayload>;
  moduleId?: string;
};

export type DomainDraftPayload = {
  name: string;
  description: string;
  parentId?: string;
  moduleIds: string[];
  isCatalogRoot: boolean;
  experts: string[];
  meetupLink: string;
};

export type ArtifactDraftPayload = {
  name: string;
  description: string;
  domainId?: string;
  producedBy?: string;
  consumerIds: string[];
  dataType: string;
  sampleUrl: string;
};

export type AdminPanelProps = {
  modules: ModuleNode[];
  domains: DomainNode[];
  artifacts: ArtifactNode[];
  experts: ExpertProfile[];
  initiatives: Initiative[];
  employeeTasks: TaskListItem[];
  moduleDraftPrefill: ModuleDraftPrefillRequest | null;
  onModuleDraftPrefillApplied?: () => void;
  onCreateModule: (draft: ModuleDraftPayload) => void;
  onUpdateModule: (id: string, draft: ModuleDraftPayload) => void;
  onDeleteModule: (id: string) => void;
  onCreateDomain: (draft: DomainDraftPayload) => void;
  onUpdateDomain: (id: string, draft: DomainDraftPayload) => void;
  onDeleteDomain: (id: string) => void;
  onCreateArtifact: (draft: ArtifactDraftPayload) => void;
  onUpdateArtifact: (id: string, draft: ArtifactDraftPayload) => void;
  onDeleteArtifact: (id: string) => void;
  onCreateExpert: (draft: ExpertDraftPayload) => void;
  onUpdateExpert: (id: string, draft: ExpertDraftPayload) => void;
  onDeleteExpert: (id: string) => void;
  onUpdateEmployeeTasks: (tasks: TaskListItem[]) => void;
  users: AdminUser[];
  currentUser: AdminUser | null;
  onCreateUser: (draft: UserDraftPayload) => void;
  onUpdateUser: (id: string, draft: UserDraftPayload) => void;
  onDeleteUser: (id: string) => void;
};
