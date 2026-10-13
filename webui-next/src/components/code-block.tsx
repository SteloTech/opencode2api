import { Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CodeBlock({ title, code, className }: { title?: string; code: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-muted/40', className)}>
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">{title || 'Code'}</div>
        <Button type="button" variant="ghost" size="xs" onClick={copy}>
          <Copy className="size-3.5" />
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto p-3 text-xs leading-relaxed">
        <code className="font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}
