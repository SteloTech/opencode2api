import { Card, CardContent } from '@/components/ui/card'

export function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {note ? <div className="text-xs text-muted-foreground">{note}</div> : null}
      </CardContent>
    </Card>
  )
}
