import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MyRoadmapsPage } from './MyRoadmapsPage.jsx';

vi.mock('../features/roadmaps/hooks/use-roadmaps.js', () => ({
  useRoadmaps: () => ({ data: { data: { roadmaps: [] } }, isPending: false, isError: false }),
  useDuplicateRoadmap: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRoadmap: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

it('shows a useful first-roadmap empty state', () => {
  render(
    <MemoryRouter>
      <MyRoadmapsPage />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Create your first roadmap' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open the homepage composer' })).toHaveAttribute(
    'href',
    '/#composer',
  );
});
