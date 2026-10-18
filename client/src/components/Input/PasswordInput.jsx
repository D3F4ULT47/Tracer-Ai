import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordInput({ label, error, id, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="ui-field" htmlFor={id}>
      <span>{label}</span>
      <span className="ui-password">
        <input
          id={id}
          className="ui-input"
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          {...props}
        />
        <button
          type="button"
          className="ui-password-toggle"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {error ? <span className="ui-field-error">{error}</span> : null}
    </label>
  );
}
