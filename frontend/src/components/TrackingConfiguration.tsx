import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Loader2, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { apiClient } from '@/utils/api';
import type { TrackingSettings, TrackingProvider } from '@/types/shopify.types';

// Default providers configuration
export const DEFAULT_PROVIDERS = [
  { id: '17track', name: '17TRACK', url: 'https://t.17track.net/en#nums={TRACKING_NUMBER}', logoUrl: '/tracking-logos/17track.svg' },
  { id: 'dhl', name: 'DHL', url: 'https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode={TRACKING_NUMBER}', logoUrl: '/tracking-logos/dhl.svg' },
  { id: 'hermes', name: 'Hermes', url: 'https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#{TRACKING_NUMBER}', logoUrl: '/tracking-logos/hermes.svg' },
  { id: 'ups', name: 'UPS', url: 'http://wwwapps.ups.com/WebTracking/processInputRequest?sort_by=status&tracknums_displayed=1&TypeOfInquiryNumber=T&loc=de_DE&InquiryNumber1={TRACKING_NUMBER}&track.x=0&track.y=0', logoUrl: '/tracking-logos/ups.svg' },
  { id: 'gls', name: 'GLS', url: 'https://gls-group.eu/track/{TRACKING_NUMBER}/', logoUrl: '/tracking-logos/gls.svg' },
  { id: 'dpd', name: 'DPD', url: 'https://tracking.dpd.de/parcelstatus?query={TRACKING_NUMBER}&locale=de_DE', logoUrl: '/tracking-logos/dpd.svg' }
];

export const TrackingConfiguration = () => {
  const { t } = useTranslation('manage');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [customProviders, setCustomProviders] = useState<TrackingProvider[]>([]);
  
  // Temporary state for new custom provider input
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderUrl, setNewProviderUrl] = useState('');
  const [newProviderLogo, setNewProviderLogo] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

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
      toast.error(t('settings.tracking.loadError', 'Failed to load tracking settings'));
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await apiClient.post('/settings/tracking', {
        providers: enabledProviders,
        customProviders
      });
      
      if (res.success) {
        toast.success(t('settings.saved', 'Settings saved successfully'));
      } else {
        throw new Error(res.error);
      }
    } catch (error) {
      console.error('Failed to save tracking settings:', error);
      toast.error(t('settings.saveError', 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const toggleProvider = (id: string) => {
    setEnabledProviders(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  const addCustomProvider = () => {
    if (!newProviderName.trim() || !newProviderUrl.trim()) return;
    
    if (!newProviderUrl.includes('{TRACKING_NUMBER}')) {
      toast.error(t('settings.tracking.invalidUrl', 'URL must contain {TRACKING_NUMBER} placeholder'));
      return;
    }

    setCustomProviders(prev => [...prev, { 
      name: newProviderName, 
      urlTemplate: newProviderUrl,
      logoUrl: newProviderLogo.trim() || undefined
    }]);
    setNewProviderName('');
    setNewProviderUrl('');
    setNewProviderLogo('');
  };

  const removeCustomProvider = (index: number) => {
    setCustomProviders(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.tracking.title', 'Shipment Tracking')}</CardTitle>
        <CardDescription>
          {t('settings.tracking.description', 'Configure which tracking providers are available when viewing order shipments.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Standard Providers */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('settings.tracking.standardProviders', 'Standard Providers')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEFAULT_PROVIDERS.map(provider => (
              <div key={provider.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/40">
                <div className="flex items-center gap-3">
                  {provider.logoUrl && (
                    <div className="w-8 h-8 flex items-center justify-center bg-white rounded p-1 border">
                      <img src={provider.logoUrl} alt={provider.name} className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <Label htmlFor={`provider-${provider.id}`} className="text-sm font-medium cursor-pointer">
                      {provider.name}
                    </Label>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={provider.url}>
                      {provider.url}
                    </p>
                  </div>
                </div>
                <Switch 
                  id={`provider-${provider.id}`}
                  checked={enabledProviders.includes(provider.id)}
                  onCheckedChange={() => toggleProvider(provider.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Custom Providers */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('settings.tracking.customProviders', 'Custom Providers')}</h3>
          
          <div className="space-y-3">
            {customProviders.map((provider, index) => (
              <div key={index} className="flex items-center gap-3 p-3 rounded-md border bg-muted/40">
                {provider.logoUrl && (
                  <div className="w-8 h-8 flex items-center justify-center bg-white rounded p-1 border">
                    <img src={provider.logoUrl} alt={provider.name} className="max-w-full max-h-full object-contain" />
                  </div>
                )}
                <div className="grid flex-1 gap-1">
                  <div className="font-medium text-sm">{provider.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{provider.urlTemplate}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeCustomProvider(index)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 p-4 border rounded-md border-dashed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-provider-name">{t('settings.tracking.providerName', 'Provider Name')}</Label>
                <Input 
                  id="new-provider-name" 
                  placeholder="e.g. My Local Courier"
                  value={newProviderName}
                  onChange={e => setNewProviderName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-provider-logo">{t('settings.tracking.logoUrl', 'Logo URL (Optional)')}</Label>
                <Input 
                  id="new-provider-logo" 
                  placeholder="https://example.com/logo.png"
                  value={newProviderLogo}
                  onChange={e => setNewProviderLogo(e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="new-provider-url">{t('settings.tracking.urlTemplate', 'Tracking URL Template')}</Label>
                <Input 
                  id="new-provider-url" 
                  placeholder="https://.../?id={TRACKING_NUMBER}"
                  value={newProviderUrl}
                  onChange={e => setNewProviderUrl(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('settings.tracking.urlHelp', 'Must include {TRACKING_NUMBER}')}
                </p>
              </div>
            </div>
            <Button 
              onClick={addCustomProvider} 
              disabled={!newProviderName || !newProviderUrl}
              variant="secondary"
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.tracking.addProvider', 'Add Custom Provider')}
            </Button>
          </div>
        </div>

      </CardContent>
      <CardFooter className="flex justify-between border-t p-4 bg-muted/20">
        <Button variant="outline" onClick={loadSettings} disabled={saving}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          {t('common.reset', 'Reset')}
        </Button>
        <Button onClick={saveSettings} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {!saving && <Save className="h-4 w-4 mr-2" />}
          {t('common.save', 'Save Changes')}
        </Button>
      </CardFooter>
    </Card>
  );
};
