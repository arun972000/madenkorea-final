'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Eye, LogOut, Download, Search, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: true, autoRefreshToken: true },
  }
);

type AdminOrderRow = {
  id: string;
  order_number: string | null;
  status: string;
  total: number;
  currency: string | null;
  created_at: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  paymentMethod: string;
};

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return '';
  const code = (currency ?? 'INR').toUpperCase();
  if (code === 'INR') return `₹${v.toLocaleString('en-IN')}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  // compute once per render, not a hook:
  const isAdmin = hasRole('admin');

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  // Redirect non-admins (but do it inside an effect)
  useEffect(() => {
    if (user && !isAdmin) {
      router.push('/admin');
    }
  }, [user, isAdmin, router]);

  // Load orders from Supabase
  useEffect(() => {
    if (!user || !isAdmin) return;

    const load = async () => {
      try {
        setLoading(true);

        // 1) Load base orders
        const { data: ordersData, error: oErr } = await supabase
          .from('orders')
          .select(
            'id, order_number, user_id, status, total, currency, created_at, address_snapshot'
          )
          .order('created_at', { ascending: false });

        if (oErr) {
          console.error('Admin orders: orders error', oErr);
          toast.error('Failed to load orders');
          setLoading(false);
          return;
        }

        const rawOrders = ordersData || [];
        if (rawOrders.length === 0) {
          setOrders([]);
          setLoading(false);
          return;
        }

        const orderIds = rawOrders.map((o: any) => o.id);

        // 2) Load order_items for item count
        const { data: itemsData, error: iErr } = await supabase
          .from('order_items')
          .select('order_id, quantity')
          .in('order_id', orderIds);

        if (iErr) {
          console.error('Admin orders: items error', iErr);
        }

        const itemCountMap = new Map<string, number>();
        (itemsData || []).forEach((row: any) => {
          const key = row.order_id;
          const qty = Number(row.quantity || 0);
          itemCountMap.set(key, (itemCountMap.get(key) || 0) + qty);
        });

        // 3) Load payments for latest payment method per order
        const { data: paymentsData, error: pErr } = await supabase
          .from('payments')
          .select('order_id, method, provider_payment_id, created_at')
          .in('order_id', orderIds);

        if (pErr) {
          console.error('Admin orders: payments error', pErr);
        }

        const paymentMap = new Map<
          string,
          {
            method: string;
            provider_payment_id: string | null;
            created_at: string;
          }
        >();
        (paymentsData || []).forEach((p: any) => {
          const key = p.order_id;
          const existing = paymentMap.get(key);
          if (!existing) {
            paymentMap.set(key, {
              method: p.method || '—',
              provider_payment_id: p.provider_payment_id ?? null,
              created_at: p.created_at,
            });
          } else {
            if (
              new Date(p.created_at).getTime() >
              new Date(existing.created_at).getTime()
            ) {
              paymentMap.set(key, {
                method: p.method || '—',
                provider_payment_id: p.provider_payment_id ?? null,
                created_at: p.created_at,
              });
            }
          }
        });

        // 4) Build final rows
        const enriched: AdminOrderRow[] = rawOrders.map((o: any) => {
          const snap = o.address_snapshot || {};
          const payment = paymentMap.get(o.id);

          return {
            id: o.id,
            order_number: o.order_number ?? null,
            status: o.status,
            total: Number(o.total || 0),
            currency: o.currency ?? 'INR',
            created_at: o.created_at,
            customerName: snap.name || 'Guest',
            customerEmail: snap.email || '—',
            itemCount: itemCountMap.get(o.id) || 0,
            paymentMethod: payment?.method || '—',
          };
        });

        setOrders(enriched);
      } catch (err) {
        console.error('Admin orders: fatal load error', err);
        toast.error('Failed to load orders');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, isAdmin]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'pending_payment':
      case 'created':
        return 'outline';
      case 'processing':
      case 'paid':
        return 'secondary';
      case 'dispatched':
      case 'shipped':
      case 'delivered':
        return 'default';
      case 'cancelled':
        return 'destructive';
      case 'returned':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const filterOrdersByStatus = (status: string) => {
    if (status === 'all') return orders;
    return orders.filter((order) => order.status === status);
  };

  const filteredOrders = useMemo(() => {
    const statusFiltered = filterOrdersByStatus(activeTab);
    return statusFiltered.filter((order) => {
      const id = (order.order_number || order.id).toLowerCase();
      const name = (order.customerName || '').toLowerCase();
      const email = (order.customerEmail || '').toLowerCase();
      const q = searchQuery.toLowerCase();

      return id.includes(q) || name.includes(q) || email.includes(q);
    });
  }, [orders, activeTab, searchQuery]);

  const stats = useMemo(() => {
    return {
      all: orders.length,
      pending: orders.filter(
        (o) =>
          o.status === 'pending' ||
          o.status === 'pending_payment' ||
          o.status === 'created'
      ).length,
      processing: orders.filter(
        (o) => o.status === 'processing' || o.status === 'paid'
      ).length,
      dispatched: orders.filter(
        (o) => o.status === 'dispatched' || o.status === 'shipped'
      ).length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      returned: orders.filter((o) => o.status === 'returned').length,
    };
  }, [orders]);

  const exportOrders = () => {
    // Simple placeholder – can be replaced with real CSV export
    toast.success('Exporting orders to CSV...');
  };

  // After all hooks: if not admin, render nothing (redirect handled above)
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Orders Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.name}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <div className="mb-6 flex justify-between items-center">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by order ID, customer name, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Button onClick={exportOrders} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Orders Management</CardTitle>
            <CardDescription>
              View and manage customer orders by status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid grid-cols-7 w-full">
                <TabsTrigger value="all">
                  All
                  <Badge variant="secondary" className="ml-2">
                    {stats.all}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending
                  <Badge variant="secondary" className="ml-2">
                    {stats.pending}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="processing">
                  Processing
                  <Badge variant="secondary" className="ml-2">
                    {stats.processing}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="dispatched">
                  Dispatched
                  <Badge variant="secondary" className="ml-2">
                    {stats.dispatched}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="delivered">
                  Delivered
                  <Badge variant="secondary" className="ml-2">
                    {stats.delivered}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="cancelled">
                  Cancelled
                  <Badge variant="secondary" className="ml-2">
                    {stats.cancelled}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="returned">
                  Returned
                  <Badge variant="secondary" className="ml-2">
                    {stats.returned}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab}>
                <div className="mt-6 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="text-center py-8 text-muted-foreground"
                          >
                            Loading orders…
                          </TableCell>
                        </TableRow>
                      ) : filteredOrders.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="text-center py-8 text-muted-foreground"
                          >
                            No orders found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">
                              {order.order_number || order.id}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">
                                  {order.customerName}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {order.customerEmail}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(
                                order.created_at
                              ).toLocaleDateString('en-IN')}
                            </TableCell>
                            <TableCell>{order.itemCount}</TableCell>
                            <TableCell>{order.paymentMethod}</TableCell>
                            <TableCell>
                              {formatINR(order.total, order.currency)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusColor(order.status)}>
                                {order.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  router.push(`/admin/orders/${order.id}`)
                                }
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  router.push(
                                    `/admin/orders/${order.id}/invoice`
                                  )
                                }
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
