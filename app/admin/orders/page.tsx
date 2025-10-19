'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Eye, LogOut, Download, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminOrdersPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  if (!hasRole('admin')) {
    router.push('/admin');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const mockOrders = [
    { id: 'ORD-1001', customer: 'Sarah Johnson', email: 'sarah@example.com', date: '2024-10-08', total: 2499, status: 'pending', items: 3, paymentMethod: 'Card' },
    { id: 'ORD-1002', customer: 'Mike Chen', email: 'mike@example.com', date: '2024-10-07', total: 3799, status: 'processing', items: 2, paymentMethod: 'UPI' },
    { id: 'ORD-1003', customer: 'Emma Wilson', email: 'emma@example.com', date: '2024-10-07', total: 1599, status: 'dispatched', items: 1, paymentMethod: 'Card' },
    { id: 'ORD-1004', customer: 'Alex Kumar', email: 'alex@example.com', date: '2024-10-06', total: 4299, status: 'delivered', items: 4, paymentMethod: 'COD' },
    { id: 'ORD-1005', customer: 'Priya Sharma', email: 'priya@example.com', date: '2024-10-05', total: 1899, status: 'cancelled', items: 2, paymentMethod: 'Card' },
    { id: 'ORD-1006', customer: 'Rajesh Patel', email: 'rajesh@example.com', date: '2024-10-04', total: 3299, status: 'returned', items: 3, paymentMethod: 'UPI' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'outline';
      case 'processing': return 'secondary';
      case 'dispatched': return 'default';
      case 'delivered': return 'default';
      case 'cancelled': return 'destructive';
      case 'returned': return 'outline';
      default: return 'outline';
    }
  };

  const filterOrdersByStatus = (status: string) => {
    if (status === 'all') return mockOrders;
    return mockOrders.filter(order => order.status === status);
  };

  const filteredOrders = filterOrdersByStatus(activeTab).filter(order =>
    order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getOrderStats = () => {
    return {
      all: mockOrders.length,
      pending: mockOrders.filter(o => o.status === 'pending').length,
      processing: mockOrders.filter(o => o.status === 'processing').length,
      dispatched: mockOrders.filter(o => o.status === 'dispatched').length,
      delivered: mockOrders.filter(o => o.status === 'delivered').length,
      cancelled: mockOrders.filter(o => o.status === 'cancelled').length,
      returned: mockOrders.filter(o => o.status === 'returned').length,
    };
  };

  const stats = getOrderStats();

  const exportOrders = () => {
    toast.success('Exporting orders to CSV...');
  };

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
            <span className="text-sm text-muted-foreground">{user?.name}</span>
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
                placeholder="Search by order ID or customer..."
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
            <CardDescription>View and manage customer orders by status</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-7 w-full">
                <TabsTrigger value="all">
                  All
                  <Badge variant="secondary" className="ml-2">{stats.all}</Badge>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending
                  <Badge variant="secondary" className="ml-2">{stats.pending}</Badge>
                </TabsTrigger>
                <TabsTrigger value="processing">
                  Processing
                  <Badge variant="secondary" className="ml-2">{stats.processing}</Badge>
                </TabsTrigger>
                <TabsTrigger value="dispatched">
                  Dispatched
                  <Badge variant="secondary" className="ml-2">{stats.dispatched}</Badge>
                </TabsTrigger>
                <TabsTrigger value="delivered">
                  Delivered
                  <Badge variant="secondary" className="ml-2">{stats.delivered}</Badge>
                </TabsTrigger>
                <TabsTrigger value="cancelled">
                  Cancelled
                  <Badge variant="secondary" className="ml-2">{stats.cancelled}</Badge>
                </TabsTrigger>
                <TabsTrigger value="returned">
                  Returned
                  <Badge variant="secondary" className="ml-2">{stats.returned}</Badge>
                </TabsTrigger>
              </TabsList>

              <div className="mt-6">
                <div className="rounded-md border">
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
                      {filteredOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No orders found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">{order.id}</TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{order.customer}</div>
                                <div className="text-sm text-muted-foreground">{order.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>{new Date(order.date).toLocaleDateString()}</TableCell>
                            <TableCell>{order.items}</TableCell>
                            <TableCell>{order.paymentMethod}</TableCell>
                            <TableCell>₹{order.total.toLocaleString('en-IN')}</TableCell>
                            <TableCell>
                              <Badge variant={getStatusColor(order.status)}>
                                {order.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/orders/${order.id}`)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
