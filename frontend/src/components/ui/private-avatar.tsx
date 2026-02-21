/**
 * Avatar component that automatically resolves URLs from private storage paths
 * 
 * This is a wrapper around the UI Avatar components that handles:
 * - Legacy public URLs (passed through directly)
 * - New private storage paths (resolved via signed URLs)
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAvatarUrl } from '@/hooks/use-avatar'

interface PrivateAvatarProps {
  /** The avatar path or URL (can be a storage path or a full URL) */
  src: string | null | undefined
  /** Alt text for the image */
  alt: string
  /** Fallback text (usually initials) */
  fallback: string
  /** Optional className for the Avatar wrapper */
  className?: string
  /** Optional className for the fallback */
  fallbackClassName?: string
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

/**
 * Avatar component that handles private storage paths
 * 
 * Automatically resolves storage paths to signed URLs while showing
 * the fallback during loading.
 */
export function PrivateAvatar({
  src,
  alt,
  fallback,
  className,
  fallbackClassName,
}: PrivateAvatarProps) {
  const { url: resolvedUrl, isLoading } = useAvatarUrl(src)

  return (
    <Avatar className={className}>
      {!isLoading && resolvedUrl && (
        <AvatarImage src={resolvedUrl} alt={alt} />
      )}
      <AvatarFallback className={fallbackClassName}>
        {fallback}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * Simpler version that just takes a name and auto-generates initials
 */
interface SimplePrivateAvatarProps {
  /** The avatar path or URL */
  src: string | null | undefined
  /** The user's name (used for alt text and initials) */
  name: string
  /** Optional className for the Avatar wrapper */
  className?: string
  /** Optional className for the fallback */
  fallbackClassName?: string
}

export function SimplePrivateAvatar({
  src,
  name,
  className,
  fallbackClassName,
}: SimplePrivateAvatarProps) {
  return (
    <PrivateAvatar
      src={src}
      alt={name}
      fallback={getInitials(name)}
      className={className}
      fallbackClassName={fallbackClassName}
    />
  )
}
