import { useMemo, useState } from 'react'
import type { AppContext } from '@/App'
import { EmptyTable, TableShell } from '@/components/table-shell'
import { MetricCard } from '@/components/metric-card'
import { PageShell, SectionCard } from '@/components/page-shell'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { localClock, numberFormat } from '@/lib/format'

export function ObservabilityPage({ context }: { context: AppContext }) {
  const { monitor, logs } = context
  const usage = monitor?.usage?.last_hour
  const tokens = usage?.tokens || {}
  const [level, setLevel] = useState('')
  const [component, setComponent] = useState('')
  const [query, setQuery] = useState('')
  const [paused, setPaused] = useState(false)

  const series = monitor?.metrics?.series || []
  const maximum = Math.max(1, ...series.map((point) => point.total_tokens || 0))
  const modelRows = Object.entries(usage?.models || {}).sort((a, b) => (b[1].total_tokens || 0) - (a[1].total_tokens || 0)).slice(0, 15)
  const tierRows = Object.entries(usage?.tiers || {}).sort((a, b) => (b[1].total_tokens || 0) - (a[1].total_tokens || 0))
  const tierTotal = Math.max(1, ...tierRows.map(([, value]) => value.total_tokens || 0))
  const filteredLogs = useMemo(() => logs.filter((item) => {
    if (level && item.level !== level) return false
    if (component && !(item.component || '').toLowerCase().includes(component.toLowerCase())) return false
    return !query || JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
  }).slice(-500), [component, level, logs, query])

  return (
    <PageShell title="观测" description="查看 Token 使用趋势与实时结构化事件。">
      <Tabs defaultValue="usage">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="usage">Token 用量</TabsTrigger>
          <TabsTrigger value="logs">事件日志</TabsTrigger>
        </TabsList>
        <TabsContent value="usage" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Usage coverage" value={`${((usage?.coverage || 0) * 100).toFixed(1)}%`} note="有 Token 回报 / 推理请求" />
            <MetricCard label="Total tokens" value={numberFormat(tokens.total_tokens)} note="最近 60 分钟" />
            <MetricCard label="Cached tokens" value={numberFormat(tokens.cached_tokens)} note="上游回报的缓存命中" />
            <MetricCard label="Reasoning tokens" value={numberFormat(tokens.reasoning_tokens)} note="上游回报的推理用量" />
          </div>
          <SectionCard title="每分钟 Token 趋势" description="最近 60 分钟；悬停查看输入、输出与总量。">
            <div className="flex h-40 items-end gap-1" role="img" aria-label="每分钟 Token 趋势">
              {series.map((point) => (
                <div
                  key={point.minute}
                  className="min-w-2 flex-1 rounded-t bg-primary/80"
                  style={{ height: `${Math.max(2, ((point.total_tokens || 0) / maximum) * 100)}%` }}
                  title={`${localClock(point.minute)} · input ${numberFormat(point.input_tokens)} · output ${numberFormat(point.output_tokens)} · total ${numberFormat(point.total_tokens)}`}
                />
              ))}
            </div>
          </SectionCard>
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="模型排行" description="按 total_tokens 排序。">
              <TableShell columns={['模型', '输入', '输出', '总量']}>
                {modelRows.length ? modelRows.map(([model, value]) => (
                  <tr key={model}>
                    <td className="font-mono">{model}</td>
                    <td>{numberFormat(value.input_tokens)}</td>
                    <td>{numberFormat(value.output_tokens)}</td>
                    <td>{numberFormat(value.total_tokens)}</td>
                  </tr>
                )) : <EmptyTable colSpan={4}>尚无 Token 用量</EmptyTable>}
              </TableShell>
            </SectionCard>
            <SectionCard title="Tier 分布" description="Zen / Go 的 Token 去向。">
              <div className="space-y-3">
                {tierRows.length ? tierRows.map(([tier, value]) => (
                  <div key={tier} className="space-y-1">
                    <div className="flex items-center justify-between text-sm"><strong>{tier}</strong><span className="font-mono">{numberFormat(value.total_tokens)}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((value.total_tokens || 0) / tierTotal) * 100}%` }} /></div>
                  </div>
                )) : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">尚无 Tier 用量</div>}
              </div>
            </SectionCard>
          </div>
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <SectionCard
            title="实时事件"
            description="来自进程内 Ring Buffer 的结构化 SSE。"
            actions={<Button variant={paused ? 'default' : 'outline'} size="sm" onClick={() => setPaused((value) => !value)}>{paused ? '继续' : '暂停'}</Button>}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Select value={level || 'all'} onValueChange={(value) => setLevel(value === 'all' ? '' : value)}>
                <SelectTrigger><SelectValue placeholder="全部级别" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部级别</SelectItem>
                    <SelectItem value="debug">debug</SelectItem>
                    <SelectItem value="info">info</SelectItem>
                    <SelectItem value="warn">warn</SelectItem>
                    <SelectItem value="error">error</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input placeholder="模块" value={component} onChange={(event) => setComponent(event.target.value)} />
              <Input placeholder="搜索事件、Request ID、模型" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border bg-muted/20 p-3 font-mono text-xs">
              {filteredLogs.length ? filteredLogs.map((item, index) => (
                <div key={`${item.time}-${index}`} className="flex flex-col gap-1 rounded-lg bg-background p-2 sm:flex-row sm:items-start sm:gap-3">
                  <span className="whitespace-nowrap text-muted-foreground">{localClock(item.time)}</span>
                  <StatusBadge tone={item.level === 'error' ? 'danger' : item.level === 'warn' ? 'warning' : item.level === 'info' ? 'success' : 'neutral'}>{item.level}</StatusBadge>
                  <span className="text-muted-foreground">{item.component || 'core'}</span>
                  <span className="min-w-0 flex-1 break-words">{item.message}</span>
                  <span className="break-all text-muted-foreground">{JSON.stringify(item.fields || {})}</span>
                </div>
              )) : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">等待日志事件…</div>}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
