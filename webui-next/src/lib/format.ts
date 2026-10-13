export const numberFormat = (value?: number | null) => Number(value || 0).toLocaleString()
export const localTime = (value?: string | null) =>
  value && !value.startsWith('0001-')
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '—'
export const localClock = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : '—'
export const percent = (value?: number | null) => `${((value || 0) * 100).toFixed(1)}%`
export function formatResult(result: unknown) {
  return JSON.stringify(result ?? {}, null, 2)
}
