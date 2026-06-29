export function Tooltip({ label, children }) {
  return (
    <span className="ui-tooltip" data-tooltip={label} tabIndex="0" aria-label={label}>
      {children}
    </span>
  );
}
