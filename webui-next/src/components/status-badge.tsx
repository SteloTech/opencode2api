import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const tones = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  neutral: '',
} as const

export function StatusBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode
  tone?: keyof typeof tones
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn(tones[tone], className)}>
      {children}
    </Badge>
  )
}
