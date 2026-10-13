import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import type { Session } from '@/lib/types'

export function LoginPage({ onSession }: { onSession: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      onSession(await api<Session>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-4">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_1fr]">
        <section className="hidden flex-col justify-center gap-6 lg:flex">
          <div className="inline-flex w-fit rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
            O2 · OPENCODE GATEWAY
          </div>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            把协议、路由与运行状态放在一张桌面上。
          </h1>
          <p className="max-w-xl text-muted-foreground">
            一个无外部前端依赖的本地控制面。配置、检查、接入，然后让 Gateway 保持可解释。
          </p>
          <div className="font-mono text-sm text-muted-foreground">CHAT · RESPONSES · ANTHROPIC</div>
        </section>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">管理登录</CardTitle>
            <CardDescription>Restricted console · Operator field manual</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="login-user">账号</Label>
                <Input
                  id="login-user"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-pass">密码</Label>
                <Input
                  id="login-pass"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" disabled={loading}>
                {loading ? '登录中…' : '进入 Field Manual'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
