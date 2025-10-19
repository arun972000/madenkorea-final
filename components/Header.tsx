"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  Search,
  User,
  Heart,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { useCart } from "@/lib/contexts/CartContext";
import { useWishlist } from "@/lib/contexts/WishlistContext";
import { useAuth } from "@/lib/contexts/AuthContext";

import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "./ui/navigation-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { SearchAutocomplete } from "./SearchAutocomplete";

type DictRow = { slug: string; name: string; product_count: number };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

// tweak if you want different sizing
const LOGO_PX = 64; // logo width/height (px)
const HEADER_H_CLASS = "h-20"; // header height class (e.g., h-20 / h-24)

export function Header() {
  const { totalItems } = useCart();
  const { wishlistCount } = useWishlist();
  const { isAuthenticated } = useAuth();

  const [showSearch, setShowSearch] = useState(false);
  const [categories, setCategories] = useState<DictRow[] | null>(null);
  const [brands, setBrands] = useState<DictRow[] | null>(null);
  const [loadingDicts, setLoadingDicts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDicts(true);

      // products.category_id -> categories.id
      // products.brand_id    -> brands.id
      const [{ data: cats, error: cErr }, { data: brs, error: bErr }] =
        await Promise.all([
          supabase
            .from("categories")
            .select("slug,name,products(count)")
            .eq("products.is_published", true)
            .is("products.deleted_at", null)
            .order("name", { ascending: true }),
          supabase
            .from("brands")
            .select("slug,name,products(count)")
            .eq("products.is_published", true)
            .is("products.deleted_at", null)
            .order("name", { ascending: true }),
        ]);

      if (cancelled) return;

      const withCount = (rows: any[] | null): DictRow[] =>
        (rows ?? []).map((r) => ({
          slug: r.slug,
          name: r.name,
          product_count: Array.isArray(r.products)
            ? r.products[0]?.count ?? 0
            : 0,
        }));

      if (!cErr) setCategories(withCount(cats));
      if (!bErr) setBrands(withCount(brs));
      setLoadingDicts(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sort: items with products first, then by name
  const byAvailThenName = (a: DictRow, b: DictRow) => {
    const aa = (a.product_count ?? 0) > 0 ? 0 : 1;
    const bb = (b.product_count ?? 0) > 0 ? 0 : 1;
    if (aa !== bb) return aa - bb;
    return a.name.localeCompare(b.name);
  };

  const sortedCats = useMemo(
    () => [...(categories ?? [])].sort(byAvailThenName),
    [categories]
  );
  const sortedBrands = useMemo(
    () => [...(brands ?? [])].sort(byAvailThenName),
    [brands]
  );

  const topCats = useMemo(() => sortedCats.slice(0, 8), [sortedCats]);
  const topBrands = useMemo(() => sortedBrands.slice(0, 10), [sortedBrands]);

  const DisabledItem = ({ children }: { children: React.ReactNode }) => (
    <div
      role="link"
      aria-disabled="true"
      tabIndex={-1}
      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed select-none"
    >
      {children}
    </div>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto">
        {/* Top row */}
        <div className={`flex ${HEADER_H_CLASS} items-center justify-between`}>
          {/* Left cluster: burger + logo + desktop nav */}
          <div className="flex items-center gap-2 md:gap-6">
            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
                <div className="px-5 py-4 flex items-center justify-between">
                  <Link href="/" className="flex items-center">
                    <Image
                      src="/squar-logo.png"
                      alt="Made Korea"
                      width={48}
                      height={48}
                      className="rounded-md"
                      priority
                    />
                  </Link>
                </div>
                <Separator />
                <ScrollArea className="h-[calc(100dvh-5rem)] px-2 py-4">
                  <nav className="px-3">
                    <Accordion type="multiple" className="w-full">
                      {/* Categories (mobile) */}
                      <AccordionItem value="categories">
                        <AccordionTrigger className="text-base">
                          Categories
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="space-y-1">
                            {sortedCats.map((c) => {
                              const disabled = (c.product_count ?? 0) === 0;
                              return (
                                <li key={c.slug}>
                                  {disabled ? (
                                    <DisabledItem>
                                      <span>{c.name}</span>
                                      <ChevronRight className="h-4 w-4 opacity-60" />
                                    </DisabledItem>
                                  ) : (
                                    <Link
                                      href={`/c/${c.slug}`}
                                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent"
                                    >
                                      <span>{c.name}</span>
                                      <ChevronRight className="h-4 w-4 opacity-60" />
                                    </Link>
                                  )}
                                </li>
                              );
                            })}
                            {!sortedCats.length && (
                              <li className="px-3 py-2 text-sm text-muted-foreground">
                                {loadingDicts ? "Loading…" : "No categories"}
                              </li>
                            )}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Brands (mobile) */}
                      <AccordionItem value="brands">
                        <AccordionTrigger className="text-base">
                          Brands
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="space-y-1">
                            <li>
                              <Link
                                href={"/brands"}
                                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent"
                              >
                                <span>All Brands</span>
                                <ChevronRight className="h-4 w-4 opacity-60" />
                              </Link>
                            </li>
                            {sortedBrands.map((b) => {
                              const disabled = (b.product_count ?? 0) === 0;
                              return (
                                <li key={b.slug}>
                                  {disabled ? (
                                    <DisabledItem>
                                      <span>{b.name}</span>
                                      <ChevronRight className="h-4 w-4 opacity-60" />
                                    </DisabledItem>
                                  ) : (
                                    <Link
                                      href={`/brands/${b.slug}`}
                                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent"
                                    >
                                      <span>{b.name}</span>
                                      <ChevronRight className="h-4 w-4 opacity-60" />
                                    </Link>
                                  )}
                                </li>
                              );
                            })}
                            {!sortedBrands.length && (
                              <li className="px-3 py-2 text-sm text-muted-foreground">
                                {loadingDicts ? "Loading…" : "No brands"}
                              </li>
                            )}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </nav>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            {/* Logo (desktop) */}
            <Link href="/" className="flex items-center">
              <Image
                src="/squar-logo.png"
                alt="Made Korea"
                width={LOGO_PX}
                height={LOGO_PX}
                className="rounded-md"
                priority
              />
            </Link>

            {/* Desktop nav with dynamic dropdowns */}
            <nav className="hidden md:block">
              <NavigationMenu>
                <NavigationMenuList>
                  {/* Categories (desktop) */}
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="text-sm">
                      Categories
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="grid w-[640px] max-w-[80vw] grid-cols-2 gap-2 p-4 md:grid-cols-3">
                        {topCats.map((c) => {
                          const disabled = (c.product_count ?? 0) === 0;
                          const base = "rounded-lg p-3 text-sm";
                          return disabled ? (
                            <div
                              key={c.slug}
                              className={`${base} opacity-50 cursor-not-allowed select-none`}
                            >
                              <div className="font-medium">{c.name}</div>
                            </div>
                          ) : (
                            <Link
                              key={c.slug}
                              href={`/c/${c.slug}`}
                              className={`${base} hover:bg-accent`}
                            >
                              <div className="font-medium">{c.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Shop {c.name}
                              </div>
                            </Link>
                          );
                        })}
                        {!sortedCats.length && (
                          <div className="col-span-full p-3 text-sm text-muted-foreground">
                            {loadingDicts
                              ? "Loading categories…"
                              : "No categories found"}
                          </div>
                        )}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  {/* Brands (desktop) */}
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="text-sm">
                      Brands
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="grid w-[720px] max-w-[90vw] grid-cols-2 gap-2 p-4 md:grid-cols-3 lg:grid-cols-4">
                        <Link
                          href={"/brands"}
                          className="rounded-lg p-3 text-sm hover:bg-accent"
                        >
                          <div className="font-medium">All Brands</div>
                          <div className="text-xs text-muted-foreground">
                            Explore All
                          </div>
                        </Link>

                        {topBrands.map((b) => {
                          const disabled = (b.product_count ?? 0) === 0;
                          const base = "rounded-lg p-3 text-sm";
                          return disabled ? (
                            <div
                              key={b.slug}
                              className={`${base} opacity-50 cursor-not-allowed select-none`}
                            >
                              <div className="font-medium">{b.name}</div>
                            </div>
                          ) : (
                            <Link
                              key={b.slug}
                              href={`/brands/${b.slug}`}
                              className={`${base} hover:bg-accent`}
                            >
                              <div className="font-medium">{b.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Explore {b.name}
                              </div>
                            </Link>
                          );
                        })}
                        {!sortedBrands.length && (
                          <div className="col-span-full p-3 text-sm text-muted-foreground">
                            {loadingDicts
                              ? "Loading brands…"
                              : "No brands found"}
                          </div>
                        )}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </nav>
          </div>

          {/* Right cluster: search + account/wishlist/cart */}
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden lg:block w-[360px]">
              <SearchAutocomplete />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setShowSearch((s) => !s)}
              aria-label="Toggle search"
            >
              {showSearch ? (
                <X className="h-5 w-5" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </Button>

            <Button variant="ghost" size="icon" asChild aria-label="Account">
              <Link href={isAuthenticated ? "/account" : "/auth/login"}>
                <User className="h-5 w-5" />
                <span className="sr-only">Account</span>
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="relative"
              asChild
              aria-label="Wishlist"
            >
              <Link href="/account/wishlist">
                <Heart className="h-5 w-5" />
                {wishlistCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {wishlistCount}
                  </Badge>
                )}
                <span className="sr-only">Wishlist</span>
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="relative"
              asChild
              aria-label="Cart"
            >
              <Link href="/cart">
                <ShoppingCart className="h-5 w-5" />
                {totalItems > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {totalItems}
                  </Badge>
                )}
                <span className="sr-only">Cart</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Mobile search bar */}
        {showSearch && (
          <div className="lg:hidden pb-3 px-0.5">
            <SearchAutocomplete />
          </div>
        )}
      </div>
    </header>
  );
}
