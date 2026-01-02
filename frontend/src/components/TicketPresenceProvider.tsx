"use client"

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface PresenceUser {
  id: string
  name: string
  avatar_url: string | null
}

interface TicketViewers {
  [customerId: string]: PresenceUser[]
}

interface TicketPresenceContextValue {
  viewers: TicketViewers
  currentUserId: string | null
}

const TicketPresenceContext = createContext<TicketPresenceContextValue>({
  viewers: {},
  currentUserId: null,
})

export function useTicketPresence() {
  return useContext(TicketPresenceContext)
}

interface TicketPresenceProviderProps {
  children: React.ReactNode
  customerIds: string[]
  currentUser: PresenceUser | null
}

/**
 * TicketPresenceProvider
 * 
 * Manages presence subscriptions for multiple tickets at once.
 * Subscribes to presence channels for each visible ticket and tracks viewers.
 */
export function TicketPresenceProvider({ 
  children, 
  customerIds, 
  currentUser 
}: TicketPresenceProviderProps) {
  const [viewers, setViewers] = useState<TicketViewers>({})
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map())
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const subscribedIdsRef = useRef<Set<string>>(new Set())

  // Initialize Supabase client once
  useEffect(() => {
    supabaseRef.current = createBrowserClient(
      import.meta.env.PUBLIC_SUPABASE_URL!,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY!
    )

    return () => {
      // Cleanup all channels on unmount
      channelsRef.current.forEach((channel) => {
        channel.untrack()
        supabaseRef.current?.removeChannel(channel)
      })
      channelsRef.current.clear()
      subscribedIdsRef.current.clear()
    }
  }, [])

  // Subscribe/unsubscribe to channels based on customerIds
  useEffect(() => {
    if (!supabaseRef.current || !currentUser) return

    const supabase = supabaseRef.current
    const currentIds = new Set(customerIds)
    const subscribedIds = subscribedIdsRef.current
    const channels = channelsRef.current

    // Unsubscribe from channels that are no longer needed
    subscribedIds.forEach((id) => {
      if (!currentIds.has(id)) {
        const channel = channels.get(id)
        if (channel) {
          channel.untrack()
          supabase.removeChannel(channel)
          channels.delete(id)
        }
        subscribedIds.delete(id)
        setViewers((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    })

    // Subscribe to new channels (throttle: max 10 at a time to avoid overwhelming)
    const newIds = customerIds.filter((id) => !subscribedIds.has(id)).slice(0, 20)
    
    newIds.forEach((customerId) => {
      if (subscribedIds.has(customerId)) return

      const channelName = `ticket-presence:${customerId}`
      const channel = supabase.channel(channelName, {
        config: {
          presence: {
            key: currentUser.id,
          },
        },
      })

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        
        // Extract all viewers except current user
        const ticketViewers: PresenceUser[] = []
        const seenIds = new Set<string>()
        
        Object.values(state).forEach((presenceList: any) => {
          presenceList.forEach((presence: PresenceUser) => {
            if (presence.id !== currentUser.id && !seenIds.has(presence.id)) {
              seenIds.add(presence.id)
              ticketViewers.push(presence)
            }
          })
        })
        
        setViewers((prev) => ({
          ...prev,
          [customerId]: ticketViewers,
        }))
      })

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Don't track presence from the inbox - we only want to see who's viewing
          // Tracking happens on the individual ticket page
        }
      })

      channels.set(customerId, channel)
      subscribedIds.add(customerId)
    })
  }, [customerIds, currentUser])

  const contextValue: TicketPresenceContextValue = {
    viewers,
    currentUserId: currentUser?.id || null,
  }

  return (
    <TicketPresenceContext.Provider value={contextValue}>
      {children}
    </TicketPresenceContext.Provider>
  )
}

/**
 * Hook to get viewers for a specific ticket
 */
export function useTicketViewers(customerId: string): PresenceUser[] {
  const { viewers } = useTicketPresence()
  return viewers[customerId] || []
}
