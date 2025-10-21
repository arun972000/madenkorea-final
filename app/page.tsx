// app/page.tsx
import { CustomerLayout } from "@/components/CustomerLayout";
import { HeroBanner } from "@/components/home/HeroBanner";
import { getBanners } from "./_data/getBanners";
import { EditorialSection } from "@/components/home/EditorialSection";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { getBrandsForCarousel } from "./_data/getBrands";
import { ProductVideoCarousel } from "@/components/home/ProductVideoCarousel";
import { InstagramVideoCarousel } from "@/components/home/InstagramVideoCarousel";
import { getInfluencerVideos } from "./_data/getInfluencerVideos";
import {
  mockBanners,
  mockProducts,
  mockBrands,
  mockProductVideos,
  mockInfluencerVideos,
} from "@/lib/mock-data";
import { createClient } from "@supabase/supabase-js";
import HomeVideoCarouselSection from "@/components/home/HomeVideoCarouselSection";
import CertificationSwiper from "@/components/Cetifications";

export const revalidate = 300; // ISR: refresh the home data every 5 minutes

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const supabase = supabaseServer();
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
  return data.publicUrl ?? null;
}

type CardProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  new_until?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  hero_image_path?: string | null;
  brands?: { name?: string | null } | null;
};

async function fetchEditorial(
  kind: "featured" | "trending",
  limit = 8
): Promise<CardProduct[]> {
  const supabase = supabaseServer();

  let query = supabase
    .from("products")
    .select(
      `
      id, slug, name,
      price, currency,
      compare_at_price, sale_price, sale_starts_at, sale_ends_at,
      is_featured, is_trending, new_until,
      short_description, volume_ml, net_weight_g, country_of_origin,
      hero_image_path,
      brands ( name )
    `
    )
    .eq("is_published", true);

  if (kind === "featured") {
    // If you added featured_rank, this will naturally order featured products.
    query = query
      .eq("is_featured", true)
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    // Trending: order by purchases_count if you added it; fallback by created_at
    query = query
      .eq("is_trending", true)
      .order("purchases_count", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false });
  }

  const { data, error } = await query.limit(limit);
  if (error) {
    console.error("fetchEditorial error", kind, error);
    return [];
  }

  // Add server-computed public URL (faster than letting the card compute client-side)
  return (data ?? []).map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  }));
}

export default async function Home() {
  // Keep your existing mock-driven sections (banners, videos, etc.)
  const banners = await getBanners("home");

  const brands = await getBrandsForCarousel("site-assets");

  const homebanners = mockBanners.filter(
    (b) => b.page_scope === "home" && b.active
  );
  const bestsellerProducts = mockProducts.filter(
    (p) => p.editorial_flags.bestseller && p.status === "active"
  );
  const newArrivalProducts = mockProducts.filter(
    (p) => p.editorial_flags.new_arrival && p.status === "active"
  );
  const activeProductVideos = mockProductVideos.filter((v) => v.active);
  const activeInfluencerVideos = mockInfluencerVideos.filter((v) => v.active);

  const influencerVideos = await getInfluencerVideos("home", 12);

  // 🔥 Dynamic sections from Supabase
  const [trendingProducts, featuredProducts] = await Promise.all([
    fetchEditorial("trending", 8),
    fetchEditorial("featured", 8),
  ]);

  return (
    <CustomerLayout>
      <HeroBanner banners={banners} />

      <div className="container mx-auto py-12 space-y-16">
        {/* Trending from Supabase */}
        {trendingProducts.length > 0 && (
          <EditorialSection
            title="Trending Now"
            description="The hottest Consumer Innovations products everyone's talking about"
            products={trendingProducts}
          />
        )}

        {/* (Optional) Keep existing Best Sellers from mocks until you wire it up */}
        {/* {bestsellerProducts.length > 0 && (
          <EditorialSection
            title="Best Sellers"
            description="Customer favorites and top-rated products"
            products={bestsellerProducts.slice(0, 8) as any}
          />
        )} */}

        <HomeVideoCarouselSection pageScope="home" limit={8} />

        <BrandCarousel brands={brands} />

        {/* (Optional) Keep New Arrivals from mocks until you wire it up */}
        {/* {newArrivalProducts.length > 0 && (
          <EditorialSection
            title="New Arrivals"
            description="Fresh from Korea: Latest beauty innovations"
            products={newArrivalProducts.slice(0, 8) as any}
          />
        )} */}

        {/* Featured from Supabase */}
        {featuredProducts.length > 0 && (
          <EditorialSection
            title="Featured Products"
            description=""
            products={featuredProducts}
          />
        )}

        {influencerVideos.length > 0 && (
          <InstagramVideoCarousel videos={influencerVideos} />
        )}
        <CertificationSwiper />
      </div>
    </CustomerLayout>
  );
}
