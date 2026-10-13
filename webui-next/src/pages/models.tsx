import { useEffect, useState } from 'react'
import type { AppContext } from '@/App'
import { EmptyTable, TableShell } from '@/components/table-shell'
import { PageShell, SectionCard } from '@/components/page-shell'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { localTime } from '@/lib/format'
import type { QuotaData, RotationData } from '@/lib/types'

const rotationReasons: Record<string, string> = {
  success: '成功', client_canceled: '调用方取消', quota_or_rate_limit: '额度不足 / 限流', transport_error: '连接错误', first_output_timeout: '首个输出超时', stream_error: '输出中断', response_read_error: '读取响应失败', response_conversion_error: '响应解析或转换失败', request_conversion_error: '请求转换失败', upstream_error: '上游错误',
}

export function ModelsPage({ context }: { context: AppContext }) {
  const [quota, setQuota] = useState<QuotaData | null>(null)
  const [quotaAccount, setQuotaAccount] = useState('')
  const [quotaLoading, setQuotaLoading] = useState(false)
  const [quotaSearch, setQuotaSearch] = useState('')
  const [rotation, setRotation] = useState<RotationData | null>(null)
  const [rotationTimeout, setRotationTimeout] = useState('30')
  const [availability, setAvailability] = useState(context.availability)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')

  const loadQuota = async () => {
    setQuotaLoading(true)
    try { setQuota(await context.request<QuotaData>('/api/model-quotas')) } catch (error) { toast.error((error as Error).message) } finally { setQuotaLoading(false) }
  }
  const loadRotation = async () => {
    const data = await context.request<RotationData>('/api/rotation')
    setRotation(data)
    setRotationTimeout(String(data.first_output_seconds))
  }
  const loadAvailability = async () => {
    setAvailabilityLoading(true)
    setAvailabilityError('')
    try {
      const data = await context.request<{ models: typeof availability }>('/api/models/availability')
      setAvailability(data.models)
      context.setAvailability(data.models)
    } catch (error) { setAvailabilityError((error as Error).message) } finally { setAvailabilityLoading(false) }
  }

  useEffect(() => { void loadQuota() }, [])
  useEffect(() => { void loadRotation().catch((error) => toast.error((error as Error).message)) }, [])
  useEffect(() => { void loadAvailability() }, [])

  const account = quota?.accounts.find((item) => item.id === quotaAccount) || quota?.accounts[0]
  const stale = account?.status === 'stale'
  const filteredModels = (quota?.models || []).filter((model) => model.id.toLowerCase().includes(quotaSearch.toLowerCase()))
  const windows: Array<readonly [key: 'rolling' | 'weekly' | 'monthly', label: string]> = [['rolling', '5 小时窗口'], ['weekly', '每周窗口'], ['monthly', '每月窗口']]

  const saveRotation = async () => {
    if (!rotation) return
    const body: Record<string, unknown> = { first_output_seconds: Number(rotationTimeout) }
    for (const group of rotation.groups) body[group.id] = { alias: group.alias.trim(), order: group.order }
    const data = await context.request<RotationData>('/api/rotation', { method: 'PUT', body: JSON.stringify(body) })
    setRotation(data)
    toast.success('模型轮转配置已保存并生效')
  }

  const move = (groupIndex: number, modelIndex: number, delta: number) => {
    setRotation((current) => {
      if (!current) return current
      const groups = current.groups.map((group, index) => index === groupIndex ? { ...group, order: [...group.order] } : group)
      const order = groups[groupIndex].order
      const next = modelIndex + delta
      if (next < 0 || next >= order.length) return current
      ;[order[modelIndex], order[next]] = [order[next], order[modelIndex]]
      return { ...current, groups }
    })
  }

  const selectCurrent = async (groupId: string, model: string) => {
    const data = await context.request<RotationData>('/api/rotation/current', { method: 'POST', body: JSON.stringify({ group: groupId, model }) })
    setRotation((current) => current ? { ...current, groups: current.groups.map((group) => {
      const live = data.groups.find((item) => item.id === group.id)
      return live ? { ...group, current: live.current, paused: live.paused, switches: live.switches } : group
    }), persistence_error: data.persistence_error } : data)
    toast.success('当前模型已切换')
  }

  return (
    <PageShell title="模型" description="管理模型目录、额度、免费可用性与轮转策略。">
      <Tabs defaultValue="catalog">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="catalog">目录与额度</TabsTrigger>
          <TabsTrigger value="availability">免费可用性</TabsTrigger>
          <TabsTrigger value="rotation">模型轮转</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="mt-4 space-y-4">
          <SectionCard title="OpenCode Go 套餐额度" description="实时查询，缓存 60 秒。所有模型共享套餐窗口，百分比由上游取整。" actions={<Button variant="outline" size="sm" onClick={loadQuota} disabled={quotaLoading}>{quotaLoading ? '读取中…' : '刷新额度'}</Button>}>
            <div className="max-w-sm space-y-2">
              <Label>Go Key</Label>
              <Select value={account?.id || ''} onValueChange={setQuotaAccount}>
                <SelectTrigger><SelectValue placeholder="尚未配置 Go Key" /></SelectTrigger>
                <SelectContent><SelectGroup>{(quota?.accounts || []).map((item) => <SelectItem key={item.id} value={item.id}>Go Key {item.display}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{account?.error ? `${account.error}${stale ? '；下方显示上次成功数据。' : '；当前额度未知。'}` : account ? '已连接 OpenCode · 共享套餐额度。多个 Key 的额度不相加。' : '请先在系统 / 配置中添加 OpenCode Go Key。'}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {windows.map(([id, label]) => {
                const item = account?.windows?.[id]
                return <div key={id} className="space-y-2 rounded-xl border p-4">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-2xl font-semibold tabular-nums">{item ? `≈ ${item.remaining_percent}%` : '未知'}</div>
                  <Progress value={item?.remaining_percent || 0} aria-label={`${label}剩余额度`} />
                  <div className="text-xs text-muted-foreground">{item ? `重置于 ${localTime(item.resets_at)}` : '等待上游额度数据'}</div>
                </div>
              })}
            </div>
          </SectionCard>
          <SectionCard title={`可用模型（${filteredModels.length} / ${quota?.models.length || 0}）`} description="模型名称可直接填入 OPENAI_MODEL。额度列对应选定套餐，不代表每个模型拥有独立额度。" actions={<Input className="w-48" placeholder="搜索模型名称…" value={quotaSearch} onChange={(event) => setQuotaSearch(event.target.value)} />}>
            <TableShell columns={['模型名称', '上游协议', '5 小时剩余 · 共享', '本周剩余 · 共享', '本月剩余 · 共享', '操作']}>
              {filteredModels.length ? filteredModels.map((model) => (
                <tr key={model.id}>
                  <td className="font-mono">{model.id}</td>
                  <td>{{ chat: 'Chat Completions', responses: 'Responses', anthropic: 'Messages' }[model.protocol] || model.protocol}</td>
                  {windows.map(([id]) => <td key={id}>{account?.windows?.[id] ? `≈ ${account.windows[id].remaining_percent}%${stale ? '（历史）' : ''}` : '未知'}</td>)}
                  <td><Button variant="ghost" size="xs" onClick={() => void navigator.clipboard.writeText(model.id).then(() => toast.success('已复制'))}>复制名称</Button></td>
                </tr>
              )) : <EmptyTable colSpan={6}>{quota?.models.length ? '没有匹配的模型' : '模型目录尚未就绪，请稍后刷新'}</EmptyTable>}
            </TableShell>
          </SectionCard>
        </TabsContent>
        <TabsContent value="availability" className="mt-4">
          <SectionCard title="免费模型探测" description="检查名称含 free 或元数据零价格且未弃用的模型。手动控制的模型保持启用且不再自动探测。" actions={<Button variant="outline" size="sm" onClick={loadAvailability} disabled={availabilityLoading}>{availabilityLoading ? '刷新中…' : '刷新状态'}</Button>}>
            {availabilityError ? <p className="mb-3 text-sm text-destructive">{availabilityError}</p> : null}
            <TableShell columns={['模型', '状态', '原因 / 通道', '控制', 'auto 强度', '上次探测', '下次探测', '操作']}>
              {availability.length ? availability.map((item) => (
                <tr key={item.model}>
                  <td className="font-mono">{item.model}</td>
                  <td><StatusBadge tone={item.disabled ? 'danger' : 'success'}>{item.disabled ? '已禁用' : '已启用'}</StatusBadge></td>
                  <td>{[item.channel, item.reason].filter(Boolean).join(' / ') || '待探测'}</td>
                  <td><StatusBadge tone={item.manual ? 'warning' : 'neutral'}>{item.manual ? '手动' : '自动'}</StatusBadge></td>
                  <td>{item.auto_effort?.effort ? `${item.auto_effort.effort}（${localTime(item.effort_checked_at)}）` : '未验证'}</td>
                  <td>{localTime(item.checked_at)}</td>
                  <td>{item.manual ? '手动控制' : localTime(item.next_check)}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="xs" disabled={!item.disabled} onClick={async () => { await context.request('/api/models/restore', { method: 'POST', body: JSON.stringify({ model: item.model }) }); await loadAvailability(); await context.loadDebug(); }}>恢复启用</Button>
                    <Button variant="outline" size="xs" onClick={async () => { await context.request('/api/models/manual', { method: 'POST', body: JSON.stringify({ model: item.model, manual: !item.manual }) }); await loadAvailability(); await context.loadDebug(); }}>{item.manual ? '切回自动' : '切为手动'}</Button>
                  </td>
                </tr>
              )) : <EmptyTable colSpan={8}>当前模型目录中没有符合免费资格的模型。</EmptyTable>}
            </TableShell>
          </SectionCard>
        </TabsContent>
        <TabsContent value="rotation" className="mt-4 space-y-4">
          {rotation?.persistence_error ? <p className="text-sm text-destructive">{rotation.persistence_error}</p> : null}
          {(rotation?.groups || []).map((group, groupIndex) => (
            <SectionCard key={group.id} title={group.alias || group.id} description={`当前使用 ${group.current || '—'}；成功后继续使用当前模型，错误时按顺序切换。`}>
              <TableShell columns={['顺序', '模型', '状态 / 恢复时间', '操作']}>
                {group.order.map((model, index) => {
                  const until = group.paused?.[model]
                  const paused = until && new Date(until) > new Date()
                  const available = group.available?.[model]
                  return <tr key={model}>
                    <td>{index + 1}</td><td className="font-mono">{model}</td>
                    <td>{!available ? '已下架 / 暂不可用' : paused ? `暂停至 ${localTime(until)}` : model === group.current ? '当前使用' : '可用'}</td>
                    <td className="space-x-1 whitespace-nowrap">
                      <Button variant="ghost" size="xs" onClick={() => move(groupIndex, index, -1)} disabled={index === 0}>上移</Button>
                      <Button variant="ghost" size="xs" onClick={() => move(groupIndex, index, 1)} disabled={index === group.order.length - 1}>下移</Button>
                      <Button variant="outline" size="xs" disabled={!available} onClick={() => void selectCurrent(group.id, model)}>设为当前</Button>
                    </td>
                  </tr>
                })}
                {!group.order.length ? <EmptyTable colSpan={4}>等待 Go 模型目录</EmptyTable> : null}
              </TableShell>
              {group.switches?.length ? <div className="mt-3 text-sm text-muted-foreground">{group.switches.slice(-5).reverse().map((item) => <div key={`${item.time}-${item.to}`}>{localTime(item.time)} · {item.from} → {item.to} · {rotationReasons[item.reason] || item.reason}</div>)}</div> : null}
            </SectionCard>
          ))}
          <SectionCard title="轮转设置" description="保存立即生效；调整顺序不会打断正在输出的回答。">
            <div className="max-w-sm space-y-2">
              <Label htmlFor="rotation-timeout">首个有效输出等待上限（秒）</Label>
              <Input id="rotation-timeout" type="number" min={1} max={300} value={rotationTimeout} onChange={(event) => setRotationTimeout(event.target.value)} />
            </div>
            <Button className="mt-4" onClick={() => void saveRotation().catch((error) => toast.error((error as Error).message))}>保存别名与顺序</Button>
          </SectionCard>
          <SectionCard title="最近请求尝试" description="调用分组别名后显示最近 100 次尝试。">
            <TableShell columns={['时间', '请求', '别名', '实际模型', '尝试', '结果']}>
              {(rotation?.attempts || []).slice().reverse().map((item) => (
                <tr key={`${item.request}-${item.number}`}>
                  <td>{localTime(item.time)}</td><td className="font-mono">{item.request}</td><td>{item.alias}</td><td className="font-mono">{item.model}</td><td>{item.number}</td><td>{rotationReasons[item.outcome] || item.outcome}</td>
                </tr>
              ))}
              {!rotation?.attempts?.length ? <EmptyTable colSpan={6}>暂无请求尝试</EmptyTable> : null}
            </TableShell>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

export default ModelsPage
