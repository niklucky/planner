import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { TranslationIntegration } from '../../../../../components/translation-integration'
import { useIntegration } from '../../../../../lib/use-integration'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/integrations/translation')({
  component: TranslationTab,
})

function TranslationTab() {
  const project = projectRoute.useLoaderData()
  return <TranslationIntegration projectId={project.id} integration={useIntegration(project.id, 'translation')} />
}
