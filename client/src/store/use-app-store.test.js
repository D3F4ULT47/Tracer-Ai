import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './use-app-store.js';

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    composerDraft: '',
    currentRoadmapId: null,
    experienceLevel: 'intermediate',
    isSidebarCollapsed: true,
  });
});

describe('workspace UI state', () => {
  it('starts collapsed and retains the composer input independently of authentication', () => {
    expect(useAppStore.getState().isSidebarCollapsed).toBe(true);

    useAppStore.getState().setComposerDraft('Become a frontend engineer');
    useAppStore.getState().setExperienceLevel('advanced');
    useAppStore.getState().toggleSidebar();

    expect(useAppStore.getState()).toMatchObject({
      composerDraft: 'Become a frontend engineer',
      experienceLevel: 'advanced',
      isSidebarCollapsed: false,
    });
  });
});
