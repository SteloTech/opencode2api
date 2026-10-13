import { useMemo, useState } from 'react'
import type { AppContext } from '@/App'
import { CodeBlock } from '@/components/code-block'
import { EmptyTable, TableShell } from '@/components/table-shell'
import { FactGrid, type Fact } from '@/components/fact-grid'
import { PageShell, SectionCard } from '@/components/page-shell'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { formatResult, localClock, localTime, numberFormat } from '@/lib/format'
import type { PlaygroundResult } from '@/lib/types'

const keyTestLabels: Record<string, string> = {
  usable: 'Key 可用',
  rejected: 'Key 被拒绝',
  rate_limited: 'Key 已被接受但受到限流',
  upstream_error: '上游异常，无法判定 Key',
  transport_error: '网络或代理异常，无法判定 Key',
  unavailable: 'Key 或运行时不可用',
  request_error: '请求未成功',
}

export function DiagnosticsPage({ context }: { context: AppContext }) {
  const { debug, monitor, lastPlayground } = context
  const [protocol, setProtocol] = useState('chat')
  const [model, setModel] = useState('')
  const [key, setKey] = useState('auto')
  const [requestJson, setRequestJson] = useState('')
  const [result, setResult] = useState<PlaygroundResult | null>(null)
  const [running, setRunning] = useState(false)
  const [modelQuery, setModelQuery] = useState('')

  const models = debug?.models || []
  const selectedModel = model || models[0]?.model || 'YOUR_MODEL'
  const template = useMemo(() => {
    if (protocol === 'responses') return { model: selectedModel, input: '用一句话说明这个模型的能力。' }
    if (protocol === 'anthropic') return { model: selectedModel, max_tokens: 512, messages: [{ role: 'user', content: '用一句话说明这个模型的能力。' }] }
    return { model: selectedModel, messages: [{ role: 'user', content: '用一句话说明这个模型的能力。' }] }
  }, [protocol, selectedModel])
  const currentJson = requestJson || JSON.stringify(template, null, 2)
  const current = result || lastPlayground
  const metadata = debug?.metadata || monitor?.resources?.metadata || {}
  const filteredModels = models.filter((item) => item.model.toLowerCase().includes(modelQuery.toLowerCase()))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setRunning(true)
    try {
      const request = JSON.parse(currentJson)
      const keyPayload = key === 'auto' ? { mode: 'auto' } : { mode: 'selected', tier: key.split(':')[0], id: key.split(':').slice(1).join(':') }
      const data = await context.request<PlaygroundResult>('/api/debug/inference', {
        method: 'POST',
        body: JSON.stringify({ protocol, key: keyPayload, request }),
      })
      setResult(data)
      context.setLastPlayground(data)
      toast.success(data.ok ? `请求成功 · HTTP ${data.http_status}` : `请求失败 · HTTP ${data.http_status}`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const route = current?.route || {}
  const eligibility = route.anonymous_eligibility || {}
  const playgroundFacts: Fact[] = [
    { label: '结果', value: current ? (current.ok ? '成功' : '失败') : '尚未发送', tone: current?.ok ? 'success' : current ? 'danger' : 'muted' },
    { label: 'HTTP 状态', value: current?.http_status ?? '—', tone: current?.ok ? 'success' : 'danger' },
    { label: '耗时', value: current ? `${current.duration_ms} ms` : '—' },
    { label: 'Request ID', value: current?.request_id || '—' },
    { label: '测试模式', value: current?.selected_key ? `指定 ${current.selected_key.tier.toUpperCase()} Key` : '自动路由' },
    { label: '测试 Key', value: current?.selected_key ? `${current.selected_key.display} · ${current.selected_key.id}` : '—' },
    { label: 'Key 判断', value: current?.key_test ? keyTestLabels[current.key_test] || current.key_test : '自动路由未单独判定', tone: current?.key_test === 'usable' ? 'success' : current?.key_test ? 'danger' : undefined },
    { label: '实际路由', value: route.tier ? `${route.tier} / ${route.anonymous ? 'anonymous' : route.key_id || 'key'}` : '未路由' },
    { label: '原生协议', value: route.native_protocol || '—' },
    { label: '匿名判断', value: `${eligibility.allowed ? '允许' : '拒绝'} · ${eligibility.source || '—'}`, tone: eligibility.allowed ? 'success' : 'warning' },
  ]

  return (
    <PageShell title="诊断" description="发送诊断请求，理解模型规则与实际上游链路。">
      <Tabs defaultValue="playground">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="playground">Playground</TabsTrigger>
          <TabsTrigger value="routing">路由诊断</TabsTrigger>
          <TabsTrigger value="tracing">请求追踪</TabsTrigger>
        </TabsList>
        <TabsContent value="playground" className="mt-4 grid gap-4 xl:grid-cols-2">
          <SectionCard title="三协议请求台" description="服务端强制非流式，并经由真实 Gateway 路由。">
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>入口协议</Label>
                  <Select value={protocol} onValueChange={setProtocol}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="chat">Chat Completions</SelectItem>
                        <SelectItem value="responses">Responses</SelectItem>
                        <SelectItem value="anthropic">Anthropic Messages</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>模型</Label>
                  <Select value={selectedModel} onValueChange={setModel}>
                    <SelectTrigger><SelectValue placeholder="等待模型目录" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {models.map((item) => <SelectItem key={item.model} value={item.model}>{item.model}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>上游 Key</Label>
                  <Select value={key} onValueChange={setKey}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="auto">自动路由（匿名 / Tier 回退 / Key 轮询）</SelectItem>
                        {(debug?.keys?.zen || []).map((item) => <SelectItem key={`zen:${item.id}`} value={`zen:${item.id}`}>ZEN · {item.display}{item.cooldown_until ? ` · 冷却至 ${localTime(item.cooldown_until)}` : ''}</SelectItem>)}
                        {(debug?.keys?.go || []).map((item) => <SelectItem key={`go:${item.id}`} value={`go:${item.id}`}>GO · {item.display}{item.cooldown_until ? ` · 冷却至 ${localTime(item.cooldown_until)}` : ''}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">选择具体 Key 后只测试该 Key，不会切换到其他 Key、Tier 或匿名通道。</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="request-json">请求 JSON</Label>
                <Textarea id="request-json" className="min-h-64 font-mono text-xs" spellCheck={false} value={currentJson} onChange={(event) => setRequestJson(event.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setRequestJson(JSON.stringify(template, null, 2))}>重置模板</Button>
                <Button type="submit" disabled={running}>{running ? '请求中…' : '发送诊断请求'}</Button>
              </div>
            </form>
          </SectionCard>
          <SectionCard
            title="诊断结果"
            description={current ? (current.ok ? `请求成功 · HTTP ${current.http_status}` : `请求失败 · HTTP ${current.http_status}`) : '尚未发送请求。'}
            actions={current ? <StatusBadge tone={current.ok ? 'success' : 'danger'}>{current.ok ? '成功' : '失败'}</StatusBadge> : null}
          >
            <FactGrid facts={playgroundFacts} className="sm:grid-cols-2" />
            <CodeBlock className="mt-4" title="Raw protocol response" code={formatResult(current)} />
          </SectionCard>
        </TabsContent>
        <TabsContent value="routing" className="mt-4 space-y-4">
          <SectionCard title="模型 Metadata" description="OpenCode 价格缓存状态；零成本或名称含 free 任一条件即可进入匿名通道。">
            <FactGrid facts={[
              { label: '就绪', value: metadata.ready ? '是' : '否', tone: metadata.ready ? 'success' : 'warning' },
              { label: '模型数', value: numberFormat(metadata.models) },
              { label: '更新时间', value: metadata.updated_at ? localTime(metadata.updated_at) : '尚未更新' },
              { label: '是否过期', value: metadata.stale ? '是' : '否', tone: metadata.stale ? 'warning' : 'success' },
              { label: '下次刷新', value: metadata.next_refresh ? localTime(metadata.next_refresh) : '—' },
              { label: '最近错误', value: metadata.last_error || '无', tone: metadata.last_error ? 'danger' : 'success' },
            ]} />
          </SectionCard>
          <SectionCard
            title="模型路由表"
            description="显式协议、匿名资格来源与成本判断。"
            actions={<Input className="w-48" placeholder="筛选模型" value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} />}
          >
            <TableShell columns={['模型', '原生协议', '路由', '匿名资格', '判断来源', '成本 input / output']}>
              {filteredModels.length ? (
                filteredModels.map((item) => {
                  const eligibility = item.anonymous_eligibility || {}
                  const plan = [...(item.anonymous ? ['anonymous'] : []), ...(item.key_tiers || [])]
                  return (
                    <tr key={item.model}>
                      <td className="font-mono">{item.model}</td>
                      <td>{item.native_protocol} · {item.protocol_source}</td>
                      <td className={item.route_error ? 'text-destructive' : undefined}>{item.route_error || (plan.length ? plan.join(' → ') : '—')}</td>
                      <td><StatusBadge tone={eligibility.allowed ? 'success' : 'warning'}>{eligibility.allowed ? '允许' : '拒绝'}</StatusBadge></td>
                      <td>{eligibility.source || '—'}</td>
                      <td className="font-mono">{eligibility.input_cost ?? '?'} / {eligibility.output_cost ?? '?'}</td>
                    </tr>
                  )
                })
              ) : <EmptyTable colSpan={6}>没有匹配模型</EmptyTable>}
            </TableShell>
          </SectionCard>
        </TabsContent>
        <TabsContent value="tracing" className="mt-4 space-y-4">
          <SectionCard title="最近 Playground" description="只保留当前管理进程内的最后一次追踪。">
            <FactGrid facts={[
              { label: '结果', value: current?.ok ? '成功' : current ? '失败' : '尚无追踪', tone: current?.ok ? 'success' : current ? 'danger' : 'muted' },
              { label: 'HTTP', value: current?.http_status ?? '—' },
              { label: '耗时', value: current ? `${current.duration_ms} ms` : '—' },
              { label: 'Request ID', value: current?.request_id || '—' },
              { label: '模型', value: current?.route?.model || '—' },
              { label: '路由', value: current?.route?.tier ? `${current.route.tier} / ${current.route.anonymous ? 'anonymous' : current.route.key_id || 'key'}` : '未路由' },
            ]} />
          </SectionCard>
          <SectionCard title="请求路由" description="每个请求最终实际使用的 Key 尾码或 anonymous；最多展示最近 100 条。">
            <TableShell columns={['时间', 'Request ID', '模型', 'Tier', '通道', 'Key 尾码', '尝试', '状态', '耗时']}>
              {(monitor?.upstream?.requests || []).slice(-100).reverse().map((request) => (
                <tr key={`${request.request_id}-${request.time}`}>
                  <td className="whitespace-nowrap">{localClock(request.time)}</td>
                  <td className="font-mono">{request.request_id}</td>
                  <td className="font-mono">{request.model}</td>
                  <td>{request.tier || '—'}</td>
                  <td>{request.channel}</td>
                  <td className="font-mono">{request.key_id || '—'}</td>
                  <td>{request.attempts}</td>
                  <td><StatusBadge tone={request.success ? 'success' : 'danger'}>{request.status || request.outcome}</StatusBadge></td>
                  <td>{request.duration_ms} ms</td>
                </tr>
              ))}
              {!monitor?.upstream?.requests?.length ? <EmptyTable colSpan={9}>尚无请求路由</EmptyTable> : null}
            </TableShell>
          </SectionCard>
          <SectionCard title="上游尝试" description="Key 尾码、匿名通道与脱敏代理节点；最多展示最近 100 条。">
            <TableShell columns={['时间', 'Request ID', '模型', '通道', 'Key 尾码', '代理节点', '状态', '耗时']}>
              {(monitor?.upstream?.recent || []).slice(-100).reverse().map((attempt) => (
                <tr key={`${attempt.request_id}-${attempt.time}-${attempt.tier}-${attempt.key_id}`}>
                  <td className="whitespace-nowrap">{localClock(attempt.time)}</td>
                  <td className="font-mono">{attempt.request_id}</td>
                  <td className="font-mono">{attempt.model}</td>
                  <td>{attempt.tier} / {attempt.channel}</td>
                  <td className="font-mono">{attempt.key_id}</td>
                  <td>{attempt.proxy_node || '—'}</td>
                  <td><StatusBadge tone={attempt.success ? 'success' : 'danger'}>{attempt.status || attempt.outcome}</StatusBadge></td>
                  <td>{attempt.duration_ms} ms</td>
                </tr>
              ))}
              {!monitor?.upstream?.recent?.length ? <EmptyTable colSpan={8}>尚无上游尝试</EmptyTable> : null}
            </TableShell>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
