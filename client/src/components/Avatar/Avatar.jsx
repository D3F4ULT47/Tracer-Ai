export function Avatar({ name = 'User', src, size = 'md', status = null, className = '' }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || 'U';

  return (
    <span className={`ui-avatar ui-avatar--${size} ${className}`.trim()} aria-label={name}>
      {src ? <img src={src} alt="" aria-hidden="true" /> : initial}
      {status ? <span className={`ui-avatar-status ui-avatar-status--${status}`} /> : null}
    </span>
  );
}
