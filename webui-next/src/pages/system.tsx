import { useEffect, useState } from 'react'
import type { AppContext } from '@/App'
import { CodeBlock } from '@/components/code-block'
import { EmptyTable, TableShell } from '@/components/table-shell'
import { PageShell, SectionCard } from '@/components/page-shell'
import { SecretManager, parseAddedValues } from '@/components/secret-manager'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { APIKey, Config, SecretItem } from '@/lib/types'
import { localTime } from '@/lib/format'

type Draft = Required<Pick<Config, 'prefer' | 'listen' | 'server_keys' | 'zen_keys' | 'go_keys' | 'anonymous' | 'proxies' | 'proxyfile' | 'upstream' | 'retry' | 'models' | 'reasoning' | 'performance' | 'logging' | 'webui'>>

export function SystemPage({ context }: { context: AppContext }) {
  const [tab, setTab] = useState('config')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [added, setAdded] = useState({ server_keys: '', zen_keys: '', go_keys: '', proxies: '' })
  const [revealed, setRevealed] = useState('')
  const [revealOpen, setRevealOpen] = useState(false)
  const [account, setAccount] = useState({ username: '', current: '', next: '' })
  const [apiKeyName, setApiKeyName] = useState('')
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [keys, setKeys] = useState<APIKey[]>([])
  const [renaming, setRenaming] = useState<APIKey | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<APIKey | null>(null)

  useEffect(() => { if (context.config && !draft) setDraft(toDraft(context.config)) }, [context.config, draft])
  useEffect(() => { void context.request<{ keys: APIKey[] }>('/api/api-keys').then((data) => setKeys(data.keys)).catch(() => undefined) }, [context.request])

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current)
  const secretItems = (name: 'server_keys' | 'zen_keys' | 'go_keys' | 'proxies') => draft?.[name] || []

  const submitConfig = async () => {
    if (!draft) return
    const payload = {
      ...draft,
      server_keys: mergeSecrets(draft.server_keys, added.server_keys),
      zen_keys: mergeSecrets(draft.zen_keys, added.zen_keys),
      go_keys: mergeSecrets(draft.go_keys, added.go_keys),
      proxies: mergeSecrets(draft.proxies, added.proxies),
    }
    const result = await context.request<{ config: Config; result: { restart_required?: boolean; restart_fields?: string[] } }>('/api/config', { method: 'PUT', body: JSON.stringify(payload) })
    await context.loadConfig()
    setDraft(toDraft(result.config))
    setAdded({ server_keys: '', zen_keys: '', go_keys: '', proxies: '' })
    toast.success(result.result.restart_required ? `已应用；${result.result.restart_fields?.join(', ')} 需重启` : '配置已保存并立即应用')
  }

  const reveal = async () => {
    const password = window.prompt('请再次输入管理密码')
    if (!password) return
    const data = await context.request<{ values: Record<string, SecretItem[]> }>('/api/config/reveal', { method: 'POST', body: JSON.stringify({ password }) })
    setRevealed(JSON.stringify(data.values, null, 2))
    setRevealOpen(true)
  }

  const updateKey = async (id: string, method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) => {
    const data = await context.request<{ keys: APIKey[] }>(`/api/api-keys/${encodeURIComponent(id)}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
    setKeys(data.keys)
    await context.loadConfig()
    toast.success('已保存并立即生效')
  }

  const createKey = async () => {
    const data = await context.request<{ key: string; keys: APIKey[] }>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name: apiKeyName, value: apiKeyValue }) })
    setKeys(data.keys)
    context.setCreatedKey(data.key)
    setApiKeyName('')
    setApiKeyValue('')
    await context.loadConfig()
    toast.success('API Key 已创建')
  }

  const updateAccount = async () => {
    await context.request('/api/account', { method: 'PUT', body: JSON.stringify(account) })
    toast.success('账号已更新，请重新登录')
    location.reload()
  }

  const configSections = [
    ['service', '服务'], ['secrets', '密钥'], ['proxy', '代理'], ['upstream', '上游'], ['reasoning', 'Thinking'], ['performance', '性能'], ['logging', '日志'],
  ] as const

  return (
    <PageShell title="系统" description="维护网关配置、访问密钥与管理账号。">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="config">配置</TabsTrigger><TabsTrigger value="api-keys">API Keys</TabsTrigger><TabsTrigger value="account">账号安全</TabsTrigger></TabsList>
        <TabsContent value="config" className="mt-4 space-y-4">
          {context.config?.restart_required_fields?.length ? <Alert><AlertTitle>配置已保存但尚未生效</AlertTitle><AlertDescription>{context.config.restart_required_fields.join(', ')} 需要重启进程。</AlertDescription></Alert> : null}
          <SectionCard title="配置中心" description="验证后原子保存，并热应用可变字段。" actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void context.request('/api/config/reload', { method: 'POST', body: '{}' }).then(() => context.loadConfig()).then(() => toast.success('已从磁盘重载'))}>从磁盘重载</Button><Button size="sm" onClick={() => void submitConfig().catch((error) => toast.error((error as Error).message))}>验证、保存并应用</Button></div>}>
            <div className="space-y-6">
              {configSections.map(([id, label]) => (
                <div key={id} className="rounded-xl border p-4">
                  <h3 className="mb-4 font-medium">{label}</h3>
                  {id === 'service' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>认证 Key 首选 Tier</Label><Select value={draft?.prefer || 'go'} onValueChange={(value) => update('prefer', value as 'go' | 'zen')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="go">Go（失败回退 Zen）</SelectItem><SelectItem value="zen">Zen（失败回退 Go）</SelectItem></SelectGroup></SelectContent></Select></div>
                      <div className="space-y-2"><Label>API Listen</Label><Input value={draft?.listen || ''} onChange={(event) => update('listen', event.target.value)} /></div>
                      <div className="space-y-2"><Label>WebUI Listen</Label><Input value={draft?.webui?.listen || ''} onChange={(event) => update('webui', { ...draft?.webui, listen: event.target.value })} /></div>
                      <div className="space-y-2"><Label>Session TTL（分钟）</Label><Input type="number" value={draft?.webui?.session_ttl_minutes || 0} onChange={(event) => update('webui', { ...draft?.webui, session_ttl_minutes: Number(event.target.value) })} /></div>
                      <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!draft?.webui?.enabled} onCheckedChange={(checked) => update('webui', { ...draft?.webui, enabled: checked === true })} />启用 WebUI（修改需重启）</label>
                    </div>
                  ) : null}
                  {id === 'secrets' ? (
                    <div className="space-y-4">
                      <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!draft?.anonymous} onCheckedChange={(checked) => update('anonymous', checked === true)} />启用 Zen 匿名通道</label>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <SecretManager label="Server Keys" items={secretItems('server_keys')} added={added.server_keys} onAddedChange={(value) => setAdded((current) => ({ ...current, server_keys: value }))} onRemove={(removeId) => update('server_keys', secretItems('server_keys').filter((item) => item.id !== removeId))} />
                        <SecretManager label="Zen Keys" items={secretItems('zen_keys')} added={added.zen_keys} onAddedChange={(value) => setAdded((current) => ({ ...current, zen_keys: value }))} onRemove={(removeId) => update('zen_keys', secretItems('zen_keys').filter((item) => item.id !== removeId))} />
                        <SecretManager label="Go Keys" items={secretItems('go_keys')} added={added.go_keys} onAddedChange={(value) => setAdded((current) => ({ ...current, go_keys: value }))} onRemove={(removeId) => update('go_keys', secretItems('go_keys').filter((item) => item.id !== removeId))} />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void reveal().catch((error) => toast.error((error as Error).message))}>二次验证查看</Button>
                    </div>
                  ) : null}
                  {id === 'proxy' ? (
                    <div className="space-y-4"><SecretManager label="Proxy 节点" items={secretItems('proxies')} added={added.proxies} onAddedChange={(value) => setAdded((current) => ({ ...current, proxies: value }))} onRemove={(removeId) => update('proxies', secretItems('proxies').filter((item) => item.id !== removeId))} placeholder="direct&#10;http://user:pass@host:port" /><div className="max-w-sm space-y-2"><Label>Proxy File</Label><Input value={draft?.proxyfile || ''} onChange={(event) => update('proxyfile', event.target.value)} /></div></div>
                  ) : null}
                  {id === 'upstream' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>Zen URL</Label><Input value={draft?.upstream?.zen || ''} onChange={(event) => update('upstream', { ...draft?.upstream, zen: event.target.value })} /></div>
                      <div className="space-y-2"><Label>Go URL</Label><Input value={draft?.upstream?.go || ''} onChange={(event) => update('upstream', { ...draft?.upstream, go: event.target.value })} /></div>
                      <div className="space-y-2"><Label>每个 Key Tier 最大尝试次数</Label><Input type="number" value={draft?.retry?.max_attempts || 0} onChange={(event) => update('retry', { ...draft?.retry, max_attempts: Number(event.target.value) })} /></div>
                      <div className="space-y-2"><Label>请求超时（秒）</Label><Input type="number" value={draft?.retry?.timeout_seconds || 0} onChange={(event) => update('retry', { ...draft?.retry, timeout_seconds: Number(event.target.value) })} /></div>
                      <div className="space-y-2"><Label>模型刷新（秒）</Label><Input type="number" value={draft?.models?.refresh_seconds || 0} onChange={(event) => update('models', { ...draft?.models, refresh_seconds: Number(event.target.value) })} /></div>
                      <div className="space-y-2"><Label>模型协议覆盖（JSON）</Label><Textarea className="font-mono" value={JSON.stringify(draft?.models?.protocols || {}, null, 2)} onChange={(event) => update('models', { ...draft?.models, protocols: JSON.parse(event.target.value || '{}') })} /></div>
                    </div>
                  ) : null}
                  {id === 'reasoning' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>默认强度</Label><Select value={draft?.reasoning?.effort || ''} onValueChange={(value) => update('reasoning', { ...draft?.reasoning, effort: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="">跟随客户端</SelectItem><SelectItem value="auto">auto</SelectItem><SelectItem value="minimal">minimal</SelectItem><SelectItem value="low">low</SelectItem><SelectItem value="medium">medium</SelectItem><SelectItem value="high">high</SelectItem><SelectItem value="xhigh">xhigh</SelectItem><SelectItem value="max">max</SelectItem><SelectItem value="none">关闭</SelectItem></SelectGroup></SelectContent></Select></div>
                      <div className="space-y-2"><Label>按模型覆盖（JSON）</Label><Textarea className="font-mono" value={JSON.stringify(draft?.reasoning?.effort_by_model || {}, null, 2)} onChange={(event) => update('reasoning', { ...draft?.reasoning, effort_by_model: JSON.parse(event.target.value || '{}') })} /></div>
                    </div>
                  ) : null}
                  {id === 'performance' ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {([['max_idle_conns', 'Max Idle Conns'], ['max_idle_conns_per_host', 'Max Idle / Host'], ['max_conns_per_host', 'Max Conns / Host'], ['idle_conn_timeout_seconds', 'Idle Timeout（秒）'], ['connect_timeout_seconds', 'Connect Timeout（秒）'], ['failure_cooldown_seconds', 'Failure Cooldown（秒）'], ['attempt_timeout_seconds', 'Attempt Timeout（秒）'], ['first_event_timeout_seconds', '首个 SSE 事件超时（秒）']] as const).map(([key, label]) => (
                        <div key={key} className="space-y-2"><Label>{label}</Label><Input type="number" value={draft?.performance?.[key] || 0} onChange={(event) => update('performance', { ...draft?.performance, [key]: Number(event.target.value) })} /></div>
                      ))}
                    </div>
                  ) : null}
                  {id === 'logging' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>日志级别</Label><Select value={draft?.logging?.level || 'info'} onValueChange={(value) => update('logging', { ...draft?.logging, level: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="debug">debug</SelectItem><SelectItem value="info">info</SelectItem><SelectItem value="warn">warn</SelectItem><SelectItem value="error">error</SelectItem></SelectGroup></SelectContent></Select></div>
                      <div className="space-y-2"><Label>日志 Ring Size</Label><Input type="number" value={draft?.logging?.ring_size || 0} onChange={(event) => update('logging', { ...draft?.logging, ring_size: Number(event.target.value) })} /></div>
                      <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!draft?.logging?.dump_request_bodies} onCheckedChange={(checked) => update('logging', { ...draft?.logging, dump_request_bodies: checked === true })} />转储出站请求体（已脱敏）</label>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="api-keys" className="mt-4 space-y-4">
          <SectionCard title="为调用方创建 API Key" description="创建、启停和删除立即生效。">
            <form className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void createKey().catch((error) => toast.error((error as Error).message)) }}>
              <div className="space-y-2"><Label htmlFor="key-name">名称</Label><Input id="key-name" required maxLength={80} value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="key-value">自定义 Key（可选）</Label><Input id="key-value" type="password" minLength={16} maxLength={256} value={apiKeyValue} onChange={(event) => setApiKeyValue(event.target.value)} /></div>
              <Button type="submit">创建 API Key</Button>
            </form>
          </SectionCard>
          {context.createdKey ? <SectionCard title="密钥已创建" description="完整密钥仅在创建后展示，请立即保存。"><CodeBlock title="Environment" code={`OPENAI_API_KEY=${context.createdKey}\nOPENAI_BASE_URL=${location.origin}/v1\nOPENAI_MODEL=YOUR_MODEL`} /></SectionCard> : null}
          <SectionCard title={`访问密钥（${keys.length} 个）`} description="此处管理本机访问权限。OpenCode Go 上游密钥仍在配置中管理。">
            <TableShell columns={['名称', '密钥尾码', '状态', '创建时间', '操作']}>
              {keys.length ? keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td><td className="font-mono">{key.display}</td><td><StatusBadge tone={key.enabled ? 'success' : 'warning'}>{key.enabled ? '已启用' : '已停用'}</StatusBadge></td><td>{key.created_at ? localTime(key.created_at) : '已有配置'}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="xs" onClick={() => { setRenaming(key); setRenameValue(key.name) }}>重命名</Button>
                    <Button variant="ghost" size="xs" onClick={() => void updateKey(key.id, 'PATCH', { enabled: !key.enabled }).catch((error) => toast.error((error as Error).message))}>{key.enabled ? '停用' : '启用'}</Button>
                    <Button variant="ghost" size="xs" className="text-destructive" onClick={() => setDeleting(key)}>删除</Button>
                  </td>
                </tr>
              )) : <EmptyTable colSpan={5}>暂无 API Key</EmptyTable>}
            </TableShell>
          </SectionCard>
        </TabsContent>
        <TabsContent value="account" className="mt-4">
          <SectionCard title="更新管理账号" description="成功后撤销全部 Session，并要求重新登录。">
            <form className="max-w-md space-y-4" onSubmit={(event) => { event.preventDefault(); void updateAccount().catch((error) => toast.error((error as Error).message)) }}>
              <div className="space-y-2"><Label>新账号（留空保持）</Label><Input value={account.username} onChange={(event) => setAccount({ ...account, username: event.target.value })} /></div>
              <div className="space-y-2"><Label>当前密码</Label><Input type="password" required value={account.current} onChange={(event) => setAccount({ ...account, current: event.target.value })} /></div>
              <div className="space-y-2"><Label>新密码（留空保持，至少 10 字符）</Label><Input type="password" value={account.next} onChange={(event) => setAccount({ ...account, next: event.target.value })} /></div>
              <Button type="submit">更新并重新登录</Button>
            </form>
          </SectionCard>
        </TabsContent>
      </Tabs>
      <Dialog open={revealOpen} onOpenChange={setRevealOpen}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>敏感配置</DialogTitle><DialogDescription>仅在安全环境中查看。</DialogDescription></DialogHeader><CodeBlock code={revealed} /><DialogFooter><Button onClick={() => setRevealOpen(false)}>关闭</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent><DialogHeader><DialogTitle>重命名 API Key</DialogTitle><DialogDescription>修改 {renaming?.display} 的名称。</DialogDescription></DialogHeader><Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setRenaming(null)}>取消</Button><Button onClick={() => { if (renaming) void updateKey(renaming.id, 'PATCH', { name: renameValue }).then(() => setRenaming(null)).catch((error) => toast.error((error as Error).message)) }}>保存</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent><DialogHeader><DialogTitle>删除 API Key</DialogTitle><DialogDescription>删除“{deleting?.name}”后，使用它的应用将无法继续访问。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" onClick={() => { if (deleting) void updateKey(deleting.id, 'DELETE').then(() => setDeleting(null)).catch((error) => toast.error((error as Error).message)) }}>删除</Button></DialogFooter></DialogContent>
      </Dialog>
    </PageShell>
  )
}

function toDraft(config: Config): Draft {
  return {
    prefer: config.prefer || 'go', listen: config.listen || '', server_keys: config.server_keys || [], zen_keys: config.zen_keys || [], go_keys: config.go_keys || [], anonymous: !!config.anonymous, proxies: config.proxies || [], proxyfile: config.proxyfile || '',
    upstream: config.upstream || {}, retry: config.retry || {}, models: config.models || {}, reasoning: config.reasoning || {}, performance: config.performance || {}, logging: config.logging || {}, webui: config.webui || {},
  }
}

function mergeSecrets(existing: SecretItem[], added: string) {
  return [...existing.map((item) => ({ id: item.id })), ...parseAddedValues(added).map((value) => ({ value }))]
}
