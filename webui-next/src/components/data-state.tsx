import { TableCell, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function LoadingGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  )
}

export function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-10 w-96 max-w-full rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
