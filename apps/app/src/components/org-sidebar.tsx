import { Avatar, Button, Logo, Sidebar, SidebarHeader, SidebarSection, useStoredState } from '@planner/frontend'
import { LayoutGrid, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { projects } from '../data/projects'
import { NavLink } from './nav-link'
import { UserMenu } from './user-menu'

export function OrgSidebar() {
  const [collapsed, setCollapsed] = useStoredState('planner.sidebar.collapsed', false)

  return (
    <Sidebar collapsed={collapsed}>
      <SidebarSection>
        <SidebarHeader logo={<Logo>P</Logo>} title="Planner">
          <Button
            size="icon"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </SidebarHeader>
        <NavLink to="/" icon={<LayoutGrid />} activeOptions={{ exact: true }} title="Overview">
          Overview
        </NavLink>
      </SidebarSection>

      <SidebarSection scroll>
        {projects.map((p) => (
          <NavLink
            key={p.id}
            to="/projects/$projectId"
            params={{ projectId: p.id }}
            icon={<Avatar name={p.name} />}
            title={p.name}
          >
            {p.name}
          </NavLink>
        ))}
      </SidebarSection>

      <SidebarSection>
        <NavLink to="/settings" icon={<Settings />} title="Settings">
          Settings
        </NavLink>
        <UserMenu />
      </SidebarSection>
    </Sidebar>
  )
}
