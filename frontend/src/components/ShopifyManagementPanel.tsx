/**
 * Shopify Management Panel Component
 * 
 * This component provides an interface for administrators to:
 * - Connect their Shopify store via OAuth
 * - Test the API connection
 * - View connection status and granted permissions
 * - Disconnect the store
 * 
 * The component manages the Shopify integration for a single client.
 * Each client can have one Shopify store connected.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, XCircle, ExternalLink, Settings, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/utils/api';
import { useTranslation } from 'react-i18next';
import { TrackingConfiguration } from './TrackingConfiguration';

/**
 * Props interface for the Shopify Management Panel
 */
interface ShopifyManagementPanelProps {
  /** The client ID this panel is managing */
  clientId: number;
  /** Initial data from the database */
  initialData: {
    id: number;
    name: string;
    shopifyStoreUrl: string | null;
    shopifyConnected: boolean;
    shopifyScope: string | null;
  };
}

/**
 * Interface for connection test API responses
 */
interface ConnectionTestResult {
  success: boolean;
  shop?: string;
  productsCount?: number;
  ordersCount?: number;
  error?: string;
}

const ShopifyManagementPanel: React.FC<ShopifyManagementPanelProps> = ({
  clientId,
  initialData,
}) => {
  const { t } = useTranslation('manage');

  // Connection state - tracks whether Shopify is currently connected
  const [isConnected, setIsConnected] = useState(initialData.shopifyConnected);
  
  // Store URL - the myshopify.com URL for the connected store
  const [storeUrl, setStoreUrl] = useState(initialData.shopifyStoreUrl);
  
  // Scope - the OAuth permissions granted to our app
  const [scope, setScope] = useState(initialData.shopifyScope);
  
  // Loading states for async operations
  const [isTesting, setIsTesting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  
  // Test result data from connection test API
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  
  // Connect dialog state - controls the dialog for entering shop name
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopNameError, setShopNameError] = useState('');
  
  // Disconnect confirmation dialog state
  const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);

  /**
   * Effect: Check for OAuth success on component mount
   * 
   * When the OAuth flow completes, the callback redirects back to this page
   * with ?connected=success query parameter. We detect this and show a success toast.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Handle success
    if (params.get('shopify') === 'connected') {
      // Show success notification
      toast.success(t('shopify.oauthConnectedTitle'), {
        description: t('shopify.oauthConnectedDescription')
      });
      
      // Clean up URL by removing query parameter
      window.history.replaceState({}, '', window.location.pathname);
      
      // Reload page to fetch fresh data from database
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }

    // Handle error
    const status = params.get('status');
    const message = params.get('message');
    if (status === 'error') {
      if (import.meta.env.DEV) {
        console.error('[SHOPIFY_PANEL] OAuth connection failed:', message);
      }
      
      toast.error(t('shopify.connectionTestFailed'), {
        description: message || t('shopify.unknownError')
      });

      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  /**
   * Opens the connect dialog
   * Resets the form state before opening
   */
  const handleOpenConnectDialog = () => {
    setShopName('');
    setShopNameError('');
    setIsConnectDialogOpen(true);
  };

  /**
   * Validates the shop name format
   * 
   * Rules:
   * - Must not be empty
   * - Can only contain letters, numbers, and hyphens
   * - Cannot contain dots (user shouldn't include .myshopify.com)
   * 
   * @param name - The shop name to validate
   * @returns true if valid, false otherwise
   */
  const validateShopName = (name: string): boolean => {
    // Check for empty input
    if (!name || name.trim() === '') {
      setShopNameError(t('shopify.storeNameRequired'));
      return false;
    }

    // Check for invalid characters
    // Shopify store names can only contain alphanumeric characters and hyphens
    const validFormat = /^[a-z0-9-]+$/i;
    if (!validFormat.test(name)) {
      setShopNameError(t('shopify.storeNameInvalidChars'));
      return false;
    }

    // Check if user accidentally included .myshopify.com
    if (name.includes('.')) {
      setShopNameError(t('shopify.storeNameNoDomain'));
      return false;
    }

    // Validation passed
    setShopNameError('');
    return true;
  };

  /**
   * Handles form submission in the connect dialog
   * Validates input and redirects to OAuth flow if valid
   * 
   * @param e - Form submit event
   */
  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate shop name before proceeding
    if (!validateShopName(shopName)) {
      return;
    }

    // Close the dialog
    setIsConnectDialogOpen(false);

    // Show loading notification
    toast.loading(t('shopify.redirecting'), {
      description: t('shopify.redirectingDescription')
    });

    try {
      // ✅ FIXED: Use apiClient to initiate OAuth (handles auth headers)
      const data = await apiClient.get(`/shopify/install?shop=${encodeURIComponent(shopName.trim())}`);

      if (data.success && data.redirectUrl) {
        // Redirect browser to the Shopify OAuth URL
        if (typeof window !== 'undefined') {
          window.location.href = data.redirectUrl;
        }
      } else {
        if (import.meta.env.DEV) {
          console.error('[SHOPIFY_PANEL] Install failed:', data);
        }
        toast.dismiss();
        toast.error(t('shopify.connectionTestFailed'), { // Generic error or add a new key
          description: data.message || 'Failed to initiate connection'
        });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[SHOPIFY_PANEL] Install error:', err);
      }
      toast.dismiss();
      toast.error(t('shopify.unknownError'), {
        description: err instanceof Error ? err.message : 'Network error'
      });
    }
  };

  /**
   * Tests the Shopify API connection
   * 
   * Makes a test API call to verify:
   * - Credentials are valid
   * - API is accessible
   * - Store data can be retrieved
   * 
   * Displays results including product and order counts
   */
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Show loading toast that we'll update with results
    const toastId = toast.loading(t('shopify.testingConnection'));

    try {
      // ✅ FIXED: apiClient.get() returns JSON already, no need to call .json()
      // ✅ FIXED: Auth token automatically added by apiClient
      const data = await apiClient.get('/shopify/test');

      // Store test results for display
      setTestResult(data);

      if (data.success) {
        // Update loading toast to success with data
        toast.success(t('shopify.connectionSuccessful'), {
          id: toastId,
          description: t('shopify.connectionSuccessCount', { products: data.productsCount || 0, orders: data.ordersCount || 0 })
        });
      } else {
        if (import.meta.env.DEV) {
          console.error('[SHOPIFY_PANEL] Connection test failed:', data.error);
        }
        
        // Update loading toast to error
        toast.error(t('shopify.connectionTestFailed'), {
          id: toastId,
          description: data.error
        });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[SHOPIFY_PANEL] Exception during connection test:', err);
      }
      
      // Handle network or other errors
      toast.error(t('shopify.connectionTestFailed'), {
        id: toastId,
        description: err instanceof Error ? err.message : t('shopify.unknownError')
      });
    } finally {
      setIsTesting(false);
    }
  };

  /**
   * Opens the disconnect confirmation dialog
   */
  const handleOpenDisconnectDialog = () => {
    setIsDisconnectDialogOpen(true);
  };

  /**
   * Disconnects the Shopify store
   * 
   * This will:
   * - Revoke API access
   * - Clear all Shopify data from the database
   * - Remove the connection for all customer tickets
   */
  const handleDisconnectConfirm = async () => {
    setIsDisconnecting(true);
    setIsDisconnectDialogOpen(false);

    // Show loading toast
    const toastId = toast.loading(t('shopify.disconnecting'));

    try {
      // ✅ FIXED: Remove clientId from body - comes from auth token
      // ✅ FIXED: apiClient.post() returns JSON already, no need to call .json()
      const data = await apiClient.post('/shopify/disconnect');

      // ✅ FIXED: Check data.success instead of response.ok (apiClient throws on !ok)
      if (data.success) {
        // Update loading toast to success
        toast.success(t('shopify.disconnectSuccess'), {
          id: toastId,
          description: t('shopify.disconnectSuccessDescription')
        });
        
        // Update local state
        setIsConnected(false);
        setStoreUrl(null);
        setScope(null);
        setTestResult(null);
        
        // Reload page to refresh all data from database
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        if (import.meta.env.DEV) {
          console.error('[SHOPIFY_PANEL] Disconnect failed:', data);
        }
        
        // Show error toast
        toast.error(t('shopify.disconnectFailed'), {
          id: toastId,
          description: data.error || t('shopify.disconnectFailedDescription')
        });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[SHOPIFY_PANEL] Exception during disconnect:', err);
      }
      
      // Handle network or other errors
      toast.error(t('shopify.disconnectFailed'), {
        id: toastId,
        description: err instanceof Error ? err.message : t('shopify.unknownError')
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="connection">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="connection" className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            {t('shopify.connection', 'Connection')}
          </TabsTrigger>
          <TabsTrigger value="tracking" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t('shopify.tracking', 'Tracking')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="space-y-6">
          {/* 
            Connection Status Card
            Main card showing current connection status and primary actions
          */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('shopify.connectionStatus')}</CardTitle>
                  <CardDescription>
                    {t('shopify.manageConnection')}
                  </CardDescription>
                </div>
                {/* Status badge - green for connected, gray for disconnected */}
                {isConnected ? (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {t('shopify.connected')}
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="w-4 h-4 mr-1" />
                    {t('shopify.notConnected')}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isConnected && storeUrl ? (
                <>
                  {/* Connected State - show store info and management actions */}
                  <div className="space-y-3">
                    {/* Display the connected store URL */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('shopify.storeUrl')}</p>
                      <div className="flex items-center mt-1">
                        <p className="text-sm font-mono">{storeUrl}</p>
                        {/* External link to visit the store */}
                        <a
                          href={`https://${storeUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons for connected state */}
                  <div className="flex gap-3 pt-2">
                    {/* Test connection button - verifies API access */}
                    <Button
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      variant="outline"
                    >
                      {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('shopify.testConnection')}
                    </Button>
                    {/* Disconnect button - opens confirmation dialog */}
                    <Button
                      onClick={handleOpenDisconnectDialog}
                      disabled={isDisconnecting}
                      variant="destructive"
                    >
                      {isDisconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('shopify.disconnect')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Disconnected State - show connect button */}
                  <p className="text-sm text-muted-foreground">
                    {t('shopify.connectDescription')}
                  </p>
                  <Button onClick={handleOpenConnectDialog}>
                    {t('shopify.connectShopifyStore')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* 
            Test Results Card
            Only displayed after a successful connection test
            Shows product and order counts from the Shopify store
          */}
          {testResult && testResult.success && (
            <Card>
              <CardHeader>
                <CardTitle>{t('shopify.testResultsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {/* Products count */}
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium text-muted-foreground">{t('shopify.products')}</p>
                    <p className="text-2xl font-bold">{testResult.productsCount ?? 0}</p>
                  </div>
                  {/* Orders count */}
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium text-muted-foreground">{t('shopify.orders')}</p>
                    <p className="text-2xl font-bold">{testResult.ordersCount ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 
            Information Card
            Explains how the integration works
          */}
          <Card>
            <CardHeader>
              <CardTitle>{t('shopify.howItWorksTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• {t('shopify.howItWorks.bullet1')}</li>
                <li>• {t('shopify.howItWorks.bullet2')}</li>
                <li>• {t('shopify.howItWorks.bullet3')}</li>
                <li>• {t('shopify.howItWorks.bullet4')}</li>
                <li>• {t('shopify.howItWorks.bullet5')}</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking">
          <TrackingConfiguration />
        </TabsContent>
      </Tabs>

      {/* 
        Connect Shopify Dialog
        Modal for entering the Shopify store name before OAuth
      */}
      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleConnectSubmit}>
            <DialogHeader>
              <DialogTitle>{t('shopify.connectDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('shopify.connectDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="shopName">{t('shopify.storeNameLabel')}</Label>
                {/* Input field with .myshopify.com suffix shown */}
                <div className="flex items-center gap-2">
                  <Input
                    id="shopName"
                    placeholder={t('shopify.storeNamePlaceholder')}
                    value={shopName}
                    onChange={(e) => {
                      setShopName(e.target.value);
                      setShopNameError(''); // Clear error on input change
                    }}
                    className={shopNameError ? 'border-red-500' : ''}
                    autoFocus
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    .myshopify.com
                  </span>
                </div>
                {/* Display validation error if present */}
                {shopNameError && (
                  <p className="text-sm text-red-500">{shopNameError}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {t('shopify.storeNameHelper')}
                </p>
              </div>
              {/* Example helper box to clarify format */}
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium mb-1">{t('shopify.exampleTitle')}</p>
                <p className="text-muted-foreground">
                  {t('shopify.exampleText', { example: 'example-store' })}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsConnectDialogOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit">
                {t('shopify.continueToShopify')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 
        Disconnect Confirmation Alert Dialog
        Warns user before disconnecting the Shopify store
      */}
      <AlertDialog open={isDisconnectDialogOpen} onOpenChange={setIsDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('shopify.disconnectConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('shopify.disconnectConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnectConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('shopify.disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ShopifyManagementPanel;