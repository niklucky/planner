import { NavItem, TextLink } from '@planner/frontend'
import { type LinkComponent, createLink } from '@tanstack/react-router'

const CreatedNavLink = createLink(NavItem)
const CreatedTextLink = createLink(TextLink)

/** Sidebar row link. */
export const NavLink: LinkComponent<typeof NavItem> = (props) => <CreatedNavLink preload="intent" {...props} />

/** Inline text link. */
export const AppLink: LinkComponent<typeof TextLink> = (props) => <CreatedTextLink preload="intent" {...props} />
