import { forwardRef } from 'react';

export const Button = forwardRef(function Button(
  { variant = 'default', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`ui-button ui-button--${variant} ${className}`.trim()}
      {...props}
    />
  );
});
