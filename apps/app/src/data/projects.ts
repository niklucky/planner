export interface Project {
  id: string
  name: string
}

// Temporary — will come from the API.
export const projects: Project[] = [
  { id: 'planner', name: 'Planner' },
  { id: 'weather', name: 'Weather' },
  { id: 'notes', name: 'Notes' },
]