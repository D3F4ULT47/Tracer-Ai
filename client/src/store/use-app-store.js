import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const useAppStore = create(
  persist(
    (set) => ({
      composerDraft: '',
      currentRoadmapId: null,
      experienceLevel: 'intermediate',
      isSidebarCollapsed: true,
      setComposerDraft: (composerDraft) => set({ composerDraft }),
      setCurrentRoadmapId: (currentRoadmapId) => set({ currentRoadmapId }),
      setExperienceLevel: (experienceLevel) => set({ experienceLevel }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    {
      name: 'tracer-ai-workspace',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ composerDraft, currentRoadmapId, experienceLevel, isSidebarCollapsed }) => ({
        composerDraft,
        currentRoadmapId,
        experienceLevel,
        isSidebarCollapsed,
      }),
    },
  ),
);
