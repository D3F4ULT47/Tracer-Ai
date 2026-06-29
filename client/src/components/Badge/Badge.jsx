export function Badge({ children, tone = 'neutral' }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
