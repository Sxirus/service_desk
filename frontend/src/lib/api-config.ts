export const getApiUrl = (path: string): string => {
  // Prefer explicit env vars. For SSR prefer INTERNAL_API_URL, then PUBLIC_API_URL,
  // and finally fall back to localhost to avoid resolving Docker service names
  // like `backend` when running the dev server locally.
  let baseUrl = import.meta.env.SSR
    ? (import.meta.env.INTERNAL_API_URL || import.meta.env.PUBLIC_API_URL || 'http://localhost:3000')
    : (import.meta.env.PUBLIC_API_URL || 'http://localhost:3000'); // Browser fallback

  // Strip trailing slash
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  // Strip trailing /api if it exists, because we add it explicitly in the path
  if (baseUrl.endsWith('/api')) {
    baseUrl = baseUrl.slice(0, -4);
  }

  // Ensure path starts with / if not empty
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
