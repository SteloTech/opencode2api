import { useId, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SecretItem } from '@/lib/types'

export function SecretManager({ label, items, onRemove, onAdd, disabled = false, placeholder = '每行输入一个值' }: {
  label: string
  items: SecretItem[]
  onRemove: (id: string) => Promise<void>
  onAdd: (values: string[]) => Promise<void>
  disabled?: boolean
  placeholder?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState('')
  const [removing, setRemoving] = useState<SecretItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    const values = parseAddedValues(added)
    if (!values.length) { setError('请至少输入一个值'); return }
    setBusy(true); setError('')
    try { await onAdd(values); setAdded(''); setOpen(false) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!removing) return
    setBusy(true); setError('')
    try { await onRemove(removing.id); setRemoving(null) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label} <span className="text-xs text-muted-foreground">{items.length} 项</span></span>
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => { setError(''); setOpen(true) }}><Plus className="size-3.5" />添加</Button>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader><TableRow><TableHead className="w-[72%]">值</TableHead><TableHead className="w-[28%] text-right">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.length ? items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="break-all font-mono">{item.display}</TableCell>
                <TableCell className="text-right"><Button type="button" variant="ghost" size="xs" className="text-destructive" disabled={disabled || busy} onClick={() => { setError(''); setRemoving(item) }}><Trash2 className="size-3.5" />移除</Button></TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={2} className="h-16 text-center text-muted-foreground">暂无配置项</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); setError(''); if (!value) setAdded('') } }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader><DialogTitle>添加 {label}</DialogTitle><DialogDescription>每行一个值，支持批量添加。保存后立即生效。</DialogDescription></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="space-y-4">
            <div className="space-y-2"><Label htmlFor={id}>新增值</Label><Textarea id={id} autoFocus required value={added} onChange={(event) => setAdded(event.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off" disabled={busy} className="min-h-32 font-mono" /></div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setAdded(''); setError('') }}>取消</Button><Button type="submit" disabled={busy || disabled}>{busy ? '正在保存…' : '添加并保存'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!removing} onOpenChange={(value) => { if (!value && !busy) { setRemoving(null); setError('') } }}>
        <DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>移除 {label}</DialogTitle><DialogDescription>确定移除 {removing?.display}？保存后立即生效。</DialogDescription></DialogHeader>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>取消</Button><Button variant="destructive" disabled={busy || disabled} onClick={() => void remove()}>{busy ? '正在移除…' : '确认移除'}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  )
}

export function parseAddedValues(value: string) {
  return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]
}
