function deploymentBasePath(baseUrl: string) {
  const path = new URL(baseUrl, 'https://baka-award.invalid').pathname
  return path === '/' ? '/' : `${path.replace(/\/+$/, '')}/`
}

export function appPathFromLocation(pathname: string, baseUrl: string) {
  const basePath = deploymentBasePath(baseUrl)
  if (basePath === '/') return pathname || '/'
  const baseWithoutSlash = basePath.slice(0, -1)
  if (pathname === baseWithoutSlash) return '/'
  if (pathname.startsWith(basePath)) return `/${pathname.slice(basePath.length)}`
  return pathname || '/'
}

export function appHref(path: string, baseUrl: string) {
  const basePath = deploymentBasePath(baseUrl)
  const route = path.replace(/^\/+/, '')
  return route ? `${basePath}${route}` : basePath
}
