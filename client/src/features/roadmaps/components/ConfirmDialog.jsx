import { Button } from '../../../components/Button/index.js';
import { Modal } from '../../../components/Modal/index.js';

export function ConfirmDialog({ confirmation, onCancel }) {
  return (
    <Modal
      open={Boolean(confirmation)}
      title={confirmation?.title ?? 'Confirm change'}
      onClose={onCancel}
    >
      <div className="workspace-confirmation">
        <p>{confirmation?.message}</p>
        <div className="workspace-confirmation-actions">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmation?.danger ? 'danger' : 'primary'}
            onClick={confirmation?.confirm}
          >
            {confirmation?.confirmLabel ?? 'Continue'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
