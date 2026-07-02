import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  rememberPreviewSaveIntent,
  saveRoadmapPreview,
} from '../features/roadmaps/preview-storage.js';
import { RoadmapPreviewPage } from './RoadmapPreviewPage.jsx';

const mocks = vi.hoisted(() => ({ authenticated: false, persist: vi.fn() }));

vi.mock('../features/auth/hooks/use-auth.js', () => ({
  useCurrentUser: () => ({
    data: mocks.authenticated ? { data: { user: { id: 'user-1' } } } : null,
    isPending: false,
  }),
}));

vi.mock('../features/roadmaps/hooks/use-roadmap-generation.js', () => ({
  usePersistRoadmapPreview: () => ({ mutate: mocks.persist, isPending: false, isError: false }),
}));

const preview = {
  context: { contextVersion: 1 },
  generationMetadata: {
    generatedAt: '2026-01-01T00:00:00.000Z',
    learningContextVersion: 1,
  },
  roadmap: {
    title: 'Frontend Roadmap',
    summary: 'A complete frontend learning path.',
    type: 'skill',
    difficulty: 'beginner',
    weeklyCommitmentHours: 8,
    estimatedWeeks: 1,
    phases: [
      {
        key: 'phase-one',
        title: 'Foundations',
        order: 1,
        estimatedWeeks: 1,
        milestones: ['Foundation complete'],
        weeks: [
          {
            key: 'week-one',
            title: 'JavaScript',
            weekNumber: 1,
            milestones: ['First script'],
            tasks: [
              {
                key: 'task-one',
                title: 'Learn syntax',
                state: 'NOT_STARTED',
                difficulty: 'beginner',
                estimatedMinutes: 60,
                attachments: [
                  {
                    attachmentId: '11111111-1111-4111-8111-111111111111',
                    type: 'external_url',
                    url: 'https://developer.mozilla.org/docs/Web/JavaScript',
                    title: 'MDN JavaScript Guide',
                    metadata: { purpose: 'primary' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

beforeEach(() => {
  sessionStorage.clear();
  mocks.authenticated = false;
  mocks.persist.mockReset();
  saveRoadmapPreview(preview);
});

it('automatically saves the pending preview after authentication returns', async () => {
  mocks.authenticated = true;
  rememberPreviewSaveIntent();
  mocks.persist.mockImplementation((_input, callbacks) => {
    callbacks.onSuccess({ roadmapId: '44444444-4444-4444-8444-444444444444' });
  });

  render(
    <MemoryRouter initialEntries={['/roadmaps/preview']}>
      <Routes>
        <Route path="/roadmaps/preview" element={<RoadmapPreviewPage />} />
        <Route path="/roadmaps/:id" element={<h1>Saved roadmap workspace</h1>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole('heading', { name: 'Saved roadmap workspace' }),
  ).toBeInTheDocument();
  expect(mocks.persist).toHaveBeenCalledTimes(1);
});

afterEach(cleanup);

it('shows the anonymous roadmap value before asking for authentication', async () => {
  render(
    <MemoryRouter initialEntries={['/roadmaps/preview']}>
      <Routes>
        <Route path="/roadmaps/preview" element={<RoadmapPreviewPage />} />
        <Route path="/login" element={<div>Sign in screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Frontend Roadmap' })).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Expand JavaScript' }));
  expect(screen.getByText('Learn syntax')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'MDN JavaScript Guide (primary)' })).toHaveAttribute(
    'href',
    'https://developer.mozilla.org/docs/Web/JavaScript',
  );
  await user.click(screen.getByRole('button', { name: 'Sign in to save' }));
  expect(screen.getByText('Sign in screen')).toBeInTheDocument();
});
