import { Activity, Gauge, RefreshCw, Settings, Stethoscope } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

const items = [
  { key: 'overview', label: '总览', icon: Gauge },
  { key: 'models', label: '模型', icon: Activity },
  { key: 'diagnostics', label: '诊断', icon: Stethoscope },
  { key: 'observability', label: '观测', icon: Gauge },
  { key: 'system', label: '系统', icon: Settings },
] as const

export function AppShell({ active, onNavigate, title, description, version, onRefresh, onLogout, busy, children }: {
  active: string; onNavigate: (key: string) => void; title: string; description: string; version?: string; onRefresh: () => void; onLogout: () => void; busy?: boolean; children: React.ReactNode
}) {
  const navigation = (navigate: (key: string) => void) => items.map((item) => (
    <SidebarMenuItem key={item.key}>
      <SidebarMenuButton isActive={active === item.key} tooltip={item.label} onClick={() => navigate(item.key)}>
        <item.icon /><span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  ))
  return (
    <SidebarProvider>
      <div className="min-h-svh w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-4 py-5">
            <div className="flex items-center gap-3">
              <Avatar className="size-9 rounded-lg"><AvatarFallback className="rounded-lg bg-primary text-primary-foreground">O2</AvatarFallback></Avatar>
              <div className="leading-tight"><div className="text-xs text-muted-foreground">Operator console</div><div className="font-semibold">Field Manual</div></div>
            </div>
          </SidebarHeader>
          <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{navigation(onNavigate)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
          <SidebarFooter className="px-4 py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" />Control plane live</div>
            <div className="font-mono text-xs">{version ? `version ${version}` : 'version —'}</div>
          </SidebarFooter>
        </Sidebar>
        <main className="min-h-svh border-l">
          <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="md:hidden" />
              <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-semibold">{title}</h1><p className="truncate text-xs text-muted-foreground">{description}</p></div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}><RefreshCw className={cn('size-4', busy && 'animate-spin')} />刷新</Button>
                <Button variant="ghost" size="sm" onClick={onLogout}>退出</Button>
                <SidebarTrigger className="hidden md:flex" />
              </div>
            </div>
          </header>
          <div className="p-4 lg:p-8">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  )
}
