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
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

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
  console.log('[SHOPIFY_PANEL] Component mounted with data:', { clientId, initialData });

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
    if (params.get('connected') === 'success') {
      console.log('[SHOPIFY_PANEL] OAuth connection successful');
      
      // Show success notification
      toast.success('Shopify store successfully connected!', {
        description: 'Your integration is now active.'
      });
      
      // Clean up URL by removing query parameter
      window.history.replaceState({}, '', window.location.pathname);
      
      // Reload page to fetch fresh data from database
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }, []);

  /**
   * Opens the connect dialog
   * Resets the form state before opening
   */
  const handleOpenConnectDialog = () => {
    console.log('[SHOPIFY_PANEL] Opening connect dialog');
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
    console.log('[SHOPIFY_PANEL] Validating shop name:', name);
    
    // Check for empty input
    if (!name || name.trim() === '') {
      setShopNameError('Store name is required');
      return false;
    }

    // Check for invalid characters
    // Shopify store names can only contain alphanumeric characters and hyphens
    const validFormat = /^[a-z0-9-]+$/i;
    if (!validFormat.test(name)) {
      setShopNameError('Store name can only contain letters, numbers, and hyphens');
      return false;
    }

    // Check if user accidentally included .myshopify.com
    if (name.includes('.')) {
      setShopNameError('Enter only the store name (without .myshopify.com)');
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
  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[SHOPIFY_PANEL] Connect form submitted');

    // Validate shop name before proceeding
    if (!validateShopName(shopName)) {
      console.log('[SHOPIFY_PANEL] Validation failed');
      return;
    }

    console.log('[SHOPIFY_PANEL] Validation passed, redirecting to OAuth');

    // Close the dialog
    setIsConnectDialogOpen(false);

    // Show loading notification
    toast.loading('Redirecting to Shopify...', {
      description: 'You will be asked to authorize the connection.'
    });

    // Build OAuth install URL with shop name and client ID
    const targetUrl = `/api/shopify/install?shop=${encodeURIComponent(shopName.trim())}&clientId=${clientId}`;
    console.log('[SHOPIFY_PANEL] Redirect URL:', targetUrl);
    
    // Small delay to allow toast to render before redirect
    setTimeout(() => {
      window.location.href = targetUrl;
    }, 500);
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
    console.log('[SHOPIFY_PANEL] Test connection button clicked');
    setIsTesting(true);
    setTestResult(null);

    // Show loading toast that we'll update with results
    const toastId = toast.loading('Testing connection to Shopify...');

    try {
      console.log('[SHOPIFY_PANEL] Sending test request for client:', clientId);
      
      // Call our test connection API endpoint
      const response = await fetch(`/api/shopify/testConnection?clientId=${clientId}`);
      const data = await response.json();

      console.log('[SHOPIFY_PANEL] Test response received:', data);

      // Store test results for display
      setTestResult(data);

      if (data.success) {
        console.log('[SHOPIFY_PANEL] Connection test successful');
        
        // Update loading toast to success with data
        toast.success('Connection successful!', {
          id: toastId,
          description: `Found ${data.productsCount || 0} products and ${data.ordersCount || 0} orders.`
        });
      } else {
        console.error('[SHOPIFY_PANEL] Connection test failed:', data.error);
        
        // Update loading toast to error
        toast.error('Connection test failed', {
          id: toastId,
          description: data.error
        });
      }
    } catch (err) {
      console.error('[SHOPIFY_PANEL] Exception during connection test:', err);
      
      // Handle network or other errors
      toast.error('Connection test failed', {
        id: toastId,
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsTesting(false);
      console.log('[SHOPIFY_PANEL] Test connection completed');
    }
  };

  /**
   * Opens the disconnect confirmation dialog
   */
  const handleOpenDisconnectDialog = () => {
    console.log('[SHOPIFY_PANEL] Opening disconnect confirmation dialog');
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
    console.log('[SHOPIFY_PANEL] User confirmed disconnect');
    setIsDisconnecting(true);
    setIsDisconnectDialogOpen(false);

    // Show loading toast
    const toastId = toast.loading('Disconnecting Shopify store...');

    try {
      console.log('[SHOPIFY_PANEL] Sending disconnect request for client:', clientId);

      // Call disconnect API endpoint
      const response = await fetch('/api/shopify/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });

      const data = await response.json();

      console.log('[SHOPIFY_PANEL] Disconnect response:', data);

      if (response.ok && data.success) {
        console.log('[SHOPIFY_PANEL] Successfully disconnected');
        
        // Update loading toast to success
        toast.success('Shopify store disconnected', {
          id: toastId,
          description: 'Your store has been disconnected successfully.'
        });
        
        // Update local state
        setIsConnected(false);
        setStoreUrl(null);
        setScope(null);
        setTestResult(null);
        
        // Reload page to refresh all data from database
        console.log('[SHOPIFY_PANEL] Reloading page');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        console.error('[SHOPIFY_PANEL] Disconnect failed:', data);
        
        // Show error toast
        toast.error('Failed to disconnect', {
          id: toastId,
          description: data.error || 'An error occurred while disconnecting.'
        });
      }
    } catch (err) {
      console.error('[SHOPIFY_PANEL] Exception during disconnect:', err);
      
      // Handle network or other errors
      toast.error('Failed to disconnect', {
        id: toastId,
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 
        Connection Status Card
        Main card showing current connection status and primary actions
      */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Connection Status</CardTitle>
              <CardDescription>
                Manage your Shopify store connection
              </CardDescription>
            </div>
            {/* Status badge - green for connected, gray for disconnected */}
            {isConnected ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="w-4 h-4 mr-1" />
                Not Connected
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
                  <p className="text-sm font-medium text-muted-foreground">Store URL</p>
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
                  Test Connection
                </Button>
                {/* Disconnect button - opens confirmation dialog */}
                <Button
                  onClick={handleOpenDisconnectDialog}
                  disabled={isDisconnecting}
                  variant="destructive"
                >
                  {isDisconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Disconnected State - show connect button */}
              <p className="text-sm text-muted-foreground">
                Connect your Shopify store to enable order data in customer support tickets.
              </p>
              <Button onClick={handleOpenConnectDialog}>
                Connect Shopify Store
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
            <CardTitle>Connection Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {/* Products count */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium text-muted-foreground">Products</p>
                <p className="text-2xl font-bold">{testResult.productsCount ?? 0}</p>
              </div>
              {/* Orders count */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium text-muted-foreground">Orders</p>
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
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Click "Connect Shopify Store" to start the OAuth flow</li>
            <li>• You'll be redirected to Shopify to authorize the connection</li>
            <li>• Once connected, customer support agents can view order data in tickets</li>
            <li>• Orders are matched to customers by email address</li>
            <li>• You can disconnect at any time to revoke access</li>
          </ul>
        </CardContent>
      </Card>

      {/* 
        Connect Shopify Dialog
        Modal for entering the Shopify store name before OAuth
      */}
      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleConnectSubmit}>
            <DialogHeader>
              <DialogTitle>Connect Shopify Store</DialogTitle>
              <DialogDescription>
                Enter your Shopify store name to connect your store.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="shopName">Store Name</Label>
                {/* Input field with .myshopify.com suffix shown */}
                <div className="flex items-center gap-2">
                  <Input
                    id="shopName"
                    placeholder="my-store"
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
                  Enter only your store name, not the full URL
                </p>
              </div>
              {/* Example helper box to clarify format */}
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium mb-1">Example:</p>
                <p className="text-muted-foreground">
                  If your store is <span className="font-mono">example-store.myshopify.com</span>,
                  enter <span className="font-mono font-semibold">example-store</span>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsConnectDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                Continue to Shopify
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
            <AlertDialogTitle>Are you sure you want to disconnect?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove access to Shopify data for all customer support tickets.
              Customer service agents will no longer be able to view order information.
              You can reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnectConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ShopifyManagementPanel;