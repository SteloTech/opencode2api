import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground">{items.length} 项</span>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[72%]">值</TableHead>
              <TableHead className="w-[28%] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length ? (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">{item.display}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-destructive"
                      onClick={() => onRemove(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                      移除
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="h-16 text-center text-muted-foreground">
                  暂无配置项
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Plus className="size-3.5" />
          新增
        </div>
        {textarea ? (
          <Textarea
            id={id}
            value={added}
            onChange={(event) => onAddedChange(event.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            className="min-h-24 font-mono"
          />
        ) : (
          <Input
            id={id}
            value={added}
            onChange={(event) => onAddedChange(event.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            className="font-mono"
          />
        )}
      </div>
    </div>
  )
}

export function parseAddedValues(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}
