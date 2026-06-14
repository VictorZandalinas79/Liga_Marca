import { clsx } from 'clsx'
import { forwardRef } from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  ref?: React.Ref<HTMLDivElement>
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ children, className }, ref) => {
  return (
    <div ref={ref} className={clsx('bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm', className)}>
      {children}
    </div>
  )
})
Card.displayName = 'Card'

export function CardHeader({ children, className }: CardProps) {
  return <div className={clsx('p-6 pb-4', className)}>{children}</div>
}

export function CardTitle({ children, className }: CardProps) {
  return <h3 className={clsx('text-lg font-semibold text-slate-900', className)}>{children}</h3>
}

export function CardContent({ children, className }: CardProps) {
  return <div className={clsx('p-6', className)}>{children}</div>
}
