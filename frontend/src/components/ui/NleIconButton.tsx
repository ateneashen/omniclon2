import { ReactNode } from 'react';

interface NleIconButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'accent-a' | 'accent-b' | 'primary';
  className?: string;
}

export default function NleIconButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  size = 'sm',
  variant = 'default',
  className = '',
}: NleIconButtonProps) {
  const sizeClass =
    size === 'lg' ? 'nle-btn--icon-lg' : size === 'md' ? 'w-8 h-8' : 'nle-btn--icon';

  const variantClass =
    variant === 'primary'
      ? 'nle-btn--primary'
      : variant === 'accent-a'
        ? 'nle-btn--accent-a'
        : variant === 'accent-b'
          ? 'nle-btn--accent-b'
          : active
            ? 'nle-btn--active'
            : '';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`nle-btn ${sizeClass} ${variantClass} ${className}`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}
