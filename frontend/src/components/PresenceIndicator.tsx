"use client"

import React, { useEffect, useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { SimplePrivateAvatar, getInitials } from '@/components/ui/private-avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface PresenceUser {
  id: string
  name: string
  avatar_url: string | null
}

interface PresenceIndicatorProps {
  customerId: string
  currentUser: PresenceUser
}

interface PresenceState {
  [key: string]: PresenceUser[]
}

/**
 * PresenceIndicator Component
 * 
 * Shows avatars of other users currently viewing the same ticket.
 * Uses Supabase Realtime Presence API for live updates.
 */
export function PresenceIndicator({ customerId, currentUser }: PresenceIndicatorProps) {
  const [viewers, setViewers] = useState<PresenceUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  useEffect(() => {
    // Create Supabase client
    const supabase = createBrowserClient(
      import.meta.env.PUBLIC_SUPABASE_URL!,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY!
    )
    supabaseRef.current = supabase

    // Create a unique channel for this ticket
    const channelName = `ticket-presence:${customerId}`
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentUser.id, // Use employee ID as the key
        },
      },
    })

    channelRef.current = channel

    // Handle presence sync events (throttled by Supabase)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as PresenceState
      
      // Extract all viewers except current user
      const allViewers: PresenceUser[] = []
      const seenIds = new Set<string>()
      
      Object.values(state).forEach((presenceList) => {
        presenceList.forEach((presence) => {
          // Skip current user and duplicates
          if (presence.id !== currentUser.id && !seenIds.has(presence.id)) {
            seenIds.add(presence.id)
            allViewers.push(presence)
          }
        })
      })
      
      setViewers(allViewers)
    })

    // Subscribe and track presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track current user's presence with a small delay to avoid rapid fire
        setTimeout(() => {
          channel.track({
            id: currentUser.id,
            name: currentUser.name,
            avatar_url: currentUser.avatar_url,
          })
        }, 100)
      }
    })

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        channelRef.current.untrack()
        supabaseRef.current?.removeChannel(channelRef.current)
      }
    }
  }, [customerId, currentUser.id, currentUser.name, currentUser.avatar_url])

  // Don't render anything if no other viewers
  if (viewers.length === 0) {
    return null
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted-foreground">Also viewing:</span>
        <div className="flex -space-x-2">
          {viewers.slice(0, 5).map((viewer) => (
            <Tooltip key={viewer.id}>
              <TooltipTrigger asChild>
                <div>
                  <SimplePrivateAvatar
                    src={viewer.avatar_url}
                    name={viewer.name}
                    className="h-6 w-6 border-2 border-background ring-0 cursor-default"
                    fallbackClassName="text-xs bg-primary text-primary-foreground"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {viewer.name}
              </TooltipContent>
            </Tooltip>
          ))}
          {viewers.length > 5 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium cursor-default">
                  +{viewers.length - 5}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {viewers.slice(5).map(v => v.name).join(', ')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
