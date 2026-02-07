/**
 * Shopify Orders Component
 * 
 * Displays customer order history from Shopify with refund capabilities.
 * Features:
 * - Expandable order cards with line items
 * - Financial status and fulfillment tracking
 * - Refund workflow with calculation preview
 * - Order cancellation for unfulfilled orders
 * - Accessible keyboard navigation
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ShoppingBag,
  RefreshCcw,
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  ExternalLink,
  Package,
  History,
  Info,
  Undo2,
  CheckCircle2,
  Clock,
  Ban,
  Truck,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '../utils/api';
import type { ShopifyConfig, ShopifyClientData, ShopifyOrder } from '../types/shopify.types';
import { TrackingPopup } from './TrackingPopup';

import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ShopifyOrdersProps {
  shopifyConfig: ShopifyConfig;
  clientData: ShopifyClientData;
}

// ============================================================================
// Status Badge Component
// ============================================================================

const getStatusConfig = (status: string, type: 'financial' | 'fulfillment') => {
  const s = status.toLowerCase();
  if (type === 'financial') {
    if (s === 'paid') return { variant: 'default' as const, icon: CheckCircle2, color: 'text-green-600' };
    if (s === 'refunded' || s === 'voided') return { variant: 'destructive' as const, icon: Undo2, color: 'text-red-600' };
    if (s === 'pending' || s === 'authorized') return { variant: 'secondary' as const, icon: Clock, color: 'text-orange-500' };
    return { variant: 'outline' as const, icon: Info, color: 'text-muted-foreground' };
  }
  if (s === 'fulfilled') return { variant: 'default' as const, icon: Package, color: 'text-blue-500' };
  if (s === 'unfulfilled') return { variant: 'outline' as const, icon: Clock, color: 'text-muted-foreground' };
  return { variant: 'secondary' as const, icon: Package, color: 'text-muted-foreground' };
};

const StatusBadge = ({ status, type }: { status: string; type: 'financial' | 'fulfillment' }) => {
  const { t } = useTranslation('manage');
  const config = getStatusConfig(status, type);
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1.5 text-xs">
      <Icon className="h-3 w-3" />
      {t(`shopify.status.${status.toLowerCase()}`, status)}
    </Badge>
  );
};

// ============================================================================
// Refund Workflow Component
// ============================================================================

const RefundDialog = ({ order, onSuccess }: { order: ShopifyOrder; onSuccess: () => void }) => {
  const { t } = useTranslation('manage');
  const [isOpen, setIsOpen] = useState(false);
  
  // Check if any items can be refunded
  const hasRefundableItems = order.line_items.some(item => item.refundableQuantity > 0);
  const canRefund = order.financial_status !== 'refunded' && order.financial_status !== 'voided';
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(order.line_items.map(item => [item.id, 0]))
  );
  const [shippingAmount, setShippingAmount] = useState('0.00');
  const [customAmount, setCustomAmount] = useState('0.00');
  const [calculatedTotal, setCalculatedTotal] = useState<any>(null);
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    const hasValue = Object.values(quantities).some(q => q > 0) || parseFloat(shippingAmount) > 0 || parseFloat(customAmount) > 0;
    if (!hasValue) { setCalculatedTotal(null); return; }
    const timer = setTimeout(() => calculate(), 400);
    return () => clearTimeout(timer);
  }, [quantities, shippingAmount, customAmount]);

  const calculate = async () => {
    setIsCalculating(true);
    try {
      const items = Object.entries(quantities).filter(([_, q]) => q > 0).map(([id, q]) => ({ lineItemId: id, quantity: q }));
      const res = await apiClient.post('/shopify/refund/calculate', { 
        orderId: order.id, 
        refundLineItems: items,
        customAmount: parseFloat(customAmount) > 0 ? customAmount : undefined
      });
      if (res.success) setCalculatedTotal(res.suggestedRefund);
    } finally { setIsCalculating(false); }
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const items = Object.entries(quantities).filter(([_, q]) => q > 0).map(([id, q]) => ({ lineItemId: id, quantity: q }));
      const res = await apiClient.post('/shopify/refund/create', { 
        orderId: order.id, refundLineItems: items, notifyCustomer: notify, note, 
        shippingAmount: parseFloat(shippingAmount) > 0 ? shippingAmount : undefined,
        customAmount: parseFloat(customAmount) > 0 ? customAmount : undefined
      });
      if (res.success) { toast.success(t('shopify.refundSuccess')); setIsOpen(false); onSuccess(); }
    } catch (e: any) { toast.error(e.message); } finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex-1">
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full gap-1.5" 
                disabled={!canRefund}
              >
                <Undo2 className="h-4 w-4" />
                {t('shopify.refund')}
              </Button>
            </DialogTrigger>
          </div>
        </TooltipTrigger>
        {!canRefund && (
          <TooltipContent>
            <p>{t('shopify.allRefunded')}</p>
          </TooltipContent>
        )}
      </Tooltip>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('shopify.refundDialog.title', { number: order.order_number })}</DialogTitle>
          <DialogDescription>{t('shopify.refundDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ScrollArea className="max-h-[280px]">
            <div className="space-y-2 pr-4">
              {order.line_items.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('shopify.available', { count: item.refundableQuantity })} • {item.price} {order.currency}
                    </p>
                  </div>
                  <Input 
                    type="number" min="0" max={item.refundableQuantity} 
                    className="w-16 text-center" value={quantities[item.id]} 
                    onChange={e => setQuantities({...quantities, [item.id]: Math.min(item.refundableQuantity, parseInt(e.target.value) || 0)})}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <div className="space-y-4 p-4 rounded-md bg-muted/50 border">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium">{t('shopify.refundDialog.shippingRefund')}</Label>
              <div className="relative">
                <Input type="number" className="w-24 pr-12 text-right" value={shippingAmount} onChange={e => setShippingAmount(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{order.currency}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium">{t('shopify.refundDialog.customAmount')}</Label>
              <div className="relative">
                <Input type="number" className="w-24 pr-12 text-right" value={customAmount} onChange={e => setCustomAmount(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{order.currency}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note" className="text-sm font-medium">{t('shopify.refundDialog.internalNote')}</Label>
              <Input id="note" placeholder={t('shopify.refundDialog.notePlaceholder')} value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="notify" checked={notify} onCheckedChange={v => setNotify(!!v)} />
              <Label htmlFor="notify" className="text-sm font-medium cursor-pointer">{t('shopify.refundDialog.notifyCustomer')}</Label>
            </div>
          </div>

          {calculatedTotal && (
            <div className={cn("p-4 rounded-md bg-primary text-primary-foreground space-y-2 transition-opacity", isCalculating && "opacity-50")}>
              <div className="flex justify-between text-xs opacity-90">
                <span>{t('shopify.refundDialog.subtotal')}</span>
                <span>{calculatedTotal.subtotalSet?.shopMoney?.amount || '0.00'} {order.currency}</span>
              </div>
              {parseFloat(calculatedTotal.shipping?.amountSet?.shopMoney?.amount || '0') > 0 && (
                <div className="flex justify-between text-xs opacity-90">
                  <span>{t('shopify.refundDialog.shipping')}</span>
                  <span>{calculatedTotal.shipping.amountSet.shopMoney.amount} {order.currency}</span>
                </div>
              )}
              {parseFloat(customAmount) > 0 && (
                <div className="flex justify-between text-xs opacity-90">
                  <span>{t('shopify.refundDialog.customAmount')}</span>
                  <span>{customAmount} {order.currency}</span>
                </div>
              )}
              {parseFloat(calculatedTotal.totalTaxSet?.shopMoney?.amount || '0') > 0 && (
                <div className="flex justify-between text-xs opacity-90">
                  <span>{t('shopify.refundDialog.tax')}</span>
                  <span>{calculatedTotal.totalTaxSet.shopMoney.amount} {order.currency}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold pt-2 border-t border-primary-foreground/20">
                <span>{t('shopify.refundDialog.total')}</span>
                <span>{calculatedTotal.amountSet.shopMoney.amount} {order.currency}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>{t('shopify.cancel')}</Button>
          <Button disabled={isSubmitting || !calculatedTotal} onClick={submit}>
            {isSubmitting ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : <Undo2 className="h-4 w-4 mr-2" />}
            {t('shopify.refundDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// Order Item Component
// ============================================================================

const OrderItem = ({ order, isExpanded, onToggle, shopifyStore, onRefresh }: { 
  order: ShopifyOrder; 
  isExpanded: boolean; 
  onToggle: () => void;
  shopifyStore?: string;
  onRefresh: () => void;
}) => {
  const { t } = useTranslation('manage');
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="cursor-pointer hover:bg-accent/50 transition-colors rounded-lg -m-1 p-1" onClick={onToggle}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">#{order.order_number}</span>
              {order.cancelled && <Badge variant="destructive" className="text-xs">{t('shopify.cancelled')}</Badge>}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(order.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className="text-sm font-semibold">
                {order.total_price} {order.currency}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={order.financial_status} type="financial" />
            <StatusBadge status={order.fulfillment_status} type="fulfillment" />
            <div className="text-muted-foreground mt-1">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>
      </div>

      <TrackingPopup 
        isOpen={!!trackingNumber} 
        onClose={() => setTrackingNumber(null)} 
        trackingNumber={trackingNumber || ''} 
      />

      {isExpanded && (
        <div className="pt-4 space-y-4">
          <Separator />
          
          {/* Fulfillments */}
          {order.fulfillments && order.fulfillments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Truck className="h-3 w-3" /> {t('shopify.shipments', 'Shipments')}
              </p>
              <div className="grid gap-2">
                {order.fulfillments.map((fulfillment) => (
                  <div key={fulfillment.id} className="flex flex-col gap-2 p-2 rounded-md bg-muted/30 border">
                    {fulfillment.tracking_numbers && fulfillment.tracking_numbers.length > 0 ? (
                      fulfillment.tracking_numbers.map((tn, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            <button 
                              className="font-mono hover:underline hover:text-primary transition-colors text-left"
                              onClick={() => setTrackingNumber(tn.number)}
                            >
                              {tn.number}
                            </button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              navigator.clipboard.writeText(tn.number);
                              toast.success(t('shopify.trackingCopied', 'Tracking number copied to clipboard'));
                            }}
                            title={t('common.copy', 'Copy')}
                          >
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground italic pl-1">{t('shopify.noTrackingInfo', 'No tracking info')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Line Items */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3 w-3" /> {t('shopify.items')}
            </p>
            <div className="space-y-2">
              {order.line_items.map((item) => (
                <div key={item.id} className="flex justify-between items-start gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-2 py-1 rounded bg-muted text-muted-foreground">{item.quantity}×</span>
                      <span className="font-medium text-sm">{item.name}</span>
                    </div>
                    {item.variantTitle && <p className="text-xs text-muted-foreground mt-0.5 ml-8">{item.variantTitle}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground">{item.price} {order.currency}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="p-3 rounded-md bg-muted/50 space-y-1.5">
            {order.payment_gateway && (
              <div className="flex justify-between text-xs text-muted-foreground pb-1 border-b border-muted">
                <span>{t('shopify.paymentMethod', 'Payment Method')}</span>
                <span className="font-medium">
                  {t(`shopify.paymentGateways.${order.payment_gateway.toLowerCase()}`, order.payment_gateway)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('shopify.refundDialog.subtotal')}</span>
              <span>{(parseFloat(order.subtotal) + parseFloat(order.total_discounts)).toFixed(2)} {order.currency}</span>
            </div>

            {parseFloat(order.total_discounts) > 0 && (
              <div className="flex justify-between text-xs text-red-600">
                <div className="flex items-center gap-1.5">
                  <span>{t('shopify.discounts')}</span>
                  {order.discount_applications && order.discount_applications.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 cursor-help opacity-70 hover:opacity-100 transition-opacity" />
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <div className="space-y-1">
                          {order.discount_applications.map((discount, i) => (
                            <div key={i} className="text-xs">
                              <span className="font-semibold">{discount.title}</span>: 
                              {discount.value.percentage 
                                ? ` ${discount.value.percentage}%` 
                                : ` -${discount.value.amount} ${discount.value.currency || order.currency}`}
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <span>-{order.total_discounts} {order.currency}</span>
              </div>
            )}
            
            {parseFloat(order.total_shipping) > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('shopify.refundDialog.shipping')}</span>
                <span>{order.total_shipping} {order.currency}</span>
              </div>
            )}

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('shopify.refundDialog.tax')}</span>
              <span>{order.total_tax} {order.currency}</span>
            </div>

            <Separator />
            
            <div className="flex justify-between items-center text-base font-semibold">
              <span>{t('shopify.total')}</span>
              <span>{order.total_price} {order.currency}</span>
            </div>

            {parseFloat(order.total_refunded) > 0 && (
              <>
                <Separator className="my-1.5" />
                <div className="flex justify-between text-xs text-red-600">
                  <span className="flex items-center gap-1.5"><Undo2 className="h-3 w-3" /> Refunded</span>
                  <span>-{order.total_refunded} {order.currency}</span>
                </div>
                <div className="flex justify-between text-sm font-medium pt-1">
                  <span>{t('shopify.refundDialog.netTotal')}</span>
                  <span>{(parseFloat(order.total_price) - parseFloat(order.total_refunded)).toFixed(2)} {order.currency}</span>
                </div>
              </>
            )}
          </div>

          {/* Refund History */}
          {order.refunds.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <History className="h-3 w-3" /> {t('shopify.refundHistory')}
              </p>
              <div className="space-y-1.5">
                {order.refunds.map((refund) => (
                  <div key={refund.id} className="text-xs p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <div className="flex justify-between font-medium mb-1">
                      <span className="text-muted-foreground">{new Date(refund.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span className="text-destructive">-{refund.amount} {order.currency}</span>
                    </div>
                    {refund.note && <p className="text-muted-foreground italic">"{refund.note}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <RefundDialog order={order} onSuccess={onRefresh} />
            {!order.cancelled && order.fulfillment_status === 'unfulfilled' && (
              <Button 
                variant="destructive" 
                size="sm" 
                className="flex-1 gap-1.5"
                onClick={async () => {
                  if (confirm(t('shopify.cancelDialog.description'))) {
                    try {
                      await apiClient.post('/shopify/order/cancel', { orderId: order.id, reason: 'CUSTOMER', refundOriginalPaymentMethod: true });
                      toast.success(t('shopify.cancelSuccess'));
                      onRefresh();
                    } catch (e: any) { toast.error(e.message); }
                  }
                }}
              >
                <Ban className="h-4 w-4" />
                {t('shopify.cancel')}
              </Button>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            asChild 
            className="w-full mt-2"
          >
            <a href={`https://${shopifyStore}/admin/orders/${order.id.split('/').pop()}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3 mr-2" /> {t('shopify.viewInShopify')}
            </a>
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const ShopifyOrders: React.FC<ShopifyOrdersProps> = ({ shopifyConfig }) => {
  const { t } = useTranslation('manage');
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [shopifyStore, setShopifyStore] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (shopifyConfig.connected) load();
    else setLoading(false);
  }, [shopifyConfig.connected, shopifyConfig.customerId]);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiClient.get(`/shopify/orders?customerId=${shopifyConfig.customerId}`);
      if (res.error) setError(true);
      else {
        setOrders(res.orders || []);
        setShopifyStore(res.shopifyStore);
      }
    } catch { setError(true); } finally { setLoading(false); }
  };

  if (!shopifyConfig.connected) return null;

  return (
    <div className="rounded-lg border mb-6 bg-card text-card-foreground shadow-sm">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('shopify.ordersTitle')}</h3>
        </div>

        {/* Loading State */}
        {loading && orders.length === 0 && (
          <div className="space-y-4 pt-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="pt-3 text-center p-6 rounded-md bg-destructive/5 border border-destructive/20">
            <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
            <p className="text-xs text-destructive mb-2">{t('shopify.errorLoadingOrders')}</p>
            <Button variant="outline" size="sm" onClick={load}>{t('common.tryAgain')}</Button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && orders.length === 0 && (
          <div className="pt-3 text-center py-12">
            <div className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">{t('shopify.noOrdersFoundTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('shopify.noOrdersFound')}</p>
          </div>
        )}

        {/* Orders List */}
        {!loading && !error && orders.length > 0 && (
          <div className="space-y-2 pt-3">
            {orders.map((order) => (
              <OrderItem 
                key={order.id} 
                order={order} 
                shopifyStore={shopifyStore}
                isExpanded={expandedId === order.id} 
                onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};