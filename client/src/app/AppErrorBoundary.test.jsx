import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary.jsx';

function BrokenScreen() {
  throw new Error('Broken screen');
}

afterEach(cleanup);

it('contains unexpected rendering failures with recovery actions', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <AppErrorBoundary>
      <BrokenScreen />
    </AppErrorBoundary>,
  );
  expect(
    screen.getByRole('heading', { name: 'This screen couldn’t finish loading' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reload screen' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
  consoleError.mockRestore();
});
