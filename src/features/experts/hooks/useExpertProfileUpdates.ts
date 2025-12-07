import { useCallback } from 'react';

import type { ExpertSkill } from '../../../data';
import { useGraphData } from '../../../context/GraphDataContext';

export function useExpertProfileUpdates() {
  const { setExpertProfiles } = useGraphData();

  const handleUpdateExpertSkills = useCallback((expertId: string, skills: ExpertSkill[]) => {
    setExpertProfiles((prev) =>
      prev.map((expert) => (expert.id === expertId ? { ...expert, skills } : expert))
    );
  }, [setExpertProfiles]);

  const handleUpdateExpertSoftSkills = useCallback(
    (expertId: string, softSkills: string[]) => {
      setExpertProfiles((prev) =>
        prev.map((expert) => (expert.id === expertId ? { ...expert, softSkills } : expert))
      );
    },
    [setExpertProfiles]
  );

  return {
    handleUpdateExpertSkills,
    handleUpdateExpertSoftSkills
  } as const;
}

