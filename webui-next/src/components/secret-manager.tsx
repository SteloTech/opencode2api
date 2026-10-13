import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { SecretItem } from '@/lib/types'

export function SecretManager({
  label,
  items,
  onRemove,
  added,
  onAddedChange,
  textarea = true,
  placeholder = '每行新增一个值',
}: {
  label: string
  items: SecretItem[]
  onRemove: (id: string) => void
  added: string
  onAddedChange: (value: string) => void
  textarea?: boolean
  placeholder?: string
}) {
  const id = `secret-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge key={item.id} variant="secondary" className="gap-1 pr-1 font-mono">
              {item.display}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`移除 ${item.display}`}
                onClick={() => onRemove(item.id)}
              >
                <X className="size-3" />
              </Button>
            </Badge>
          ))}
        </div>
      ) : null}
      {textarea ? (
        <Textarea id={id} value={added} onChange={(event) => onAddedChange(event.target.value)} placeholder={placeholder} spellCheck={false} />
      ) : (
        <Input id={id} value={added} onChange={(event) => onAddedChange(event.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

export function parseAddedValues(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}
