export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export interface Session {
  csrf_token: string
  username?: string
}

export interface SecretItem {
  id: string
  display: string
  value?: string
}

export interface Config {
  prefer?: 'go' | 'zen'
  listen?: string
  server_keys?: SecretItem[]
  zen_keys?: SecretItem[]
  go_keys?: SecretItem[]
  anonymous?: boolean
  proxies?: SecretItem[]
  proxyfile?: string
  upstream?: { zen?: string; go?: string }
  retry?: { max_attempts?: number; timeout_seconds?: number }
  models?: { refresh_seconds?: number; protocols?: Record<string, string> }
  reasoning?: { effort?: string; effort_by_model?: Record<string, string> }
  performance?: {
    max_idle_conns?: number
    max_idle_conns_per_host?: number
    max_conns_per_host?: number
    idle_conn_timeout_seconds?: number
    connect_timeout_seconds?: number
    failure_cooldown_seconds?: number
    attempt_timeout_seconds?: number
    first_event_timeout_seconds?: number
  }
  logging?: {
    level?: string
    ring_size?: number
    dump_request_bodies?: boolean
  }
  webui?: { enabled?: boolean; listen?: string; username?: string; session_ttl_minutes?: number }
  restart_required_fields?: string[]
  effective?: { listen?: string; webui_listen?: string }
}

export interface MonitorData {
  version: string
  metrics: {
    active_requests?: number
    active_streams?: number
    last_hour: {
      total?: number
      success_rate?: number
      p95_ms?: number
    }
    series?: Array<{
      minute: string
      input_tokens?: number
      output_tokens?: number
      total_tokens?: number
    }>
  }
  resources: {
    proxies?: Array<{ display?: string; healthy?: boolean; bound?: string }>
    keys?: Array<{ display?: string; tier?: string; cooling?: boolean }>
    metadata?: Metadata
  }
  usage?: {
    last_hour?: {
      coverage?: number
      tokens?: {
        total_tokens?: number
        cached_tokens?: number
        reasoning_tokens?: number
      }
      models?: Record<string, { input_tokens?: number; output_tokens?: number; total_tokens?: number }>
      tiers?: Record<string, { total_tokens?: number }>
    }
  }
  upstream?: {
    requests?: UpstreamRequest[]
    recent?: UpstreamAttempt[]
    by_endpoint?: Record<string, { total?: number; success?: number }>
    by_model?: Record<string, { total?: number; success?: number }>
    by_tier?: Record<string, { total?: number; success?: number }>
    by_status?: Record<string, { total?: number; success?: number }>
  }
}

export interface Metadata {
  ready?: boolean
  models?: number
  updated_at?: string
  stale?: boolean
  next_refresh?: string
  last_error?: string
}

export interface DebugModel {
  model: string
  native_protocol: string
  protocol_source: string
  anonymous?: boolean
  available_go?: boolean
  available_zen?: boolean
  key_tiers?: string[]
  route_error?: string
  anonymous_eligibility?: {
    allowed?: boolean
    source?: string
    input_cost?: number
    output_cost?: number
  }
}

export interface DebugKey {
  id: string
  display: string
  cooldown_until?: string
}

export interface DebugData {
  metadata?: Metadata
  models?: DebugModel[]
  keys?: { zen?: DebugKey[]; go?: DebugKey[] }
  last_inference?: PlaygroundResult
}

export interface PlaygroundResult {
  ok: boolean
  http_status: number
  duration_ms: number
  request_id?: string
  response?: Json
  key_test?: string
  selected_key?: { tier: string; id: string; display: string }
  route?: {
    model?: string
    tier?: string
    anonymous?: boolean
    key_id?: string
    native_protocol?: string
    anonymous_eligibility?: { allowed?: boolean; source?: string }
  }
}

export interface UpstreamRequest {
  time: string
  request_id: string
  model: string
  tier?: string
  channel: string
  key_id?: string
  attempts?: number
  status?: number | string
  outcome?: string
  success?: boolean
  duration_ms?: number
}

export interface UpstreamAttempt {
  time: string
  request_id: string
  model: string
  tier: string
  channel: string
  key_id: string
  proxy_node?: string
  status?: number | string
  outcome?: string
  success?: boolean
  duration_ms?: number
}

export interface LogEvent {
  time: string
  level: string
  component?: string
  message: string
  fields?: Record<string, Json>
}

export interface QuotaWindow {
  remaining_percent: number
  resets_at: string
  status?: string
}

export interface QuotaAccount {
  id: string
  display: string
  status?: string
  fetched_at?: string
  error?: string
  windows?: Record<'rolling' | 'weekly' | 'monthly', QuotaWindow>
}

export interface QuotaModel {
  id: string
  protocol: string
}

export interface QuotaData {
  accounts: QuotaAccount[]
  models: QuotaModel[]
  catalog?: { updated_at?: string; stale?: boolean }
}

export interface APIKey {
  id: string
  name: string
  display: string
  enabled: boolean
  created_at?: string
}

export interface RotationGroup {
  id: string
  alias: string
  order: string[]
  current?: string
  paused?: Record<string, string>
  available?: Record<string, boolean>
  switches?: Array<{ time: string; from: string; to: string; reason: string }>
}

export interface RotationData {
  groups: RotationGroup[]
  first_output_seconds: number
  attempts?: Array<{
    time: string
    request: string
    alias: string
    model: string
    number: number
    outcome: string
  }>
  persistence_error?: string
}

export interface AvailabilityModel {
  model: string
  disabled?: boolean
  channel?: string
  reason?: string
  manual?: boolean
  checked_at?: string
  next_check?: string
  auto_effort?: { effort?: string }
  effort_checked_at?: string
}
