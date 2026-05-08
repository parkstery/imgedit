import React from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-blue-500 bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-400 focus-visible:ring-blue-500',
  secondary:
    'border-neutral-600 bg-neutral-900 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-800 active:bg-neutral-700 focus-visible:ring-blue-500',
  ghost:
    'border-transparent bg-transparent text-neutral-200 hover:border-neutral-600 hover:bg-neutral-700 active:bg-neutral-600 focus-visible:ring-blue-500',
  danger:
    'border-red-500/60 bg-red-600/20 text-red-100 hover:bg-red-600/30 active:bg-red-600/40 focus-visible:ring-red-500',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-8 px-3 text-sm',
  icon: 'h-8 w-8 p-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isActive?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', isActive = false, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1 rounded-md border font-medium',
          'transition-colors duration-100 outline-none',
          'focus-visible:ring-2 focus-visible:ring-offset-0',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40',
          sizeClasses[size],
          variantClasses[variant],
          isActive && variant === 'secondary' && 'border-blue-500 bg-blue-600 text-white hover:bg-blue-500',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
