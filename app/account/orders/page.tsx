"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useCart } from "@/lib/contexts/CartContext";
import { Package, ChevronRight, Download, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";

type Order = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  created_at: string;
};

type OrderItem = {
  order_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export default function OrdersPage() {
  const router = useRouter();
  const { isAuthenticated, ready } = useAuth();
  const { addItem } = useCart();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.push("/auth/login?redirect=/account/orders");
      return;
    }
    (async () => {
      setLoading(true);
      const { data: ords, error: oerr } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, currency, subtotal, shipping_fee, discount_total, total, created_at"
        )
        .order("created_at", { ascending: false });
      if (oerr) {
        setOrders([]);
        setItems([]);
        setLoading(false);
        return;
      }
      setOrders(ords ?? []);
      if ((ords ?? []).length) {
        const ids = (ords ?? []).map((o) => o.id);
        const { data: its } = await supabase
          .from("order_items")
          .select("order_id, product_id, name, quantity, unit_price")
          .in("order_id", ids);
        setItems(its ?? []);
      }
      setLoading(false);
    })();
  }, [ready, isAuthenticated, router]);

  if (!ready) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">
          Loading orders…
        </div>
      </CustomerLayout>
    );
  }
  if (!isAuthenticated) return null;

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    items.forEach((i) => {
      const arr = map.get(i.order_id) || [];
      arr.push(i);
      map.set(i.order_id, arr);
    });
    return map;
  }, [items]);

  const getStatusVariant = (status: string) =>
    status === "delivered"
      ? "default"
      : status === "shipped"
      ? "secondary"
      : status === "processing" ||
        status === "paid" ||
        status === "pending_payment"
      ? "outline"
      : "outline";

  const handleInvoice = (orderId: string) => {
    // Open printable invoice page (user can Save as PDF)
    router.push(`/account/orders/${orderId}/invoice`);
  };

  const handleReorder = async (orderId: string) => {
    const its = itemsByOrder.get(orderId) || [];
    const added = its.filter((it) => !!it.product_id);
    if (!added.length) {
      toast.info("No re-orderable items in this order");
      return;
    }
    for (const it of added) {
      await addItem(it.product_id as string, Math.max(1, it.quantity || 1));
    }
    toast.success("Items added to cart");
    router.push("/cart");
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Orders</h1>
          <p className="text-muted-foreground">
            View and track your order history
          </p>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Package className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground mb-6 text-center">
                Start shopping to see your orders here
              </p>
              <Button asChild>
                <Link href="/">Start Shopping</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const its = itemsByOrder.get(order.id) || [];
              const itemCount = its.reduce(
                (acc, i) => acc + (i.quantity || 1),
                0
              );
              return (
                <Card
                  key={order.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          Order {order.order_number}
                        </CardTitle>
                        <CardDescription>
                          Placed on{" "}
                          {new Date(order.created_at).toLocaleDateString(
                            "en-IN",
                            { year: "numeric", month: "long", day: "numeric" }
                          )}
                        </CardDescription>
                      </div>
                      <Badge variant={getStatusVariant(order.status)}>
                        {order.status.charAt(0).toUpperCase() +
                          order.status.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {itemCount} {itemCount === 1 ? "item" : "items"}
                        </p>
                        <p className="text-lg font-bold">
                          ₹{order.total.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInvoice(order.id)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Invoice
                        </Button>
                        {order.status === "delivered" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReorder(order.id)}
                          >
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            Reorder
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            router.push(`/account/orders/${order.id}`)
                          }
                        >
                          View Details
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
