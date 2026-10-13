import type { ComponentProps } from 'react'
import { Empty } from '@/components/ui/empty'

export function EmptyState(props: ComponentProps<typeof Empty>) {
  return <Empty {...props} />
}
