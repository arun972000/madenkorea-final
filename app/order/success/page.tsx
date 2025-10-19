import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function OrderSuccessPage() {
  const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-2xl mx-auto text-center">
          <CardHeader>
            <CheckCircle className="h-20 w-20 mx-auto text-green-500 mb-4" />
            <CardTitle className="text-3xl">Order Placed Successfully!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-muted-foreground mb-2">Your order number is</p>
              <p className="text-2xl font-bold">{orderNumber}</p>
            </div>

            <p className="text-muted-foreground">
              We've sent a confirmation email with your order details. You can track your order status in your account.
            </p>

            <div className="flex gap-4 justify-center">
              <Button asChild size="lg">
                <Link href="/account/orders">View Orders</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/">Continue Shopping</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
