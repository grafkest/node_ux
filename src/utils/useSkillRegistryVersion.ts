import { useSyncExternalStore } from 'react';
import {
  getSkillRegistryVersion,
  subscribeToSkillRegistry
} from '../data/skills';

export const useSkillRegistryVersion = (): number =>
  useSyncExternalStore(subscribeToSkillRegistry, getSkillRegistryVersion, getSkillRegistryVersion);

