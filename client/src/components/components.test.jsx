import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button/index.js';
import { Loader } from './Loader/index.js';
import { Modal } from './Modal/index.js';
import { Toast } from './Toast/index.js';

afterEach(cleanup);

describe('Sprint 1 design primitives', () => {
  it('supports accessible action and loading states', async () => {
    const action = vi.fn();
    render(
      <>
        <Button onClick={action}>Continue</Button>
        <Loader label="Loading profile" />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Loading profile');
  });

  it('renders modal and success/error status semantics', () => {
    render(
      <>
        <Modal open title="Recover account" onClose={() => {}}>
          Content
        </Modal>
        <Toast>Saved</Toast>
        <Toast tone="error">Failed</Toast>
      </>,
    );
    expect(screen.getByRole('dialog', { name: 'Recover account' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });
});
