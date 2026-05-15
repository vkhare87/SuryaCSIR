import clsx from 'clsx';

interface StatusBadgeProps {
  label: string;
  bg: string;
  text: string;
  className?: string;
}

export function StatusBadge({ label, bg, text, className }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        bg,
        text,
        className
      )}
    >
      {label}
    </span>
  );
}
