import type { ExpertProfile } from '../data';

export type ExpertDraftPayload = Omit<ExpertProfile, 'id'>;

