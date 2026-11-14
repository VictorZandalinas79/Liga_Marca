import { clsx } from 'clsx'
import { forwardRef } from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ children, className, ...props }, ref) => {
  return (
    <div ref={ref} className={clsx('bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm', className)} {...props}>
      {children}
    </div>
  )
})
Card.displayName = 'Card'

export function CardHeader({ children, className, ...props }: CardProps) {
  return <div className={clsx('p-6 pb-4', className)} {...props}>{children}</div>
}

export function CardTitle({ children, className, ...props }: CardProps) {
  return <h3 className={clsx('text-lg font-semibold text-slate-900', className)} {...props}>{children}</h3>
}

export function CardContent({ children, className, ...props }: CardProps) {
  return <div className={clsx('p-6', className)} {...props}>{children}</div>
}
