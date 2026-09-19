import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover shadow-card',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2 hover:border-line-strong',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger-soft text-danger border border-transparent hover:border-danger',
}
const sizes: Record<Size, string> = { sm: 'h-7 px-2.5 text-[13px] gap-1.5', md: 'h-8 px-3 text-sm gap-2' }

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  )
})

export const IconButton = forwardRef<HTMLButtonElement, Props & { label: string }>(function IconButton(
  { variant = 'ghost', label, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-150 disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...rest}
    />
  )
})
