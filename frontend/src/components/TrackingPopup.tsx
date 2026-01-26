import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/utils/api';
import { DEFAULT_PROVIDERS } from './TrackingConfiguration';
import type { TrackingProvider } from '@/types/shopify.types';

interface TrackingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  trackingNumber: string;
}

export const TrackingPopup = ({ isOpen, onClose, trackingNumber }: TrackingPopupProps) => {
  const { t } = useTranslation('manage');
  const [loading, setLoading] = useState(true);
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [customProviders, setCustomProviders] = useState<TrackingProvider[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/settings/tracking');
      if (res.success && res.settings) {
        setEnabledProviders(res.settings.providers || []);
        setCustomProviders(res.settings.customProviders || []);
      }
    } catch (error) {
      console.error('Failed to load tracking settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const openTrackingUrl = (urlTemplate: string) => {
    const url = urlTemplate.replace('{TRACKING_NUMBER}', trackingNumber);
    window.open(url, '_blank');
    onClose();
  };

  const availableProviders = [
    ...DEFAULT_PROVIDERS.filter(p => enabledProviders.includes(p.id)).map(p => ({
      name: p.name,
      urlTemplate: p.url,
      logoUrl: p.logoUrl,
      isCustom: false
    })),
    ...customProviders.map(p => ({
      name: p.name,
      urlTemplate: p.urlTemplate,
      logoUrl: p.logoUrl,
      isCustom: true
    }))
  ];

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = parseInt(e.key);
      if (!isNaN(key) && key > 0 && key <= availableProviders.length) {
        const provider = availableProviders[key - 1];
        if (provider) {
          openTrackingUrl(provider.urlTemplate);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, availableProviders]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('tracking.trackShipment', 'Track Shipment')}</DialogTitle>
          <DialogDescription>
            {t('tracking.selectProvider', 'Select a provider to track number')}: <span className="font-mono font-medium text-foreground">{trackingNumber}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</div>
          ) : availableProviders.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {availableProviders.map((provider, idx) => {
                const shortcut = idx + 1;
                return (
                  <Button
                    key={idx}
                    variant="outline"
                    className="relative flex flex-col items-center justify-center h-24 p-2 gap-2 hover:bg-muted/50 transition-colors"
                    onClick={() => openTrackingUrl(provider.urlTemplate)}
                  >
                    {/* Shortcut Badge */}
                    {shortcut <= 9 && (
                      <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-md border bg-muted text-[10px] font-medium text-muted-foreground opacity-70">
                        {shortcut}
                      </span>
                    )}

                    {/* Logo or Icon */}
                    <div className="flex-1 flex items-center justify-center w-full">
                      {provider.logoUrl ? (
                        <img 
                          src={provider.logoUrl} 
                          alt={provider.name} 
                          className="max-w-[80%] max-h-10 object-contain"
                        />
                      ) : (
                        <Truck className="h-8 w-8 text-muted-foreground/50" />
                      )}
                    </div>

                    {/* Provider Name */}
                    <span className="text-xs font-medium truncate max-w-full">
                      {provider.name}
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="text-center p-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              {t('tracking.noProviders', 'No tracking providers configured.')}
            </div>
          )}
        </div>

        {availableProviders.length > 0 && !loading && (
          <div className="text-center space-y-1">
            <p className="text-[10px] text-muted-foreground opacity-60">
              {t('tracking.shortcutHint', 'Use keys 1-9 to quickly select a provider')}
            </p>
            <p className="text-[8px] text-muted-foreground opacity-40">
              {t('tracking.logoDisclaimer', 'All logos and trademarks are property of their respective owners.')}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
