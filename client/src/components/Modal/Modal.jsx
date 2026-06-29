import { useEffect, useRef } from 'react';
import { Button } from '../Button/index.js';

export function Modal({ open, title, children, onClose }) {
  const closeButton = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="ui-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <Button ref={closeButton} type="button" onClick={onClose} aria-label="Close">
            ×
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
