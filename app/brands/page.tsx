import Image from 'next/image';
import Link from 'next/link';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Card } from '@/components/ui/card';
import { mockBrands } from '@/lib/mock-data';

export const metadata = {
  title: 'All Brands | Made Korea',
  description: 'Browse all Korean beauty brands available at Made Korea',
};

export default function BrandsPage() {
  const groupedBrands = mockBrands.reduce((acc, brand) => {
    const firstLetter = brand.name[0].toUpperCase();
    if (!acc[firstLetter]) {
      acc[firstLetter] = [];
    }
    acc[firstLetter].push(brand);
    return acc;
  }, {} as Record<string, typeof mockBrands>);

  const sortedLetters = Object.keys(groupedBrands).sort();

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">All Brands</h1>
          <p className="text-lg text-muted-foreground">
            Discover premium Korean beauty brands at Made Korea
          </p>
        </div>

        <div className="space-y-12">
          {sortedLetters.map((letter) => (
            <div key={letter} id={letter}>
              <h2 className="text-2xl font-bold mb-6 border-b pb-2">{letter}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {groupedBrands[letter].map((brand) => (
                  <Link key={brand.id} href={`/brand/${brand.slug}`}>
                    <Card className="p-6 hover:shadow-lg transition-shadow h-full flex flex-col items-center justify-center">
                      <div className="relative w-full aspect-square mb-4">
                        <Image
                          src={brand.logo}
                          alt={brand.name}
                          fill
                          className="object-contain"
                        />
                      </div>
                      <h3 className="font-semibold text-center mb-1">{brand.name}</h3>
                      {brand.product_count !== undefined && (
                        <p className="text-sm text-muted-foreground text-center">
                          {brand.product_count} products
                        </p>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </CustomerLayout>
  );
}
