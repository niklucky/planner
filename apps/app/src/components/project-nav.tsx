import { SubNav } from '@planner/frontend'
import type { Project } from '@planner/shared'
import { ChartColumn, Home, Plug, Presentation, Store, Users } from 'lucide-react'
import { NavLink } from './nav-link'

export function ProjectNav({ project }: { project: Project }) {
  const params = { projectId: project.id }
  return (
    <SubNav title={project.name}>
      <NavLink to="/projects/$projectId" params={params} icon={<Home />} activeOptions={{ exact: true }}>
        Overview
      </NavLink>
      <NavLink to="/projects/$projectId/stores" params={params} icon={<Store />}>
        Stores
      </NavLink>
      <NavLink to="/projects/$projectId/onboardings" params={params} icon={<Presentation />}>
        Onboardings
      </NavLink>
      <NavLink to="/projects/$projectId/analytics" params={params} icon={<ChartColumn />}>
        Analytics
      </NavLink>
      <NavLink to="/projects/$projectId/integrations" params={params} icon={<Plug />}>
        Integrations
      </NavLink>
      <NavLink to="/projects/$projectId/members" params={params} icon={<Users />}>
        Members
      </NavLink>
    </SubNav>
  )
}
