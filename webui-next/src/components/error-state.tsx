import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

export function ErrorState({ title = '读取失败', message }: { title?: string; message?: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message || '请稍后重试，或检查管理服务状态。'}</AlertDescription>
    </Alert>
  )
}
