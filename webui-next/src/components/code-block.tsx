import { Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CodeBlock({ title, code, className }: { title?: string; code: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code)
      } else {
        const input = document.createElement('textarea')
        input.value = code
        input.style.position = 'fixed'
        input.style.opacity = '0'
        // Keep the temporary input inside an active modal's focus scope.
        const previous = document.activeElement as HTMLElement | null
        const target = previous?.closest('[role="dialog"]') || document.body
        target.appendChild(input)
        try { input.focus(); input.select(); if (!document.execCommand('copy')) throw new Error('copy failed') }
        finally { input.remove(); previous?.focus() }
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
      toast.error('复制失败，请手动选择并复制')
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
