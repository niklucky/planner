import { Callout, List, Text } from '@planner/frontend'
import type { ReleaseDiff } from '@planner/shared'

/** What serving a release would change in an environment, compared with what it serves now. */
export function ReleaseChanges({ diff, environment }: { diff: ReleaseDiff; environment: string }) {
  if (diff.first) return <Text>Nothing is live in {environment} yet.</Text>
  const lines: string[] = []
  if (diff.addedPages.length) lines.push(`New pages: ${diff.addedPages.join(', ')}`)
  if (diff.removedPages.length) lines.push(`Removed pages: ${diff.removedPages.join(', ')}`)
  if (diff.reordered) lines.push('Pages are in a new order')
  for (const c of diff.changedPages) {
    lines.push(`${c.id} changed in ${c.locales.length > 5 ? `${c.locales.length} languages` : c.locales.join(', ')}`)
  }
  if (diff.defaultButtons.length)
    lines.push(
      `Default buttons changed in ${diff.defaultButtons.length > 5 ? `${diff.defaultButtons.length} languages` : diff.defaultButtons.join(', ')}`,
    )
  if (diff.addedLocales.length) lines.push(`New languages: ${diff.addedLocales.join(', ')}`)
  if (diff.removedLocales.length) lines.push(`Languages no longer live: ${diff.removedLocales.join(', ')}`)
  if (lines.length === 0) return <Text>Same content as {environment} serves now.</Text>
  return (
    <Callout title={`Changes from what ${environment} serves now`}>
      <List>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </List>
    </Callout>
  )
}
