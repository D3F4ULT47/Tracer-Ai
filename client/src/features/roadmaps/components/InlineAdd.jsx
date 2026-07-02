import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/Button/index.js';

export function InlineAdd({ label, placeholder, onAdd, disabled }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  if (!open) {
    return (
      <Button type="button" className="workspace-add-button" onClick={() => setOpen(true)}>
        <Plus size={14} />
        {label}
      </Button>
    );
  }

  return (
    <form
      className="workspace-inline-add"
      onSubmit={(event) => {
        event.preventDefault();
        const value = title.trim();
        if (!value) return;
        onAdd(value);
        setTitle('');
        setOpen(false);
      }}
    >
      <input
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button type="submit" variant="primary" disabled={disabled || !title.trim()}>
        Add
      </Button>
      <Button type="button" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
