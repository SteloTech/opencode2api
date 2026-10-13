import { useMemo, useState } from 'react'
import { CheckCircle2, CircleDashed, ExternalLink } from 'lucide-react'
import type { AppContext } from '@/App'
import { CodeBlock } from '@/components/code-block'
import { EmptyTable, TableShell } from '@/components/table-shell'
import { MetricCard } from '@/components/metric-card'
import { PageShell, SectionCard } from '@/components/page-shell'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { numberFormat, percent } from '@/lib/format'

export function OverviewPage({ context }: { context: AppContext }) {
  const { config, monitor } = context
  const [model, setModel] = useState('YOUR_MODEL')
  const base = useMemo(() => {
    const listen = config?.effective?.listen || config?.listen || ':8080'
    const port = listen.match(/:(\d+)$/)?.[1] || '8080'
    return `${location.protocol}//${location.hostname}:${port}`
  }, [config])

  const metrics = monitor?.metrics
  const resources = monitor?.resources
  const breakdowns: Array<[string, Record<string, { total?: number; success?: number }>]> = [
    ['端点', monitor?.upstream?.by_endpoint || {}],
    ['模型', monitor?.upstream?.by_model || {}],
    ['Tier', monitor?.upstream?.by_tier || {}],
    ['状态码', monitor?.upstream?.by_status || {}],
  ]

  const checks = [
    {
      title: '启用管理端',
      description: 'WebUI 当前处于启用状态。',
      done: !!config?.webui?.enabled,
    },
    {
      title: '配置本地 API Key',
      description: '至少配置一个 server key，供客户端访问网关。',
      done: (config?.server_keys?.length || 0) > 0,
    },
    {
      title: '选择上游通道',
      description: '至少有 Zen / Go Key，或启用匿名通道。',
      done:
        (config?.zen_keys?.length || 0) + (config?.go_keys?.length || 0) > 0 || !!config?.anonymous,
    },
    {
      title: '检查代理',
      description: '至少一个代理节点健康。',
      done: (resources?.proxies || []).some((proxy) => proxy.healthy),
    },
    {
      title: '等待模型目录',
      description: '模型目录已更新并暴露至少一个模型。',
      done: (context.debug?.metadata?.models || 0) > 0 && !!context.debug?.metadata?.updated_at,
    },
    {
      title: '复制接入示例',
      description: '进入接入示例，替换模型与 YOUR_API_KEY。',
      done: true,
    },
  ]

  const curl = (path: string, headers: string[], body: string) =>
    `curl ${base}${path} \\\n${headers.map((header) => `  -H "${header}" \\\n`).join('')}  -d '${body}'`

  const examples = [
    ['Chat Completions', curl('/v1/chat/completions', ['Authorization: Bearer YOUR_API_KEY', 'Content-Type: application/json'], `{"model":"${model}","messages":[{"role":"user","content":"Hello"}]}`)],
    ['Responses', curl('/v1/responses', ['Authorization: Bearer YOUR_API_KEY', 'Content-Type: application/json'], `{"model":"${model}","input":"Hello"}`)],
    ['Anthropic Messages', curl('/v1/messages', ['x-api-key: YOUR_API_KEY', 'anthropic-version: 2023-06-01', 'Content-Type: application/json'], `{"model":"${model}","max_tokens":512,"messages":[{"role":"user","content":"Hello"}]}`)],
  ] as const

  const python = `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}/v1", api_key="YOUR_API_KEY")\nresponse = client.chat.completions.create(\n    model="${model}",\n    messages=[{"role": "user", "content": "Hello"}],\n)\nprint(response.choices[0].message.content)`
  const javascript = `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "${base}/v1",\n  apiKey: process.env.OPENAI_API_KEY,\n});\n\nconst response = await client.chat.completions.create({\n  model: "${model}",\n  messages: [{ role: "user", content: "Hello" }],\n});\n\nconsole.log(response.choices[0].message.content);`

  return (
    <PageShell title="总览" description="检查运行状态、完成上线流程并复制接入示例。">
      <Tabs defaultValue="status">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="status">运行状态</TabsTrigger>
          <TabsTrigger value="checklist">上线检查</TabsTrigger>
          <TabsTrigger value="access">接入示例</TabsTrigger>
        </TabsList>
        <TabsContent value="status" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Last hour requests" value={numberFormat(metrics?.last_hour.total)} note="最近 60 分钟" />
            <MetricCard label="Success rate" value={percent(metrics?.last_hour.success_rate)} note="HTTP 2xx–3xx" />
            <MetricCard label="P95 latency" value={`${metrics?.last_hour.p95_ms || 0} ms`} note="端到端毫秒" />
            <MetricCard label="Active / stream" value={`${metrics?.active_requests || 0} / ${metrics?.active_streams || 0}`} note="当前并发" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Proxy 节点" description="这里显示代理节点，不将其描述为出口 IP。">
              <TableShell columns={['节点', '健康', '绑定']}>
                {resources?.proxies?.length ? (
                  resources.proxies.map((proxy, index) => (
                    <TableRow key={`${proxy.display}-${index}`}>
                      <TableCell className="font-mono">{proxy.display || '—'}</TableCell>
                      <TableCell>
                        <StatusBadge tone={proxy.healthy ? 'success' : 'danger'}>{proxy.healthy ? '健康' : '异常'}</StatusBadge>
                      </TableCell>
                      <TableCell>{proxy.bound || '—'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={3}>暂无代理节点</EmptyTable>
                )}
              </TableShell>
            </SectionCard>
            <SectionCard title="Key 池" description="仅显示 Key 最后 5 位与冷却状态。">
              <TableShell columns={['Key 尾码', 'Tier', '状态']}>
                {resources?.keys?.length ? (
                  resources.keys.map((key, index) => (
                    <TableRow key={`${key.display}-${index}`}>
                      <TableCell className="font-mono">{key.display}</TableCell>
                      <TableCell>{key.tier || '—'}</TableCell>
                      <TableCell>
                        <StatusBadge tone={key.cooling ? 'warning' : 'success'}>{key.cooling ? '冷却中' : '可用'}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={3}>暂无上游 Key</EmptyTable>
                )}
              </TableShell>
            </SectionCard>
          </div>
          <SectionCard title="请求分布" description="端点、模型、Tier 与状态码的最近一小时聚合。">
            <div className="grid gap-4 xl:grid-cols-2">
              {breakdowns.map(([label, values]) => (
                <div key={label} className="rounded-xl border">
                  <div className="border-b px-3 py-2 text-sm font-medium">{label}</div>
                  <Table>
                    <TableBody>
                      {Object.entries(values).length ? (
                        Object.entries(values).map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell className="font-mono">{key}</TableCell>
                            <TableCell>{numberFormat(value.total)}</TableCell>
                            <TableCell className="text-right">{percent((value.success || 0) / Math.max(1, value.total || 0))}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell className="h-16 text-center text-muted-foreground">暂无数据</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="checklist" className="mt-4">
          <SectionCard title="六步上线检查" description="状态来自当前配置与实时资源，不写入浏览器存储。">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {checks.map((check) => (
                <div key={check.title} className="flex flex-col gap-3 rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    {check.done ? <CheckCircle2 className="size-4 text-emerald-500" /> : <CircleDashed className="size-4 text-amber-500" />}
                    <h3 className="font-medium">{check.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{check.description}</p>
                  <StatusBadge tone={check.done ? 'success' : 'warning'} className="w-fit">{check.done ? '已就绪' : '待处理'}</StatusBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="access" className="mt-4 space-y-4">
          <SectionCard
            title="基础地址"
            description="示例不会写入真实 Server Key。"
            actions={<Badge variant="secondary">{base}/v1</Badge>}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="access-model">示例模型</Label>
                <Input id="access-model" value={model} onChange={(event) => setModel(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>推导的 API Base</Label>
                <Input readOnly value={`${base}/v1`} className="font-mono" />
              </div>
            </div>
          </SectionCard>
          <SectionCard title="三种协议入口" description="复制后替换 YOUR_API_KEY 与模型名称。">
            <div className="grid gap-3 xl:grid-cols-3">
              {examples.map(([title, code]) => (
                <CodeBlock key={title} title={title} code={code} />
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Python 与 JavaScript" description="OpenAI SDK 可直接指向本网关。">
            <div className="grid gap-3 xl:grid-cols-2">
              <CodeBlock title="Python" code={python} />
              <CodeBlock title="JavaScript" code={javascript} />
            </div>
          </SectionCard>
          <SectionCard title="接入注意">
            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
              <li>OpenAI 兼容客户端使用 <code className="font-mono">Authorization: Bearer YOUR_API_KEY</code>。</li>
              <li>Anthropic 客户端可使用 <code className="font-mono">x-api-key</code>，路径为 <code className="font-mono">/v1/messages</code>。</li>
              <li>流式请求会保持原协议事件；跨协议时由 Gateway 转换。</li>
              <li>若配置监听地址为 <code className="font-mono">0.0.0.0</code>，示例会改用当前浏览器主机名。</li>
            </ul>
            <Button variant="link" className="mt-3 px-0" onClick={() => location.assign('#/system/config')}>
              前往配置中心
              <ExternalLink className="size-4" />
            </Button>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
