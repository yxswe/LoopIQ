import type { ReactNode } from 'react'
import { useRoute } from './useRoute'

export type RouteDef = {
  path: string
  element: ReactNode
}

export const Router = ({ routes, fallback }: { routes: RouteDef[]; fallback: ReactNode }) => {
  const route = useRoute()
  for (const r of routes) {
    if (r.path === route) return <>{r.element}</>
    if (r.path.endsWith('/*') && route.startsWith(r.path.slice(0, -2))) {
      return <>{r.element}</>
    }
  }
  return <>{fallback}</>
}
