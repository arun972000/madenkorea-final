'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogOut, Package, Truck, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const orderId = params.id as string;

  const [orderStatus, setOrderStatus] = useState('processing');

  if (!hasRole('admin')) {
    router.push('/admin');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const mockOrderDetails = {
    id: orderId,
    orderNumber: orderId,
    date: '2024-10-08T10:30:00',
    status: orderStatus,
    paymentStatus: 'paid',
    paymentMethod: 'Card',
    customer: {
      name: 'Sarah Johnson',
      email: 'sarah@example.com',
      phone: '+91 98765 43210',
    },
    shippingAddress: {
      name: 'Sarah Johnson',
      address: '123 Main Street, Apt 4B',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '+91 98765 43210',
    },
    billingAddress: {
      name: 'Sarah Johnson',
      address: '123 Main Street, Apt 4B',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '+91 98765 43210',
    },
    items: [
      {
        id: '1',
        name: 'Korean Essence Toner',
        image: 'https://images.pexels.com/photos/7728095/pexels-photo-7728095.jpeg?auto=compress&cs=tinysrgb&w=200',
        sku: 'KET-001',
        quantity: 2,
        price: 899,
        total: 1798,
      },
      {
        id: '2',
        name: 'Vitamin C Serum',
        image: 'https://images.pexels.com/photos/7728091/pexels-photo-7728091.jpeg?auto=compress&cs=tinysrgb&w=200',
        sku: 'VCS-002',
        quantity: 1,
        price: 1299,
        total: 1299,
      },
    ],
    subtotal: 3097,
    shipping: 100,
    discount: 200,
    tax: 502,
    total: 3499,
    timeline: [
      {
        status: 'Order Placed',
        date: '2024-10-08T10:30:00',
        description: 'Order has been placed successfully',
        icon: Package,
      },
      {
        status: 'Payment Confirmed',
        date: '2024-10-08T10:31:00',
        description: 'Payment received and confirmed',
        icon: CheckCircle,
      },
      {
        status: 'Processing',
        date: '2024-10-08T11:00:00',
        description: 'Order is being prepared',
        icon: Clock,
      },
    ],
  };

  const handleStatusUpdate = (newStatus: string) => {
    setOrderStatus(newStatus);
    toast.success(`Order status updated to ${newStatus}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">{status}</Badge>;
      case 'processing':
        return <Badge variant="secondary">{status}</Badge>;
      case 'dispatched':
        return <Badge variant="default">{status}</Badge>;
      case 'delivered':
        return <Badge variant="default" className="bg-green-500">{status}</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">{status}</Badge>;
      case 'returned':
        return <Badge variant="outline">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin/orders')}>
              ← Back to Orders
            </Button>
            <h1 className="text-2xl font-bold">Order Details</h1>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Order #{mockOrderDetails.orderNumber}</CardTitle>
                    <CardDescription>
                      Placed on {new Date(mockOrderDetails.date).toLocaleString()}
                    </CardDescription>
                  </div>
                  {getStatusBadge(mockOrderDetails.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Update Order Status</Label>
                    <Select value={orderStatus} onValueChange={handleStatusUpdate}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="dispatched">Dispatched</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="returned">Returned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Items</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockOrderDetails.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-12 h-12 rounded object-cover"
                            />
                            <span className="font-medium">{item.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{item.sku}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>₹{item.price.toLocaleString('en-IN')}</TableCell>
                        <TableCell>₹{item.total.toLocaleString('en-IN')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Separator className="my-4" />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{mockOrderDetails.subtotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>₹{mockOrderDetails.shipping.toLocaleString('en-IN')}</span>
                  </div>
                  {mockOrderDetails.discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-₹{mockOrderDetails.discount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>₹{mockOrderDetails.tax.toLocaleString('en-IN')}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>₹{mockOrderDetails.total.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Timeline</CardTitle>
                <CardDescription>Track the order progress</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockOrderDetails.timeline.map((event, index) => {
                    const Icon = event.icon;
                    return (
                      <div key={index} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          {index < mockOrderDetails.timeline.length - 1 && (
                            <div className="w-0.5 h-full bg-border mt-2" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <h4 className="font-medium">{event.status}</h4>
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(event.date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium">{mockOrderDetails.customer.name}</p>
                  <p className="text-sm text-muted-foreground">{mockOrderDetails.customer.email}</p>
                  <p className="text-sm text-muted-foreground">{mockOrderDetails.customer.phone}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{mockOrderDetails.shippingAddress.name}</p>
                  <p className="text-muted-foreground">{mockOrderDetails.shippingAddress.address}</p>
                  <p className="text-muted-foreground">
                    {mockOrderDetails.shippingAddress.city}, {mockOrderDetails.shippingAddress.state}
                  </p>
                  <p className="text-muted-foreground">{mockOrderDetails.shippingAddress.pincode}</p>
                  <p className="text-muted-foreground">{mockOrderDetails.shippingAddress.phone}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{mockOrderDetails.billingAddress.name}</p>
                  <p className="text-muted-foreground">{mockOrderDetails.billingAddress.address}</p>
                  <p className="text-muted-foreground">
                    {mockOrderDetails.billingAddress.city}, {mockOrderDetails.billingAddress.state}
                  </p>
                  <p className="text-muted-foreground">{mockOrderDetails.billingAddress.pincode}</p>
                  <p className="text-muted-foreground">{mockOrderDetails.billingAddress.phone}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Method</span>
                  <span className="font-medium">{mockOrderDetails.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Status</span>
                  <Badge variant="default" className="bg-green-500">
                    {mockOrderDetails.paymentStatus}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={className}>{children}</label>;
}
