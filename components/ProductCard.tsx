"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Check, Heart, ShoppingCart, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/contexts/CartContext";
import { useWishlist } from "@/lib/contexts/WishlistContext";
import { toast } from "sonner";

type ProductForCard = {
  id: string;
  slug: string;
  name: string;

  // pricing
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null; // MRP
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;

  // merchandising
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  new_until?: string | null; // if set and >= today → "New" badge

  // media
  hero_image_url?: string | null; // if precomputed server-side, we use this
  hero_image_path?: string | null; // otherwise we compute from storage

  // joins / misc
  brand_name?: string | null;
  brand?: { name?: string | null } | null;
  brands?: { name?: string | null } | null;
  rating_avg?: number | null;
  rating_count?: number | null;

  // short details
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;

  // optional inventory
  inventory?: { qty?: number; low_stock_threshold?: number } | null;
};

interface ProductCardProps {
  product: ProductForCard;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function currencyINR(value?: number | null, code?: string | null) {
  if (value == null) return "";
  const c = (code ?? "INR").toUpperCase();
  if (c === "INR") return `₹${value.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
    }).format(value);
  } catch {
    return `${c} ${value.toLocaleString()}`;
  }
}

function saleWindowActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function tinyDate(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(+dt)) return "";
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  // compute a public image URL if only a storage path is provided
  const [imageUrl, setImageUrl] = useState<string | null>(
    product.hero_image_url ?? null
  );
  useEffect(() => {
    if (!imageUrl && product.hero_image_path) {
      const { data } = supabase.storage
        .from("product-media")
        .getPublicUrl(product.hero_image_path);
      setImageUrl(data.publicUrl ?? null);
    }
  }, [imageUrl, product.hero_image_path]);

  // brand label from any of the shapes we might get
  const brandName = useMemo(
    () =>
      product.brand_name ?? product.brand?.name ?? product.brands?.name ?? null,
    [product.brand_name, product.brand, product.brands]
  );

  // sale / pricing
  const saleActive = useMemo(() => {
    if (product.sale_price == null) return false;
    return saleWindowActive(
      product.sale_starts_at ?? null,
      product.sale_ends_at ?? null
    );
  }, [product.sale_price, product.sale_starts_at, product.sale_ends_at]);

  const effectivePrice = useMemo(
    () =>
      saleActive && product.sale_price != null
        ? product.sale_price
        : product.price ?? null,
    [saleActive, product.sale_price, product.price]
  );

  const discountPct = useMemo(() => {
    if (product.compare_at_price && effectivePrice != null) {
      const pct = Math.round(
        (1 - effectivePrice / product.compare_at_price) * 100
      );
      return pct > 0 ? pct : 0;
    }
    return 0;
  }, [effectivePrice, product.compare_at_price]);

  const saveAmount =
    discountPct > 0 && product.compare_at_price && effectivePrice != null
      ? product.compare_at_price - effectivePrice
      : 0;

  // merch badges
  const isNew = useMemo(() => {
    if (!product.new_until) return false;
    const d = new Date(product.new_until);
    return !Number.isNaN(+d) && new Date() <= d;
  }, [product.new_until]);

  const isOut = product.inventory?.qty === 0;
  const isLow =
    !!product.inventory?.qty &&
    !!product.inventory?.low_stock_threshold &&
    (product.inventory?.qty ?? 0) <=
      (product.inventory?.low_stock_threshold ?? 0) &&
    !isOut;

  // short details line
  const detailsLine = useMemo(() => {
    const bits: string[] = [];
    if (product.volume_ml != null) bits.push(`${+product.volume_ml} ml`);
    if (product.net_weight_g != null) bits.push(`${+product.net_weight_g} g`);
    if (product.country_of_origin) bits.push(product.country_of_origin);
    return bits.join(" · ");
  }, [product.volume_ml, product.net_weight_g, product.country_of_origin]);

  // wishlist state
  const wish = isInWishlist(product.id);

  // add-to-cart feedback
  const [justAdded, setJustAdded] = useState(false);

  const onAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault(); // keep card link from navigating
    if (isOut) return;
    await addItem(product.id, 1);
    setJustAdded(true);
    toast.success("Added to cart", { description: product.name });
    setTimeout(() => setJustAdded(false), 1500);
  };

  const onWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleWishlist(product.id);
    toast.success(wish ? "Removed from wishlist" : "Added to wishlist", {
      description: product.name,
    });
  };

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block"
      prefetch={false}
    >
      {/* IMAGE + OVERLAYS */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted mb-3">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 25vw"
            priority={false}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" />
        )}

        {/* badges (top-left) */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {discountPct > 0 && (
            <Badge variant="destructive">{discountPct}% OFF</Badge>
          )}
          {isOut && <Badge variant="secondary">Out of stock</Badge>}
          {!isOut && isLow && <Badge variant="outline">Low stock</Badge>}
          {product.is_featured ? <Badge>Featured</Badge> : null}
          {product.is_trending ? <Badge>Trending</Badge> : null}
          {isNew ? <Badge>New</Badge> : null}
        </div>

        {/* actions (top-right) */}
        <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon"
            variant="secondary"
            onClick={onWishlist}
            aria-label="Wishlist"
          >
            <Heart
              className={`h-4 w-4 ${wish ? "fill-red-500 text-red-500" : ""}`}
            />
          </Button>
        </div>

        {/* desktop CTA (bottom-right) */}
        <div className="absolute bottom-2 right-2 hidden sm:block opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon"
            onClick={onAddToCart}
            disabled={!!isOut}
            aria-label="Add to cart"
          >
            {justAdded ? (
              <Check className="h-4 w-4" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* TEXT BLOCK */}
      <div className="space-y-1">
        {brandName && (
          <p className="text-xs sm:text-sm text-muted-foreground">
            {brandName}
          </p>
        )}

        <h3
          className="font-medium transition-colors group-hover:text-primary
             overflow-hidden text-ellipsis whitespace-nowrap
             whitespace-normal md:line-clamp-2"
        >
          {product.name}
        </h3>

        {/* details or short description */}
        {detailsLine ? (
          <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">
            {detailsLine}
          </p>
        ) : product.short_description ? (
          <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">
            {product.short_description}
          </p>
        ) : null}

        {/* rating (optional) */}
        <div className="flex items-center gap-1">
          {typeof product.rating_avg === "number" && (
            <>
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">
                {product.rating_avg.toFixed(1)}
              </span>
              {typeof product.rating_count === "number" && (
                <span className="text-xs sm:text-sm text-muted-foreground">
                  ({product.rating_count})
                </span>
              )}
            </>
          )}
        </div>

        {/* PRICES */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-base sm:text-lg font-bold">
            {currencyINR(effectivePrice, product.currency)}
          </span>

          {/* MRP strike-through when discounted */}
          {product.compare_at_price != null &&
            effectivePrice != null &&
            product.compare_at_price > effectivePrice && (
              <span className="text-xs sm:text-sm text-muted-foreground line-through">
                {currencyINR(product.compare_at_price, product.currency)}
              </span>
            )}

          {/* Save pill */}
          {discountPct > 0 && saveAmount > 0 && (
            <span className="text-[11px] font-medium rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
              Save {currencyINR(saveAmount, product.currency)} ({discountPct}%
              OFF)
            </span>
          )}

          {/* Sale end hint */}
          {saleActive && product.sale_ends_at && (
            <span className="ml-auto text-[11px] text-orange-600">
              Ends {tinyDate(product.sale_ends_at)}
            </span>
          )}
        </div>

        {/* mobile CTA */}
        <div className="sm:hidden pt-2">
          <Button
            className="w-full"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              onAddToCart(e);
            }}
            disabled={!!isOut}
          >
            {justAdded ? (
              <>
                <Check className="mr-2 h-4 w-4" /> Added
              </>
            ) : (
              <>
                <ShoppingCart className="mr-2 h-4 w-4" /> Add to cart
              </>
            )}
          </Button>
        </div>
      </div>
    </Link>
  );
}

// optional default export for flexible imports
export default ProductCard;
