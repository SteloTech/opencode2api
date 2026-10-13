import { cn } from '@/lib/utils'

export type Fact = {
  label: string
  value: React.ReactNode
  tone?: 'success' | 'warning' | 'danger' | 'muted'
}

const toneClass = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  muted: 'text-muted-foreground',
}

export function FactGrid({ facts, className }: { facts: Fact[]; className?: string }) {
  return (
    <dl className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {facts.map((fact) => (
        <div key={fact.label} className="rounded-xl border bg-card p-3">
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className={cn('mt-1 text-sm font-medium break-words', fact.tone && toneClass[fact.tone])}>
            {fact.value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  )
}
