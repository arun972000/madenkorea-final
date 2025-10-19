"use client";

import { useState, useEffect, useMemo } from "react";
import { notFound, useParams } from "next/navigation";
import Image from "next/image";
import {
  Heart,
  ShoppingCart,
  Star,
  Truck,
  Package,
  RotateCcw,
  Shield,
  Share2,
  ZoomIn,
} from "lucide-react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCart } from "@/lib/contexts/CartContext";
import { useWishlist } from "@/lib/contexts/WishlistContext";
import { toast } from "sonner";
import { ProductCard } from "@/components/ProductCard";
import { createClient } from "@supabase/supabase-js";

type Brand = { name?: string | null; slug?: string | null };
type Product = {
  id: string;
  slug: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_published: boolean;
  brand_id?: string | null;
  category_id?: string | null;
  hero_image_path?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  new_until?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  brands?: Brand | null; // via join
};

type ProductImage = {
  storage_path: string;
  alt?: string | null;
  sort_order?: number | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
  return data.publicUrl ?? null;
}

function formatINR(value?: number | null, currency?: string | null) {
  if (value == null) return "";
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") return `₹${value.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

function isWithinWindow(now: Date, start?: string | null, end?: string | null) {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && isNaN(s.getTime())) return false;
  if (e && isNaN(e.getTime())) return false;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

export default function ProductPage() {
  const params = useParams();
  const slug = (params?.slug as string) || (params?.handle as string); // fallback if your param is "handle"
  const { addItem } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [pincode, setPincode] = useState("");
  const [deliveryEstimate, setDeliveryEstimate] = useState("");
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);
  const [showZoom, setShowZoom] = useState(false);

  // Fetch product + images
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      // 1) Product by slug (published only)
      const { data: prod, error: pErr } = await supabase
        .from("products")
        .select(
          `
          id, slug, name, short_description, description,
          price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          is_published, brand_id, category_id, hero_image_path,
          volume_ml, net_weight_g, country_of_origin, new_until, is_featured, is_trending,
          brands ( name, slug )
        `
        )
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle<Product>();

      if (cancelled) return;

      if (pErr || !prod) {
        setLoading(false);
        setProduct(null);
        return;
      }

      // 2) Images
      const { data: imgs } = await supabase
        .from("product_images")
        .select("storage_path, alt, sort_order")
        .eq("product_id", prod.id)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      setProduct(prod);
      setImages(imgs ?? []);
      setSelectedImage(0);
      setLoading(false);

      // Recently viewed
      try {
        const rv = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
        const updated = [
          prod.id,
          ...rv.filter((id: string) => id !== prod.id),
        ].slice(0, 10);
        localStorage.setItem("recentlyViewed", JSON.stringify(updated));
      } catch {}
    }

    if (slug) run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // if (!loading && !product) {
  //   notFound();
  // }

  // Compute pricing
  const now = useMemo(() => new Date(), []);
  const saleActive =
    product?.sale_price != null
      ? isWithinWindow(
          now,
          product?.sale_starts_at ?? null,
          product?.sale_ends_at ?? null
        )
      : false;

  const effectivePrice = useMemo(
    () =>
      saleActive && product?.sale_price != null
        ? product.sale_price
        : product?.price ?? null,
    [saleActive, product?.sale_price, product?.price]
  );

  const discount = useMemo(() => {
    if (
      product?.compare_at_price &&
      effectivePrice != null &&
      product.compare_at_price > 0
    ) {
      return Math.round(
        ((product.compare_at_price - effectivePrice) /
          product.compare_at_price) *
          100
      );
    }
    return 0;
  }, [product?.compare_at_price, effectivePrice]);

  const imageUrls = useMemo(() => {
    const gallery = images.length
      ? images.map((m) => storagePublicUrl(m.storage_path) || "")
      : product?.hero_image_path
      ? [storagePublicUrl(product.hero_image_path) || ""]
      : [];
    return gallery.filter(Boolean);
  }, [images, product?.hero_image_path]);

  const inWishlist = product ? isInWishlist(product.id) : false;

  const handleAddToCart = async () => {
    if (!product) return;
    await addItem(product.id, quantity); // ✅ correct signature
    toast.success("Added to cart", {
      description: `${quantity} × ${product.name} added to your cart.`,
    });
  };

  const handleWishlistToggle = () => {
    if (!product) return;
    toggleWishlist(product.id);
    toast.success(inWishlist ? "Removed from wishlist" : "Added to wishlist");
  };

  const checkDelivery = () => {
    if (!pincode || pincode.length !== 6) {
      toast.error("Please enter a valid 6-digit pincode");
      return;
    }
    setIsCheckingPincode(true);
    setTimeout(() => {
      setDeliveryEstimate(
        "Expected delivery by " +
          new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString(
            "en-IN",
            {
              month: "short",
              day: "numeric",
            }
          )
      );
      setIsCheckingPincode(false);
      toast.success("Delivery available to your pincode");
    }, 800);
  };

  // Related products: same brand OR category (exclude current)
  const [related, setRelated] = useState<Product[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!product) return;
      const base = supabase
        .from("products")
        .select(
          `
        id, slug, name,
        price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
        hero_image_path, is_published,
        brands ( name )
      `
        )
        .eq("is_published", true)
        .neq("id", product.id);

      const brandFilter = product.brand_id
        ? base.eq("brand_id", product.brand_id)
        : base;
      const { data } = await brandFilter
        .order("created_at", { ascending: false })
        .limit(8);

      if (cancelled) return;
      setRelated((data ?? []) as Product[]);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [product]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            <div className="aspect-square rounded-lg bg-muted animate-pulse" />
            <div className="space-y-4">
              <div className="h-6 w-40 bg-muted rounded animate-pulse" />
              <div className="h-10 w-3/4 bg-muted rounded animate-pulse" />
              <div className="h-8 w-1/3 bg-muted rounded animate-pulse" />
              <div className="h-24 w-full bg-muted rounded animate-pulse" />
            </div>
          </div>
        )}

        {!loading && product && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
              {/* GALLERY */}
              <div>
                <div className="relative aspect-square mb-4 bg-muted rounded-lg overflow-hidden group">
                  {imageUrls[selectedImage] ? (
                    <Image
                      src={imageUrls[selectedImage]}
                      alt={images[selectedImage]?.alt || product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}
                  {discount > 0 && (
                    <Badge
                      className="absolute top-4 left-4"
                      variant="destructive"
                    >
                      {discount}% OFF
                    </Badge>
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setShowZoom(true)}
                  >
                    <ZoomIn className="h-5 w-5" />
                  </Button>
                </div>

                {imageUrls.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {imageUrls.map((src, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImage(idx)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                          selectedImage === idx
                            ? "border-primary"
                            : "border-transparent"
                        }`}
                      >
                        <Image
                          src={src}
                          alt={`${product.name} ${idx + 1}`}
                          fill
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* DETAILS */}
              <div className="space-y-6">
                {product.brands?.name && (
                  <p className="text-sm text-muted-foreground uppercase tracking-wide">
                    {product.brands.name}
                  </p>
                )}

                <h1 className="text-3xl font-bold">{product.name}</h1>

                {/* Rating placeholder (wire later) */}
                {/* {product.rating_avg && ... } */}

                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">
                    {formatINR(effectivePrice, product.currency)}
                  </span>
                  {product.compare_at_price != null &&
                    effectivePrice != null &&
                    product.compare_at_price > effectivePrice && (
                      <span className="text-xl text-muted-foreground line-through">
                        {formatINR(product.compare_at_price, product.currency)}
                      </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {saleActive && product.sale_ends_at && (
                    <Badge variant="outline" className="text-orange-600">
                      Sale ends{" "}
                      {new Date(product.sale_ends_at).toLocaleDateString(
                        "en-IN",
                        {
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </Badge>
                  )}
                  {product.new_until && new Date(product.new_until) >= now && (
                    <Badge variant="default">New</Badge>
                  )}
                  {product.is_featured && (
                    <Badge variant="default">Featured</Badge>
                  )}
                  {product.is_trending && (
                    <Badge variant="default">Trending</Badge>
                  )}
                </div>

                <div className="prose prose-sm max-w-none">
                  {product.description ? <p>{product.description}</p> : null}
                </div>

                {/* Quantity + CTAs */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center border rounded-lg">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                    >
                      -
                    </Button>
                    <span className="px-4 py-2 min-w-[3rem] text-center">
                      {quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuantity(quantity + 1)}
                    >
                      +
                    </Button>
                  </div>

                  <Button
                    size="lg"
                    className="flex-1"
                    onClick={handleAddToCart}
                  >
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    Add to Cart
                  </Button>

                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleWishlistToggle}
                  >
                    <Heart
                      className={`h-5 w-5 ${
                        inWishlist ? "fill-red-500 text-red-500" : ""
                      }`}
                    />
                  </Button>
                </div>

                {/* Share + shipping highlights */}
                <div className="flex items-center gap-4 pt-6 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => toast.info("Share options coming soon")}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>

                <Card className="mt-6">
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <Label htmlFor="pincode">Check Delivery</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          id="pincode"
                          placeholder="Enter Pincode"
                          value={pincode}
                          onChange={(e) =>
                            setPincode(
                              e.target.value.replace(/\D/g, "").slice(0, 6)
                            )
                          }
                          maxLength={6}
                        />
                        <Button
                          onClick={checkDelivery}
                          disabled={isCheckingPincode}
                        >
                          {isCheckingPincode ? "Checking..." : "Check"}
                        </Button>
                      </div>
                      {deliveryEstimate && (
                        <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                          <Truck className="h-4 w-4" />
                          {deliveryEstimate}
                        </p>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <Truck className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">Free Shipping</p>
                          <p className="text-muted-foreground">
                            On orders above ₹2,000
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <RotateCcw className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">Easy Returns</p>
                          <p className="text-muted-foreground">
                            7 days return policy
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">Secure Payment</p>
                          <p className="text-muted-foreground">
                            100% secure transactions
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Package className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">Authentic Products</p>
                          <p className="text-muted-foreground">
                            100% original Korean products
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* TABS */}
            <div className="mt-12">
              <Tabs defaultValue="description" className="w-full">
                <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
                  <TabsTrigger value="description">Description</TabsTrigger>
                  {/* <TabsTrigger value="reviews">Reviews</TabsTrigger> */}
                  {/* <TabsTrigger value="qa">Q&A</TabsTrigger> */}
                </TabsList>

                <TabsContent value="description" className="mt-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="prose prose-sm max-w-none">
                        {product.description ? (
                          <p>{product.description}</p>
                        ) : (
                          <p>No description.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ---- Reviews section temporarily disabled ---- */}
                {/* <TabsContent value="reviews" className="mt-6"> ... </TabsContent> */}

                {/* ---- FAQ / Q&A section temporarily disabled ---- */}
                {/* <TabsContent value="qa" className="mt-6"> ... </TabsContent> */}
              </Tabs>
            </div>

            {/* RELATED */}
            {related.length > 0 && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold mb-6">Related Products</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {related.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={
                        {
                          ...p,
                          hero_image_path: p.hero_image_path ?? undefined,
                          hero_image_url:
                            storagePublicUrl(p.hero_image_path) ?? undefined,
                          brands: p.brands ?? undefined,
                        } as any
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ZOOM DIALOG */}
      <Dialog open={showZoom} onOpenChange={setShowZoom}>
        <DialogContent className="max-w-4xl w-full p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Product Image</DialogTitle>
          </DialogHeader>
          <div className="relative aspect-square w-full">
            {imageUrls[selectedImage] ? (
              <Image
                src={imageUrls[selectedImage]}
                alt={product?.name || "Product image"}
                fill
                className="object-contain"
              />
            ) : (
              <div className="w-full h-full bg-muted" />
            )}
          </div>
          {imageUrls.length > 1 && (
            <div className="p-4 grid grid-cols-6 gap-2">
              {imageUrls.map((src, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`relative aspect-square rounded border-2 overflow-hidden ${
                    selectedImage === idx
                      ? "border-primary"
                      : "border-transparent"
                  }`}
                >
                  <Image
                    src={src}
                    alt={`Thumb ${idx + 1}`}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
