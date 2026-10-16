import { TableCell, TableRow } from '@/components/ui/table'
import { useEffect, useState } from 'react'
import type { AppContext } from '@/App'
import { CodeBlock } from '@/components/code-block'
import { EmptyTable, TableShell } from '@/components/table-shell'
import { PageShell, SectionCard } from '@/components/page-shell'
import { SecretManager } from '@/components/secret-manager'
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

export default SystemPage

type Draft = Required<Pick<Config, 'prefer' | 'listen' | 'server_keys' | 'zen_keys' | 'go_keys' | 'anonymous' | 'proxies' | 'proxyfile' | 'upstream' | 'retry' | 'models' | 'reasoning' | 'performance' | 'logging' | 'webui'>>

export function SystemPage({ context }: { context: AppContext }) {
  const [tab, setTab] = useState('config')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [protocolJson, setProtocolJson] = useState<string | null>(null)
  const [contextJson, setContextJson] = useState<string | null>(null)
  const [effortJson, setEffortJson] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [revealed, setRevealed] = useState('')
  const [revealOpen, setRevealOpen] = useState(false)
  const [revealKey, setRevealKey] = useState<APIKey | null>(null)
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

  const refreshKeys = async () => {
    const [config, data] = await Promise.all([context.request<Config>('/api/config'), context.request<{ keys: APIKey[] }>('/api/api-keys')])
    setKeys(data.keys)
    setDraft((current) => current ? { ...current, server_keys: config.server_keys || [] } : toDraft(config))
    await context.loadConfig()
  }

  const saveConfig = async (config: Draft) => {
    const payload = { ...config, server_keys: mergeSecrets(config.server_keys), zen_keys: mergeSecrets(config.zen_keys), go_keys: mergeSecrets(config.go_keys), proxies: mergeSecrets(config.proxies) }
    return context.request<{ config: Config; result: { restart_required?: boolean; restart_fields?: string[] } }>('/api/config', { method: 'PUT', body: JSON.stringify(payload) })
  }

  const submitConfig = async () => {
    if (!draft || saving) return
    setSaving(true)
    try {
      const parsed = { ...draft, models: { ...draft.models, protocols: parseStringMap(protocolJson ?? JSON.stringify(draft.models.protocols || {}), '模型协议覆盖'), context: parseNumberMap(contextJson ?? JSON.stringify(draft.models.context || {}), '模型上下文覆盖') }, reasoning: { ...draft.reasoning, effort_by_model: parseStringMap(effortJson ?? JSON.stringify(draft.reasoning.effort_by_model || {}), '按模型覆盖') } }
      const result = await saveConfig(parsed)
      setProtocolJson(null); setContextJson(null); setEffortJson(null)
      setDraft(toDraft(result.config))
      await refreshKeys()
      toast.success(result.result.restart_required ? `已应用；${result.result.restart_fields?.join(', ')} 需重启` : '配置已保存并立即应用')
    } finally { setSaving(false) }
  }

  const changeSecrets = async (name: 'server_keys' | 'zen_keys' | 'go_keys' | 'proxies', values: string[] = [], removeId?: string) => {
    if (saving) throw new Error('正在保存，请稍后重试')
    setSaving(true)
    try {
      // Read the current persisted configuration so this focused operation cannot
      // overwrite unrelated unsaved edits or recently created API keys.
      const current = toDraft(await context.request<Config>('/api/config'))
      const payload = { ...current, [name]: [...mergeSecrets(current[name].filter((item) => item.id !== removeId)), ...values.map((value) => ({ value }))] }
      const result = await context.request<{ config: Config }>('/api/config', { method: 'PUT', body: JSON.stringify({ ...payload, ...Object.fromEntries(['server_keys', 'zen_keys', 'go_keys', 'proxies'].filter((key) => key !== name).map((key) => [key, mergeSecrets(current[key as typeof name])])) }) })
      setDraft((draft) => draft ? { ...draft, [name]: result.config[name] || [] } : toDraft(result.config))
      await refreshKeys()
      toast.success(removeId ? '已移除并立即生效' : '已添加并立即生效')
    } finally { setSaving(false) }
  }

  const reveal = async () => {
    if (!password || verifying) return
    setVerifying(true); setVerifyError('')
    try {
      if (revealKey) {
        const data = await context.request<{ key: string }>(`/api/api-keys/${encodeURIComponent(revealKey.id)}/reveal`, { method: 'POST', body: JSON.stringify({ password }) })
        setRevealed(data.key)
      } else {
        const data = await context.request<Record<string, string[]>>('/api/config/reveal', { method: 'POST', body: JSON.stringify({ password }) })
        setRevealed(JSON.stringify(data, null, 2))
      }
      setPassword(''); setVerifyOpen(false); setRevealOpen(true)
    } catch (error) { setVerifyError((error as Error).message) }
    finally { setVerifying(false) }
  }

  const updateKey = async (id: string, method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) => {
    const data = await context.request<{ keys: APIKey[] }>(`/api/api-keys/${encodeURIComponent(id)}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
    setKeys(data.keys)
    await refreshKeys()
    toast.success('已保存并立即生效')
  }

  const createKey = async () => {
    if (creating) return
    setCreating(true); setCreateError('')
    try {
      const data = await context.request<{ key: string; keys: APIKey[] }>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name: apiKeyName.trim(), value: apiKeyValue.trim() }) })
      setKeys(data.keys); context.setCreatedKey(data.key)
      setApiKeyName(''); setApiKeyValue(''); setCreateOpen(false)
      await refreshKeys()
      toast.success('API Key 已创建')
    } catch (error) { setCreateError((error as Error).message) }
    finally { setCreating(false) }
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
          <SectionCard title="配置中心" description="验证后原子保存，并热应用可变字段。" actions={<div className="flex gap-2"><Button variant="outline" size="sm" disabled={saving} onClick={() => void context.request('/api/config/reload', { method: 'POST', body: '{}' }).then(() => context.request<Config>('/api/config')).then((config) => { setDraft(toDraft(config)); setProtocolJson(null); setEffortJson(null); return refreshKeys() }).then(() => toast.success('已从磁盘重载')).catch((error) => toast.error((error as Error).message))}>从磁盘重载</Button><Button size="sm" disabled={saving || !draft} onClick={() => void submitConfig().catch((error) => toast.error((error as Error).message))}>验证、保存并应用</Button></div>}>
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
                        <SecretManager label="Server Keys" items={secretItems('server_keys')} disabled={saving || !draft} onAdd={(values) => changeSecrets('server_keys', values)} onRemove={(id) => changeSecrets('server_keys', [], id)} />
                        <SecretManager label="Zen Keys" items={secretItems('zen_keys')} disabled={saving || !draft} onAdd={(values) => changeSecrets('zen_keys', values)} onRemove={(id) => changeSecrets('zen_keys', [], id)} />
                        <SecretManager label="Go Keys" items={secretItems('go_keys')} disabled={saving || !draft} onAdd={(values) => changeSecrets('go_keys', values)} onRemove={(id) => changeSecrets('go_keys', [], id)} />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setRevealKey(null); setPassword(''); setVerifyError(''); setVerifyOpen(true) }}>二次验证查看</Button>
                    </div>
                  ) : null}
                  {id === 'proxy' ? (
                    <div className="space-y-4"><SecretManager label="Proxy 节点" items={secretItems('proxies')} disabled={saving || !draft} onAdd={(values) => changeSecrets('proxies', values)} onRemove={(id) => changeSecrets('proxies', [], id)} placeholder={"direct\nhttp://user:pass@host:port"} /><div className="max-w-sm space-y-2"><Label>Proxy File</Label><Input value={draft?.proxyfile || ''} onChange={(event) => update('proxyfile', event.target.value)} /></div></div>
                  ) : null}
                  {id === 'upstream' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>Zen URL</Label><Input value={draft?.upstream?.zen || ''} onChange={(event) => update('upstream', { ...draft?.upstream, zen: event.target.value })} /></div>
                      <div className="space-y-2"><Label>Go URL</Label><Input value={draft?.upstream?.go || ''} onChange={(event) => update('upstream', { ...draft?.upstream, go: event.target.value })} /></div>
                      <div className="space-y-2"><Label>每个 Key Tier 最大尝试次数</Label><Input type="number" value={draft?.retry?.max_attempts || 0} onChange={(event) => update('retry', { ...draft?.retry, max_attempts: Number(event.target.value) })} /></div>
                      <div className="space-y-2"><Label>请求超时（秒）</Label><Input type="number" value={draft?.retry?.timeout_seconds || 0} onChange={(event) => update('retry', { ...draft?.retry, timeout_seconds: Number(event.target.value) })} /></div>
                      <div className="space-y-2"><Label>模型刷新（秒）</Label><Input type="number" value={draft?.models?.refresh_seconds || 0} onChange={(event) => update('models', { ...draft?.models, refresh_seconds: Number(event.target.value) })} /></div>
                      <div className="space-y-2"><Label>模型协议覆盖（JSON）</Label><Textarea className="font-mono" value={protocolJson ?? JSON.stringify(draft?.models?.protocols || {}, null, 2)} onChange={(event) => setProtocolJson(event.target.value)} /></div>
                      <div className="space-y-2"><Label>模型上下文覆盖（JSON，单位 tokens）</Label><Textarea className="font-mono" value={contextJson ?? JSON.stringify(draft?.models?.context || {}, null, 2)} onChange={(event) => setContextJson(event.target.value)} /></div>
                    </div>
                  ) : null}
                  {id === 'reasoning' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>默认强度</Label><Select value={draft?.reasoning?.effort || 'client'} onValueChange={(value) => update('reasoning', { ...draft?.reasoning, effort: value === 'client' ? '' : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="client">跟随客户端</SelectItem><SelectItem value="auto">auto</SelectItem><SelectItem value="minimal">minimal</SelectItem><SelectItem value="low">low</SelectItem><SelectItem value="medium">medium</SelectItem><SelectItem value="high">high</SelectItem><SelectItem value="xhigh">xhigh</SelectItem><SelectItem value="max">max</SelectItem><SelectItem value="none">关闭</SelectItem></SelectGroup></SelectContent></Select></div>
                      <div className="space-y-2"><Label>按模型覆盖（JSON）</Label><Textarea className="font-mono" value={effortJson ?? JSON.stringify(draft?.reasoning?.effort_by_model || {}, null, 2)} onChange={(event) => setEffortJson(event.target.value)} /></div>
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
          <SectionCard title="为调用方创建 API Key" description="创建、启停和删除立即生效。" actions={<Button disabled={saving} onClick={() => { setCreateError(''); setCreateOpen(true) }}>创建 API Key</Button>}><p className="text-sm text-muted-foreground">访问密钥用于客户端接入；Zen / Go 上游密钥请在配置中添加。</p></SectionCard>
          <SectionCard title={`访问密钥（${keys.length} 个）`} description="此处管理本机访问权限。OpenCode Go 上游密钥仍在配置中管理。">
            <TableShell columns={['名称', '密钥尾码', '状态', '创建时间', '操作']}>
              {keys.length ? keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.name}</TableCell><TableCell className="font-mono">{key.display}</TableCell><TableCell><StatusBadge tone={key.enabled ? 'success' : 'warning'}>{key.enabled ? '已启用' : '已停用'}</StatusBadge></TableCell><TableCell>{key.created_at ? localTime(key.created_at) : '已有配置'}</TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="xs" onClick={() => { setRevealKey(key); setPassword(''); setVerifyError(''); setVerifyOpen(true) }}>查看</Button>
                    <Button variant="ghost" size="xs" onClick={() => { setRenaming(key); setRenameValue(key.name) }}>重命名</Button>
                    <Button variant="ghost" size="xs" onClick={() => void updateKey(key.id, 'PATCH', { enabled: !key.enabled }).catch((error) => toast.error((error as Error).message))}>{key.enabled ? '停用' : '启用'}</Button>
                    <Button variant="ghost" size="xs" className="text-destructive" onClick={() => setDeleting(key)}>删除</Button>
                  </TableCell>
                </TableRow>
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
      <Dialog open={createOpen} onOpenChange={(open) => { if (!creating) { setCreateOpen(open); if (!open) { setApiKeyName(''); setApiKeyValue(''); setCreateError('') } } }}>
        <DialogContent showCloseButton={!creating}><DialogHeader><DialogTitle>创建访问密钥</DialogTitle><DialogDescription>供调用方访问本网关。自定义 Key 留空时自动生成。</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void createKey() }}>
            <div className="space-y-2"><Label htmlFor="key-name">名称</Label><Input id="key-name" autoFocus required maxLength={80} disabled={creating} value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="key-value">自定义 Key（可选）</Label><Input id="key-value" type="password" autoComplete="new-password" minLength={16} maxLength={256} disabled={creating} value={apiKeyValue} onChange={(event) => setApiKeyValue(event.target.value)} /></div>
            {createError ? <p role="alert" className="text-sm text-destructive">{createError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" disabled={creating} onClick={() => { setCreateOpen(false); setApiKeyName(''); setApiKeyValue('') }}>取消</Button><Button type="submit" disabled={creating || saving}>{creating ? '正在创建…' : '创建'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!context.createdKey} onOpenChange={(open) => { if (!open) context.setCreatedKey('') }}>
        <DialogContent><DialogHeader><DialogTitle>密钥已创建</DialogTitle><DialogDescription>请复制保存，也可稍后在 API Keys 列表中验证管理密码后查看。</DialogDescription></DialogHeader><CodeBlock title="API Key" code={context.createdKey} /><DialogFooter><Button onClick={() => context.setCreatedKey('')}>已保存，关闭</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={verifyOpen} onOpenChange={(open) => { if (!verifying) { setVerifyOpen(open); if (!open) setPassword('') } }}>
        <DialogContent showCloseButton={!verifying}><DialogHeader><DialogTitle>验证管理密码</DialogTitle><DialogDescription>验证后查看完整密钥和代理配置。</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void reveal() }}><Label htmlFor="verify-password">管理密码</Label><Input id="verify-password" autoFocus type="password" required value={password} disabled={verifying} onChange={(event) => setPassword(event.target.value)} />{verifyError ? <p role="alert" className="text-sm text-destructive">{verifyError}</p> : null}<DialogFooter><Button type="button" variant="outline" disabled={verifying} onClick={() => { setVerifyOpen(false); setPassword('') }}>取消</Button><Button type="submit" disabled={verifying}>{verifying ? '正在验证…' : '验证并查看'}</Button></DialogFooter></form></DialogContent>
      </Dialog>
      <Dialog open={revealOpen} onOpenChange={(open) => { setRevealOpen(open); if (!open) setRevealed('') }}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{revealKey ? `查看密钥：${revealKey.name}` : '敏感配置'}</DialogTitle><DialogDescription>仅在安全环境中查看，关闭后清除显示内容。</DialogDescription></DialogHeader><CodeBlock title={revealKey ? 'API Key' : undefined} code={revealed} /><DialogFooter><Button onClick={() => { setRevealOpen(false); setRevealed('') }}>关闭</Button></DialogFooter></DialogContent>
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

function mergeSecrets(existing: SecretItem[]) {
  return existing.map((item) => ({ id: item.id }))
}

function parseStringMap(value: string, label: string): Record<string, string> {
  let parsed: unknown
  try { parsed = JSON.parse(value || '{}') } catch { throw new Error(`${label}需要有效的 JSON，请检查后再保存`) }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some((item) => typeof item !== 'string')) throw new Error(`${label}需要键和值均为字符串的 JSON 对象`)
  return parsed as Record<string, string>
}

function parseNumberMap(value: string, label: string): Record<string, number> {
  let parsed: unknown
  try { parsed = JSON.parse(value || '{}') } catch { throw new Error(`${label}需要有效的 JSON，请检查后再保存`) }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some((item) => typeof item !== 'number' || !Number.isFinite(item) || item <= 0)) throw new Error(`${label}需要键为模型 ID、值为正整数的 JSON 对象`)
  return parsed as Record<string, number>
}
