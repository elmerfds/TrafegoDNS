/**
 * Badge Component
 * Modern badge with subtle ring border and dark mode support
 */

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'purple' | 'cyan';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  pill?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: `
    bg-gray-50 text-gray-700 ring-gray-600/20
    dark:bg-gray-500/10 dark:text-gray-400 dark:ring-gray-500/20
  `,
  success: `
    bg-emerald-50 text-emerald-700 ring-emerald-600/20
    dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20
  `,
  warning: `
    bg-amber-50 text-amber-700 ring-amber-600/20
    dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20
  `,
  error: `
    bg-red-50 text-red-700 ring-red-600/20
    dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20
  `,
  info: `
    bg-blue-50 text-blue-700 ring-blue-600/20
    dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20
  `,
  primary: `
    bg-primary-50 text-primary-700 ring-primary-600/20
    dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/20
  `,
  purple: `
    bg-purple-50 text-purple-700 ring-purple-600/20
    dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/20
  `,
  cyan: `
    bg-cyan-50 text-cyan-700 ring-cyan-600/20
    dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-cyan-500/20
  `,
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1 text-sm',
};

export function Badge({
  variant = 'default',
  children,
  size = 'sm',
  pill = false,
  className = ''
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-semibold ring-1 ring-inset
        ${pill ? 'rounded-full' : 'rounded-md'}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </span>
  );
}
