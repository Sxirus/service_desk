/**
 * Shopify Orders Component
 * 
 * A high-fidelity, professional interface inspired by modern SaaS design systems.
 * Built with shadcn/ui for perfect integration and visual consistency.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ShoppingBag, 
  RefreshCcw, 
  XCircle, 
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
  Tag,
  Truck,
  ReceiptEuro
} from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '../utils/api';
import type { ShopifyConfig, ShopifyClientData, ShopifyOrder } from '../types/shopify.types';

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ShopifyOrdersProps {
  shopifyConfig: ShopifyConfig;
  clientData: ShopifyClientData;
}

// ============================================================================
// Status Styling Utility
// ============================================================================

const getStatusConfig = (status: string, type: 'financial' | 'fulfillment') => {
  const s = status.toLowerCase();
  if (type === 'financial') {
    if (s === 'paid') return { color: 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20', icon: CheckCircle2 };
    if (s === 'refunded' || s === 'voided') return { color: 'text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20', icon: Undo2 };
    if (s === 'pending' || s === 'authorized') return { color: 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20', icon: Clock };
    return { color: 'text-slate-600 bg-slate-50 border-slate-100', icon: Info };
  }
  if (s === 'fulfilled') return { color: 'text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20', icon: Package };
  if (s === 'unfulfilled') return { color: 'text-slate-500 bg-slate-50 border-slate-200 border-dashed dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700', icon: Clock };
  return { color: 'text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20', icon: Package };
};

const StatusBadge = ({ status, type }: { status: string; type: 'financial' | 'fulfillment' }) => {
  const config = getStatusConfig(status, type);
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 px-1.5 py-0 h-5 text-[10px] font-bold uppercase tracking-tight", config.color)}>
      <Icon className="w-2.5 h-2.5" />
      {status}
    </Badge>
  );
};

// ============================================================================
// Refund Workflow Component
// ============================================================================

const RefundDialog = ({ order, onSuccess }: { order: ShopifyOrder; onSuccess: () => void }) => {
  const { t } = useTranslation('manage');
  const [isOpen, setIsOpen] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(order.line_items.map(item => [item.id, 0]))
  );
  const [shippingAmount, setShippingAmount] = useState('0.00');
  const [calculatedTotal, setCalculatedTotal] = useState<any>(null);
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    const hasValue = Object.values(quantities).some(q => q > 0) || parseFloat(shippingAmount) > 0;
    if (!hasValue) { setCalculatedTotal(null); return; }
    const timer = setTimeout(() => calculate(), 400);
    return () => clearTimeout(timer);
  }, [quantities, shippingAmount]);

  const calculate = async () => {
    setIsCalculating(true);
    try {
      const items = Object.entries(quantities).filter(([_, q]) => q > 0).map(([id, q]) => ({ lineItemId: id, quantity: q }));
      const res = await apiClient.post('/shopify/refund/calculate', { orderId: order.id, refundLineItems: items });
      if (res.success) setCalculatedTotal(res.suggestedRefund);
    } finally { setIsCalculating(false); }
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const items = Object.entries(quantities).filter(([_, q]) => q > 0).map(([id, q]) => ({ lineItemId: id, quantity: q }));
      const res = await apiClient.post('/shopify/refund/create', { 
        orderId: order.id, refundLineItems: items, notifyCustomer: notify, note, 
        shippingAmount: parseFloat(shippingAmount) > 0 ? shippingAmount : undefined 
      });
      if (res.success) { toast.success(t('shopify.refundSuccess')); setIsOpen(false); onSuccess(); }
    } catch (e: any) { toast.error(e.message); } finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full h-9 gap-2 font-semibold">
          <Undo2 className="h-4 w-4 text-blue-500" /> {t('shopify.refund')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-50 dark:bg-slate-900 border-b">
          <DialogTitle className="text-lg font-bold tracking-tight">Refund Order #{order.order_number}</DialogTitle>
          <DialogDescription className="text-xs">{t('shopify.refundDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="p-6 space-y-6">
          <ScrollArea className="max-h-[280px] -mr-2 pr-4">
            <div className="space-y-3">
              {order.line_items.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl border bg-card/50">
                  <div className="space-y-1">
                    <p className="text-[13px] font-bold leading-tight">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      {item.refundableQuantity} available • {item.price} {order.currency}
                    </p>
                  </div>
                  <Input 
                    type="number" min="0" max={item.refundableQuantity} 
                    className="w-14 h-8 text-center font-bold" value={quantities[item.id]} 
                    onChange={e => setQuantities({...quantities, [item.id]: Math.min(item.refundableQuantity, parseInt(e.target.value) || 0)})}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <div className="space-y-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-dashed">
            <div className="flex items-center justify-between">
              <Label className="text-[13px] font-bold">Shipping Refund</Label>
              <div className="relative">
                <Input type="number" className="w-24 h-8 pr-8 font-mono text-right" value={shippingAmount} onChange={e => setShippingAmount(e.target.value)} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground">{order.currency}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-muted-foreground">Internal Note</Label>
              <Input placeholder="Why are you refunding?" className="h-9 text-sm" value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="notify" checked={notify} onCheckedChange={v => setNotify(!!v)} className="rounded-md" />
              <Label htmlFor="notify" className="text-sm font-semibold cursor-pointer">Notify customer via email</Label>
            </div>
          </div>

          {calculatedTotal && (
            <div className={cn("rounded-2xl bg-blue-600 p-4 text-white shadow-lg shadow-blue-500/20 space-y-1 transition-all duration-300", isCalculating && "opacity-70 scale-[0.98]")}>
              <div className="flex justify-between text-[10px] font-black uppercase opacity-80"><span>Subtotal</span><span>{calculatedTotal.amountSet.shopMoney.amount} {order.currency}</span></div>
              <div className="flex justify-between font-black text-lg pt-1 border-t border-white/20 mt-1">
                <span className="tracking-tight uppercase">Total Refund</span>
                <span className="font-mono tabular-nums">{calculatedTotal.amountSet.shopMoney.amount} {order.currency}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="p-4 bg-slate-50 dark:bg-slate-900 border-t">
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="font-bold">Cancel</Button>
          <Button disabled={isSubmitting || !calculatedTotal} onClick={submit} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 px-6 rounded-lg shadow-md">
            {isSubmitting ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : <Undo2 className="w-4 h-4 mr-2" />}
            Confirm Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// Order Card Component
// ============================================================================

const OrderCard = ({ order, isExpanded, onToggle, shopifyStore, onRefresh }: { 
  order: ShopifyOrder; 
  isExpanded: boolean; 
  onToggle: () => void;
  shopifyStore?: string;
  onRefresh: () => void;
}) => {
  const { t } = useTranslation('manage');
  
  return (
    <div className={cn(
      "group border rounded-xl overflow-hidden transition-all duration-300",
      isExpanded ? "bg-white dark:bg-slate-950 shadow-md ring-1 ring-primary/10 border-primary/20 scale-[1.01]" : "bg-card hover:border-slate-300 dark:hover:border-slate-700"
    )}>
      <div className="p-4 cursor-pointer select-none" onClick={onToggle}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tighter italic">#{order.order_number}</span>
              {order.cancelled && <Badge variant="destructive" className="h-4 text-[8px] font-black px-1.5 uppercase">Cancelled</Badge>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(order.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
              </span>
              <Separator orientation="vertical" className="h-3" />
              <span className="text-[11px] font-black text-foreground tabular-nums">
                {order.total_price} {order.currency}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={order.financial_status} type="financial" />
            <StatusBadge status={order.fulfillment_status} type="fulfillment" />
          </div>
        </div>
        <div className="flex justify-center mt-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <Separator className="mb-4 opacity-50" />
          
          {/* Line Items */}
          <div className="space-y-3 mb-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <Package className="w-3 h-3" /> Items
            </p>
            {order.line_items.map((item) => (
              <div key={item.id} className="flex justify-between items-start text-xs group/item">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 tabular-nums">{item.quantity}×</span>
                    <span className="font-bold tracking-tight">{item.name}</span>
                  </div>
                  {item.variantTitle && <p className="text-[10px] text-muted-foreground font-medium mt-0.5 pl-9 italic opacity-70">{item.variantTitle}</p>}
                </div>
                <span className="text-[11px] font-bold text-muted-foreground/80 tabular-nums">{item.price} {order.currency}</span>
              </div>
            ))}
          </div>

          {/* Financial Breakdown */}
          <div className="bg-slate-50/50 dark:bg-slate-900/50 p-3 rounded-xl border border-dashed space-y-2">
            <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
              <span className="flex items-center gap-1.5"><ReceiptEuro className="w-3 h-3" /> Subtotal</span>
              <span className="tabular-nums font-mono">{order.subtotal} {order.currency}</span>
            </div>
            
            {parseFloat(order.total_shipping) > 0 && (
              <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                <span className="flex items-center gap-1.5"><Truck className="w-3 h-3" /> Shipping</span>
                <span className="tabular-nums font-mono">{order.total_shipping} {order.currency}</span>
              </div>
            )}

            {parseFloat(order.total_discounts) > 0 && (
              <div className="flex justify-between text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-tight">
                <span className="flex items-center gap-1.5"><Tag className="w-3 h-3" /> Discounts</span>
                <span className="tabular-nums font-mono">-{order.total_discounts} {order.currency}</span>
              </div>
            )}

            <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
              <span className="flex items-center gap-1.5"><Info className="w-3 h-3" /> Estimated Tax</span>
              <span className="tabular-nums font-mono">{order.total_tax} {order.currency}</span>
            </div>

            {parseFloat(order.total_refunded) > 0 && (
              <div className="flex justify-between text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-tight">
                <span className="flex items-center gap-1.5"><Undo2 className="w-3 h-3" /> Already Refunded</span>
                <span className="tabular-nums font-mono">-{order.total_refunded} {order.currency}</span>
              </div>
            )}

            <Separator className="my-1 opacity-30" />
            
            <div className="flex justify-between items-center pt-0.5">
              <span className="text-[11px] font-black uppercase tracking-tighter">Current Total</span>
              <span className="text-sm font-black tabular-nums font-mono text-primary">{order.total_price} {order.currency}</span>
            </div>
          </div>

          {/* Refund History */}
          {order.refunds.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                <History className="w-3 h-3" /> Refund History
              </p>
              <div className="space-y-2">
                {order.refunds.map((refund) => (
                  <div key={refund.id} className="text-[10px] p-2 rounded-lg bg-rose-50/30 dark:bg-rose-900/10 border border-rose-100/50 dark:border-rose-900/30">
                    <div className="flex justify-between font-bold mb-1">
                      <span className="text-rose-700 dark:text-rose-400">{new Date(refund.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span className="font-mono">-{refund.amount} {order.currency}</span>
                    </div>
                    {refund.note && <p className="text-muted-foreground italic">"{refund.note}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <RefundDialog order={order} onSuccess={onRefresh} />
            {!order.cancelled && order.fulfillment_status === 'unfulfilled' && (
              <Button 
                variant="outline" size="sm" 
                className="h-9 text-rose-600 border-rose-100 hover:bg-rose-50 hover:text-rose-700 font-semibold"
                onClick={async () => {
                  if (confirm('Are you sure you want to cancel this order?')) {
                    try {
                      await apiClient.post('/shopify/order/cancel', { orderId: order.id, reason: 'CUSTOMER', refundOriginalPaymentMethod: true });
                      toast.success('Order cancelled');
                      onRefresh();
                    } catch (e: any) { toast.error(e.message); }
                  }
                }}
              >
                <Ban className="w-4 h-4 mr-2" /> Cancel
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild className={cn("h-9 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary", !(!order.cancelled && order.fulfillment_status === 'unfulfilled') && "col-span-2")}>
              <a href={`https://${shopifyStore}/admin/orders/${order.id.split('/').pop()}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-2" /> View in Shopify
              </a>
            </Button>
          </div>
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
    <div className="space-y-4 mb-8">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-black tracking-tight uppercase">Recent Orders</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={loading} className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <RefreshCcw className={cn("h-3.5 w-3.5 text-muted-foreground", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-3">
        {loading && orders.length === 0 && (
          <div className="grid gap-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50 animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="p-6 rounded-2xl border-2 border-dashed border-destructive/20 bg-destructive/5 text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto opacity-50" />
            <p className="text-xs font-bold text-destructive uppercase tracking-widest">{t('shopify.errorLoadingOrders')}</p>
            <Button variant="outline" size="sm" onClick={load} className="h-8 text-[10px] font-black uppercase">Try Again</Button>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="py-12 text-center rounded-2xl border-2 border-dashed bg-slate-50/30 dark:bg-slate-900/30">
            <History className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{t('shopify.noOrdersFound')}</p>
          </div>
        )}

        <div className="grid gap-3">
          {orders.map((order) => (
            <OrderCard 
              key={order.id} 
              order={order} 
              shopifyStore={shopifyStore}
              isExpanded={expandedId === order.id} 
              onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
              onRefresh={load}
            />
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800">
        <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
          <Info className="h-3.5 w-3.5 text-blue-500" />
        </div>
        <p className="text-[10px] font-bold text-muted-foreground leading-normal uppercase tracking-tight">
          Customer synced via email. Last 50 orders are displayed.
        </p>
      </div>
    </div>
  );
};