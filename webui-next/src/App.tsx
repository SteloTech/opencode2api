import { useCallback, useEffect, useMemo, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { api, type ApiError } from '@/lib/api'
import type { APIKey, AvailabilityModel, Config, DebugData, LogEvent, MonitorData, PlaygroundResult, QuotaData, RotationData, Session } from '@/lib/types'
import { AppShell } from '@/components/app-shell'
import { LoginPage } from '@/pages/login'
import { DiagnosticsPage } from '@/pages/diagnostics'
import { ModelsPage } from '@/pages/models'
import { ObservabilityPage } from '@/pages/observability'
import { OverviewPage } from '@/pages/overview'
import { SystemPage } from '@/pages/system'

const redirects: Record<string, string> = {
  overview: '/overview/status', guide: '/overview/checklist', access: '/overview/access', usage: '/observability/usage', playground: '/diagnostics/playground', diagnostics: '/diagnostics/routing', config: '/system/config', logs: '/observability/logs', account: '/system/account', 'model-quotas': '/models/catalog', 'api-keys': '/system/api-keys', rotation: '/models/rotation', availability: '/models/availability',
}

type Workspace = 'overview' | 'models' | 'diagnostics' | 'observability' | 'system'
const workspaceMeta: Record<Workspace, { title: string; description: string }> = {
  overview: { title: '总览', description: '检查运行状态、完成上线流程并复制接入示例。' },
  models: { title: '模型', description: '管理模型目录、额度、免费可用性与轮转策略。' },
  diagnostics: { title: '诊断', description: '发送诊断请求，理解模型规则与实际上游链路。' },
  observability: { title: '观测', description: '查看 Token 使用趋势与实时结构化事件。' },
  system: { title: '系统', description: '维护网关配置、访问密钥与管理账号。' },
}

function readPath(): string {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''))
  const legacy = redirects[raw]
  if (legacy) return `/${legacy}`
  return raw.startsWith('/') ? raw : '/overview/status'
}

export default function App() {
  const [csrf, setCsrf] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [path, setPath] = useState(readPath)
  const [config, setConfig] = useState<Config | null>(null)
  const [monitor, setMonitor] = useState<MonitorData | null>(null)
  const [debug, setDebug] = useState<DebugData | null>(null)
  const [lastPlayground, setLastPlayground] = useState<PlaygroundResult | null>(null)
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [quotaData, setQuotaData] = useState<QuotaData | null>(null)
  const [rotation, setRotation] = useState<RotationData | null>(null)
  const [availability, setAvailability] = useState<AvailabilityModel[]>([])
  const [createdKey, setCreatedKey] = useState('')
  const [busy, setBusy] = useState(false)

  const request = useCallback(async <T,>(target: string, options: RequestInit = {}) => {
    try { return await api<T>(target, options, csrf) } catch (error) {
      if ((error as ApiError).status === 401) { setAuthenticated(false); setCsrf('') }
      throw error
    }
  }, [csrf])
  const loadConfig = useCallback(async () => setConfig(await request<Config>('/api/config')), [request])
  const loadMonitor = useCallback(async () => setMonitor(await request<MonitorData>('/api/monitor')), [request])
  const loadDebug = useCallback(async () => {
    const data = await request<DebugData>('/api/debug/models')
    setDebug(data)
    if (data.last_inference) setLastPlayground(data.last_inference)
  }, [request])
  const refreshCore = useCallback(async (silent = false) => {
    setBusy(true)
    try { await Promise.all([loadConfig(), loadMonitor(), loadDebug()]); if (!silent) toast.success('状态已刷新') } catch (error) { if (!silent) toast.error((error as Error).message) } finally { setBusy(false) }
  }, [loadConfig, loadDebug, loadMonitor])

  useEffect(() => {
    api<Session>('/api/auth/session').then((session) => { setCsrf(session.csrf_token); setAuthenticated(true) }).catch(() => setAuthenticated(false))
  }, [])
  useEffect(() => { if (authenticated) void refreshCore(true) }, [authenticated, refreshCore])
  useEffect(() => {
    if (!authenticated) return
    const timer = window.setInterval(() => { if (!document.hidden) void loadMonitor().catch(() => undefined) }, 3000)
    return () => window.clearInterval(timer)
  }, [authenticated, loadMonitor])
  useEffect(() => {
    const onHash = () => setPath(readPath())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    if (!authenticated || path !== '/observability/logs') return
    const source = new EventSource('/api/logs/stream')
    source.onmessage = (event) => {
      if (event.data === 'ping') return
      try {
        setLogs((current) => {
          const next = [...current, JSON.parse(event.data) as LogEvent]
          return next.length > 2000 ? next.slice(next.length - 2000) : next
        })
      } catch { /* ignore malformed event */ }
    }
    source.addEventListener('gap', () => toast.error('较早日志已从内存清除'))
    return () => source.close()
  }, [authenticated, path])

  const context = useMemo(() => ({ request, config, monitor, debug, lastPlayground, setLastPlayground, logs, quotaData, setQuotaData, apiKeys, setApiKeys, rotation, setRotation, availability, setAvailability, loadConfig, loadDebug, loadMonitor, refreshCore, createdKey, setCreatedKey, busy }), [apiKeys, availability, busy, config, createdKey, debug, lastPlayground, loadConfig, loadDebug, loadMonitor, logs, monitor, quotaData, refreshCore, request, rotation])
  const workspace = (path.split('/')[1] || 'overview') as Workspace
  const meta = workspaceMeta[workspace] || workspaceMeta.overview

  if (!authenticated) return <><LoginPage onSession={(session) => { setCsrf(session.csrf_token); setAuthenticated(true) }} /><Toaster richColors position="top-right" /></>

  return (
    <TooltipProvider>
      <AppShell active={workspace} onNavigate={(next) => { history.replaceState(null, '', `#/${next}/status`); setPath(`/${next}/status`) }} title={meta.title} description={meta.description} version={monitor?.version} onRefresh={() => void refreshCore()} onLogout={() => void request('/api/auth/logout', { method: 'POST', body: '{}' }).finally(() => { setAuthenticated(false); setCsrf('') })} busy={busy}>
        {workspace === 'overview' ? <OverviewPage context={context} /> : null}
        {workspace === 'models' ? <ModelsPage context={context} /> : null}
        {workspace === 'diagnostics' ? <DiagnosticsPage context={context} /> : null}
        {workspace === 'observability' ? <ObservabilityPage context={context} /> : null}
        {workspace === 'system' ? <SystemPage context={context} /> : null}
      </AppShell>
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  )
}

export type AppContext = {
  request: <T>(path: string, options?: RequestInit) => Promise<T>
  config: Config | null; monitor: MonitorData | null; debug: DebugData | null; lastPlayground: PlaygroundResult | null; setLastPlayground: (value: PlaygroundResult | null) => void
  logs: LogEvent[]; quotaData: QuotaData | null; setQuotaData: (value: QuotaData | null) => void; apiKeys: APIKey[]; setApiKeys: (keys: APIKey[]) => void; rotation: RotationData | null; setRotation: (value: RotationData | null) => void; availability: AvailabilityModel[]; setAvailability: (models: AvailabilityModel[]) => void
  loadConfig: () => Promise<void>; loadDebug: () => Promise<void>; loadMonitor: () => Promise<void>; refreshCore: (silent?: boolean) => Promise<void>; createdKey: string; setCreatedKey: (value: string) => void; busy: boolean
}
