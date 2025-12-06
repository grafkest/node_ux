import { motion, type Variants } from 'framer-motion';

import AdminPanel, {
  type ArtifactDraftPayload,
  type DomainDraftPayload,
  type ExpertDraftPayload,
  type ModuleDraftPayload,
  type ModuleDraftPrefillRequest,
  type UserDraftPayload
} from '../../components/AdminPanel';
import GraphPersistenceControls from '../../components/GraphPersistenceControls';
import styles from '../../App.module.css';
import type {
  ArtifactNode,
  DomainNode,
  ExpertProfile,
  Initiative,
  ModuleNode
} from '../../data';
import type {
  GraphLayoutSnapshot,
  GraphSnapshotPayload,
  GraphSummary,
  GraphSyncStatus
} from '../../types/graph';
import type { TaskListItem } from '../../types/tasks';

export type AdminContainerProps = {
  isActive: boolean;
  pageVariants: Variants;
  modules: ModuleNode[];
  domains: DomainNode[];
  artifacts: ArtifactNode[];
  experts: ExpertProfile[];
  initiatives: Initiative[];
  employeeTasks: TaskListItem[];
  moduleDraftPrefill: ModuleDraftPrefillRequest | null;
  onModuleDraftPrefillApplied: () => void;
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
  users: Array<{ id: string; username: string; role: 'admin' | 'user' }>;
  onCreateUser: (draft: UserDraftPayload) => void;
  onUpdateUser: (id: string, draft: UserDraftPayload) => void;
  onDeleteUser: (id: string) => void;
  currentUser: { id: string; username: string; role: 'admin' | 'user' } | null;
  graphs: GraphSummary[];
  activeGraphId: string | null;
  onGraphSelect: (graphId: string | null) => void;
  onGraphCreate: () => void;
  onGraphDelete?: () => void;
  isGraphListLoading: boolean;
  syncStatus: GraphSyncStatus | null;
  layout: GraphLayoutSnapshot;
  isSyncAvailable: boolean;
  onImport: (payload: GraphSnapshotPayload) => void;
  onImportFromGraph: (request: {
    graphId: string;
    includeDomains: boolean;
    includeModules: boolean;
    includeArtifacts: boolean;
    includeExperts: boolean;
    includeInitiatives: boolean;
  }) => Promise<{
    domains: number;
    modules: number;
    artifacts: number;
    experts: number;
    initiatives: number;
  }>;
  onRetryLoad: () => void;
  isReloading: boolean;
};

export function AdminContainer({
  isActive,
  pageVariants,
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
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  currentUser,
  graphs,
  activeGraphId,
  onGraphSelect,
  onGraphCreate,
  onGraphDelete,
  isGraphListLoading,
  syncStatus,
  layout,
  isSyncAvailable,
  onImport,
  onImportFromGraph,
  onRetryLoad,
  isReloading
}: AdminContainerProps) {
  return (
    <motion.main
      className={styles.creationMain}
      initial="hidden"
      animate={isActive ? 'visible' : 'hidden'}
      variants={pageVariants}
    >
      <GraphPersistenceControls
        modules={modules}
        domains={domains}
        artifacts={artifacts}
        experts={experts}
        initiatives={initiatives}
        onImport={onImport}
        onImportFromGraph={onImportFromGraph}
        graphs={graphs}
        activeGraphId={activeGraphId}
        onGraphSelect={onGraphSelect}
        onGraphCreate={onGraphCreate}
        onGraphDelete={onGraphDelete}
        isGraphListLoading={isGraphListLoading}
        syncStatus={syncStatus}
        layout={layout}
        isSyncAvailable={isSyncAvailable}
        onRetryLoad={onRetryLoad}
        isReloading={isReloading}
      />
      <AdminPanel
        modules={modules}
        domains={domains}
        artifacts={artifacts}
        experts={experts}
        initiatives={initiatives}
        employeeTasks={employeeTasks}
        moduleDraftPrefill={moduleDraftPrefill}
        onModuleDraftPrefillApplied={onModuleDraftPrefillApplied}
        onCreateModule={onCreateModule}
        onUpdateModule={onUpdateModule}
        onDeleteModule={onDeleteModule}
        onCreateDomain={onCreateDomain}
        onUpdateDomain={onUpdateDomain}
        onDeleteDomain={onDeleteDomain}
        onCreateArtifact={onCreateArtifact}
        onUpdateArtifact={onUpdateArtifact}
        onDeleteArtifact={onDeleteArtifact}
        onCreateExpert={onCreateExpert}
        onUpdateExpert={onUpdateExpert}
        onDeleteExpert={onDeleteExpert}
        onUpdateEmployeeTasks={onUpdateEmployeeTasks}
        users={users}
        onCreateUser={onCreateUser}
        onUpdateUser={onUpdateUser}
        onDeleteUser={onDeleteUser}
        currentUser={currentUser}
      />
    </motion.main>
  );
}
