import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export function TableShell({
  columns,
  className,
  tableClassName,
  children,
}: {
  columns: string[]
  className?: string
  tableClassName?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border', className)}>
      <Table className={tableClassName}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  )
}

export function EmptyTable({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  )
}
