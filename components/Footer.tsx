import Link from 'next/link';
import { Facebook, Instagram, Twitter, Youtube } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function Footer() {
  return (
    <footer className="border-t bg-muted/50">
      <div className="container mx-auto py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Made Korea</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Your trusted source for authentic Korean beauty and lifestyle products.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="icon">
                <Facebook className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Instagram className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Twitter className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Youtube className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Shop</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/c/skincare" className="text-muted-foreground hover:text-primary transition-colors">
                  Skincare
                </Link>
              </li>
              <li>
                <Link href="/c/makeup" className="text-muted-foreground hover:text-primary transition-colors">
                  Makeup
                </Link>
              </li>
              <li>
                <Link href="/c/baby" className="text-muted-foreground hover:text-primary transition-colors">
                  Baby
                </Link>
              </li>
              <li>
                <Link href="/brands" className="text-muted-foreground hover:text-primary transition-colors">
                  All Brands
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Support</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/contact" className="text-muted-foreground hover:text-primary transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-muted-foreground hover:text-primary transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-primary transition-colors">
                  Terms & Conditions
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Newsletter</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Subscribe to get special offers and updates.
            </p>
            <div className="flex gap-2">
              <Input placeholder="Your email" type="email" />
              <Button>Subscribe</Button>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © 2024 Made Korea. All rights reserved.
            </p>
            <div className="flex gap-4 text-sm">
              <Link href="/admin" className="text-muted-foreground hover:text-primary transition-colors">
                Admin Portal
              </Link>
              <Link href="/vendor" className="text-muted-foreground hover:text-primary transition-colors">
                Vendor Portal
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
