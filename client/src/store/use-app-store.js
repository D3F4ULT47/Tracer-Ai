import { create } from 'zustand';

export const useAppStore = create((set) => ({
  currentRoadmapId: null,
  isSidebarCollapsed: false,
  setCurrentRoadmapId: (currentRoadmapId) => set({ currentRoadmapId }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
}));
