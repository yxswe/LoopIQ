import { useEffect, useState } from 'react'

function readHash(): string {
  const h = window.location.hash || '#/'
  return h.slice(1) // strip leading '#'
}

export function useRoute(): string {
  const [route, setRoute] = useState<string>(() => readHash())
  useEffect(() => {
    const onChange = () => setRoute(readHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path: string): void {
  if (!path.startsWith('/')) throw new Error('navigate: path must start with /')
  window.location.hash = `#${path}`
}
