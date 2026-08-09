import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const useAppStore = create(
  persist(
    (set) => ({
      composerDraft: '',
      currentRoadmapId: null,
      experienceLevel: 'intermediate',
      isSidebarCollapsed: true,
      isOverviewCollapsed: true,
      setComposerDraft: (composerDraft) => set({ composerDraft }),
      setCurrentRoadmapId: (currentRoadmapId) => set({ currentRoadmapId }),
      setExperienceLevel: (experienceLevel) => set({ experienceLevel }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      toggleOverview: () => set((state) => ({ isOverviewCollapsed: !state.isOverviewCollapsed })),
    }),
    {
      name: 'tracer-ai-workspace',
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        composerDraft,
        currentRoadmapId,
        experienceLevel,
        isSidebarCollapsed,
        isOverviewCollapsed,
      }) => ({
        composerDraft,
        currentRoadmapId,
        experienceLevel,
        isSidebarCollapsed,
        isOverviewCollapsed,
      }),
    },
  ),
);
