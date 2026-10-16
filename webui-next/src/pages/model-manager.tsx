import { TableCell, TableRow } from '@/components/ui/table'
import { useEffect, useMemo, useState } from 'react'
import type { AppContext } from '@/App'
import { EmptyTable, TableShell } from '@/components/table-shell'
import { PageShell, SectionCard } from '@/components/page-shell'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { localTime, numberFormat } from '@/lib/format'
import type { ContextProbeResult, DebugKey, DebugModel } from '@/lib/types'

type Tag = 'go' | 'zen' | 'free' | 'anonymous'

const tagMeta: Record<Tag, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  go: { label: 'Go', tone: 'success' },
  zen: { label: 'Zen', tone: 'neutral' },
  free: { label: 'Free', tone: 'warning' },
  anonymous: { label: '匿名', tone: 'warning' },
}

const sourceMeta: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  override: { label: '手工覆盖', tone: 'warning' },
  catalog: { label: '能力目录', tone: 'success' },
  models_dev: { label: 'models.dev', tone: 'neutral' },
  none: { label: '未知', tone: 'danger' },
}

const protocolLabel: Record<string, string> = { chat: 'Chat Completions', responses: 'Responses', anthropic: 'Messages' }

// modelTags derives the auto tags from routing eligibility: which upstream
// pools can serve the model and whether its pricing metadata makes it free.
function modelTags(model: DebugModel): Tag[] {
  const tags: Tag[] = []
  if (model.available_go || model.key_tiers?.includes('go')) tags.push('go')
  if (model.available_zen || model.anonymous) tags.push('zen')
  if (/free/i.test(model.model)) tags.push('free')
  if (model.anonymous_eligibility?.allowed) tags.push('anonymous')
  return tags
}

function coolingUntil(key: DebugKey) {
  return key.cooldown_until && new Date(key.cooldown_until) > new Date() ? key.cooldown_until : ''
}

export function ModelManagerPage({ context }: { context: AppContext }) {
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<'all' | Tag>('all')
  const [group, setGroup] = useState<'none' | 'pool'>('pool')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState('')
  const [probing, setProbing] = useState('')
  const [probes, setProbes] = useState<Record<string, ContextProbeResult>>({})

  useEffect(() => { void context.loadDebug().catch((error) => toast.error((error as Error).message)) }, [])

  const models = context.debug?.models || []
  const resources = context.monitor?.resources
  const zenKeys = context.debug?.keys?.zen || []
  const goKeys = context.debug?.keys?.go || []
  const proxies = resources?.proxies || []

  const filtered = useMemo(() => models.filter((model) => {
    if (search && !model.model.toLowerCase().includes(search.toLowerCase())) return false
    if (activeTag !== 'all' && !modelTags(model).includes(activeTag)) return false
    return true
  }), [models, search, activeTag])

  const groups = useMemo(() => {
    if (group === 'none') return [{ key: 'all', title: '', description: '', items: filtered }]
    const buckets: Record<'go' | 'zen' | 'anonymous' | 'other', DebugModel[]> = { go: [], zen: [], anonymous: [], other: [] }
    for (const model of filtered) {
      const tags = modelTags(model)
      if (tags.includes('go')) buckets.go.push(model)
      if (tags.includes('zen')) buckets.zen.push(model)
      if (tags.includes('anonymous')) buckets.anonymous.push(model)
      if (!tags.includes('go') && !tags.includes('zen') && !tags.includes('anonymous')) buckets.other.push(model)
    }
    const result = [
      { key: 'go', title: 'Go 池', description: '由 OpenCode Go Key 服务', items: buckets.go },
      { key: 'zen', title: 'Zen 池', description: '由 Zen Key 或公共凭证服务', items: buckets.zen },
      { key: 'anonymous', title: '匿名通道', description: '零价、可用公共凭证无 Key 调用', items: buckets.anonymous },
    ]
    if (buckets.other.length) result.push({ key: 'other', title: '其它', description: '未匹配到任何上游池（未在目录中声明可用）', items: buckets.other })
    return result
  }, [filtered, group])

  const anonymousEnabled = resources?.anonymous ?? context.config?.anonymous ?? false
  const anonymousEligible = models.filter((model) => model.anonymous_eligibility?.allowed).length
  const overridden = models.filter((model) => model.context?.override).length

  const draftValue = (model: DebugModel) => {
    if (drafts[model.model] !== undefined) return drafts[model.model]
    return model.context?.override ? String(model.context.override) : ''
  }

  const isDirty = (model: DebugModel) => {
    if (drafts[model.model] === undefined) return false
    return drafts[model.model].trim() !== (model.context?.override ? String(model.context.override) : '')
  }

  const save = async (model: DebugModel, value: number) => {
    setSaving(model.model)
    try {
      await context.request('/api/models/context', { method: 'POST', body: JSON.stringify({ model: model.model, context: value }) })
      await context.loadDebug()
      setDrafts((current) => { const next = { ...current }; delete next[model.model]; return next })
      toast.success(value > 0 ? `${model.model} 上下文覆盖已设为 ${numberFormat(value)}` : `${model.model} 已恢复目录值`)
    } catch (error) { toast.error((error as Error).message) } finally { setSaving('') }
  }

  const runProbe = async (model: DebugModel) => {
    if (probing) return
    setProbing(model.model)
    try {
      const result = await context.request<ContextProbeResult>('/api/models/context-probe', { method: 'POST', body: JSON.stringify({ model: model.model }) })
      setProbes((current) => ({ ...current, [model.model]: result }))
      if (result.measured) toast.success(`${model.model} 实测可接受上限约 ${numberFormat(result.measured)} tokens`)
      else toast.message(result.message || '实测未得到结果')
    } catch (error) { toast.error((error as Error).message) } finally { setProbing('') }
  }

  const poolKeyList = (keys: DebugKey[]) => keys.length ? (
    <ul className="space-y-1">
      {keys.map((key, index) => {
        const cooling = coolingUntil(key)
        return (
          <li key={key.id || index} className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">{key.display || key.id?.slice(0, 10) || '—'}</span>
            <StatusBadge tone={cooling ? 'warning' : 'success'}>{cooling ? `冷却至 ${localTime(cooling)}` : '可用'}</StatusBadge>
          </li>
        )
      })}
    </ul>
  ) : <p className="text-sm text-muted-foreground">尚未配置</p>

  return (
    <PageShell title="模型管理" description="按上游池与标签分组查看模型，校正被虚报的上下文窗口，并实测真实上限。">
      <SectionCard title="上游池" description="三个上游通道的 Key 与代理绑定状态。免费模型默认走匿名通道，失败后回退到已配置的 Key。">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between"><span className="font-medium">Zen 池</span><StatusBadge tone={zenKeys.length ? 'success' : 'neutral'}>{zenKeys.length} 个 Key</StatusBadge></div>
            {poolKeyList(zenKeys)}
          </div>
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between"><span className="font-medium">Go 池</span><StatusBadge tone={goKeys.length ? 'success' : 'neutral'}>{goKeys.length} 个 Key</StatusBadge></div>
            {poolKeyList(goKeys)}
          </div>
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between"><span className="font-medium">匿名通道</span><StatusBadge tone={anonymousEnabled ? 'success' : 'neutral'}>{anonymousEnabled ? '已启用' : '未启用'}</StatusBadge></div>
            <p className="text-sm text-muted-foreground">{anonymousEligible} 个模型符合匿名资格，经 {proxies.length} 个代理出口。</p>
            <p className="text-xs text-muted-foreground">代理节点：{proxies.length ? proxies.map((proxy) => `${proxy.address || `#${proxy.index}`}${proxy.healthy ? '' : '（异常）'}`).join('、') : '直连'}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={`模型目录（${filtered.length} / ${models.length}）`}
        description={`自动标签来自路由资格；${overridden} 个模型带手工上下文覆盖。覆盖只影响 /v1/models 展示，不影响路由。`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-48" placeholder="搜索模型…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select value={group} onValueChange={(value) => setGroup(value as 'none' | 'pool')}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pool">按上游池分组</SelectItem>
                <SelectItem value="none">不分组</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['all', 'go', 'zen', 'free', 'anonymous'] as const).map((tag) => (
            <Button key={tag} size="xs" variant={activeTag === tag ? 'default' : 'outline'} onClick={() => setActiveTag(tag)}>
              {tag === 'all' ? '全部' : tagMeta[tag].label}
            </Button>
          ))}
        </div>
        <div className="space-y-6">
          {!models.length || !filtered.length ? (
            <TableShell columns={['模型', '标签', '协议', '上下文', '覆盖', '实测']}>
              <EmptyTable colSpan={6}>{models.length ? '没有匹配的模型。' : '模型目录尚未就绪，请稍后刷新。'}</EmptyTable>
            </TableShell>
          ) : groups.map((bucket) => (
            <div key={bucket.key} className="space-y-2">
              {bucket.title ? (
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold">{bucket.title}</h3>
                  <span className="text-xs text-muted-foreground">{bucket.description} · {bucket.items.length}</span>
                </div>
              ) : null}
              <TableShell columns={['模型', '标签', '协议', '上下文', '覆盖', '实测']}>
                {bucket.items.length ? bucket.items.map((model) => {
                  const info = model.context
                  const source = sourceMeta[info?.source || 'none'] || sourceMeta.none
                  const probe = probes[model.model]
                  const dirty = isDirty(model)
                  return (
                    <TableRow key={model.model}>
                      <TableCell className="font-mono whitespace-normal break-words">
                        <span className="block">{model.model}</span>
                        {model.route_error ? <span className="mt-1 block text-xs font-normal text-destructive">{model.route_error}</span> : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {modelTags(model).map((tag) => <StatusBadge key={tag} tone={tagMeta[tag].tone}>{tagMeta[tag].label}</StatusBadge>)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{protocolLabel[model.native_protocol] || model.native_protocol}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="tabular-nums">{info?.window ? numberFormat(info.window) : '—'}</span>
                        <StatusBadge className="ml-2" tone={source.tone}>{source.label}</StatusBadge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Input
                            className="w-28"
                            inputMode="numeric"
                            placeholder={info?.window ? numberFormat(info.window) : '未设置'}
                            value={draftValue(model)}
                            onChange={(event) => setDrafts((current) => ({ ...current, [model.model]: event.target.value.replace(/[^0-9]/g, '') }))}
                          />
                          <Button size="xs" disabled={!dirty || saving === model.model} onClick={() => void save(model, Number(draftValue(model) || 0))}>{saving === model.model ? '保存中…' : '保存'}</Button>
                          {info?.override ? <Button size="xs" variant="ghost" disabled={saving === model.model} onClick={() => void save(model, 0)}>清除</Button> : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Button size="xs" variant="outline" disabled={probing !== ''} onClick={() => void runProbe(model)}>{probing === model.model ? '实测中…' : '实测上下文'}</Button>
                          {probe ? (
                            probe.measured ? (
                              <>
                                <span className="text-xs text-muted-foreground">≈ {numberFormat(probe.measured)}{probe.reached_upper ? '+' : ''}</span>
                                <Button size="xs" variant="ghost" onClick={() => { setDrafts((current) => ({ ...current, [model.model]: String(probe.measured) })); toast.message('已填入覆盖，点击保存生效') }}>填入</Button>
                              </>
                            ) : <span className="text-xs text-muted-foreground">{probe.message || '未测出'}</span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                }) : <EmptyTable colSpan={6}>该分组下没有匹配的模型。</EmptyTable>}
              </TableShell>
            </div>
          ))}
        </div>
      </SectionCard>
    </PageShell>
  )
}

export default ModelManagerPage
