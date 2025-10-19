'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card } from '../ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

type Brand = {
  id: string;
  slug: string;
  name: string;
  logo: string;              // public URL
  product_count?: number;
};

export function BrandCarousel({ brands }: { brands: Brand[] }) {
  if (!brands || brands.length === 0) return null;

  return (
    <section>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Shop by Brand</h2>
        <p className="text-muted-foreground">
          Discover products from your favorite K-Beauty brands
        </p>
      </div>

      <Carousel opts={{ align: 'start', loop: false }}>
        <CarouselContent>
          {brands.map((brand) => {
            const hasProducts = (brand.product_count ?? 0) > 0;

            const CardInner = (
              <Card
                className={[
                  'p-6 transition-shadow h-full flex flex-col items-center justify-center',
                  hasProducts ? 'hover:shadow-lg cursor-pointer' : 'opacity-60 cursor-not-allowed',
                ].join(' ')}
              >
                <div className="relative w-full aspect-square mb-3">
                  <Image src={brand.logo} alt={brand.name} fill className="object-contain" />
                </div>
                <h3 className="font-semibold text-center">{brand.name}</h3>
                {/* {typeof brand.product_count === 'number' && (
                  <p className="text-sm text-muted-foreground text-center">
                    {brand.product_count} products
                  </p>
                )} */}
              </Card>
            );

            return (
              <CarouselItem
                key={brand.id}
                className="basis-1/2 sm:basis-1/3 lg:basis-1/5" // 2/3/4 per view
              >
                {hasProducts ? (
                  <Link href={`/brand/${brand.slug}`}>{CardInner}</Link>
                ) : (
                  // No link when product_count is 0
                  <div aria-disabled="true" className="pointer-events-none">
                    {CardInner}
                  </div>
                )}
              </CarouselItem>
            );
          })}
        </CarouselContent>

        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </section>
  );
}
