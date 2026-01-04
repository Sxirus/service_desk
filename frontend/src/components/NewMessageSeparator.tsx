/**
 * NewMessageSeparator Component
 *
 * Displays a prominent red separator bar to indicate where new messages start.
 * Features:
 * - Red gradient line with pulsing indicator
 * - Shows count of new messages
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { NewMessageSeparatorProps } from '@/types/ticket.types';

export const NewMessageSeparator: React.FC<NewMessageSeparatorProps> = ({
  newMessageCount
}) => {
  const { t } = useTranslation('dashboard');
  
  return (
    <div className="relative my-6 h-8 flex items-center justify-center z-10">
      {/* Red separator line - full width */}
      <div className="absolute inset-x-0 top-1/2 h-0.5 bg-gradient-to-r from-red-500/20 via-red-500 to-red-500/20" />
      
      {/* Badge with new message count */}
      <div className="relative bg-red-500 text-white px-4 py-1.5 rounded-full text-sm font-medium shadow-lg flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
        </span>
        {newMessageCount === 1
          ? t('tickets.oneNewMessage')
          : t('tickets.multipleNewMessages', { count: newMessageCount })
        }
      </div>
    </div>
  );
};
