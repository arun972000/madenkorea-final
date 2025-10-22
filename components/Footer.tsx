import Link from "next/link";
import { Facebook, Instagram, Twitter, Youtube } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function Footer() {
  return (
    <footer
      className="text-white"
      style={{ backgroundColor: "rgb(53,159,217)" }}
    >
      <div className="container mx-auto py-12 px-4">
        {/* ⬇️ 5 columns on large screens */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-5">
          {/* Column 1: About */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Made Korea</h3>
            <p className="text-sm text-white/90 mb-4">
              Made in Korea is your one-stop shop for the trendiest Asian
              fashion and beauty products. We offer an affordable, wide
              selection worldwide, plus the latest tips and secrets in beauty
              and styling..
            </p>
          </div>

          {/* Column 2: Seal / Logo */}
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center">
              {/* replace src with your seal/logo path */}
              <img
                src="logo-footer.png"
                alt="Made in Korea Product seal"
                className="h-20 w-20 object-contain"
                loading="lazy"
                decoding="async"
              />
              <p className="mt-3 text-sm font-semibold">
                Authentic Korean Products
              </p>
            </div>
          </div>

          {/* Column 3: Support */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Support</h3>
            <ul className="space-y-2 text-sm">
              {/* <li>
                <Link
                  href="/contact"
                  className="text-white/90 hover:text-white transition-colors"
                >
                  Contact Us
                </Link>
              </li> */}
              <li>
                <Link
                  href="/about"
                  className="text-white/90 hover:text-white transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-white/90 hover:text-white transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-white/90 hover:text-white transition-colors"
                >
                  Terms &amp; Conditions
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Disclaimer (two lines) */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Disclaimer</h3>
            <p className="text-sm text-white/90">
              We are solely a reseller of Korean beauty products and have no
              involvement in their formulation or manufacturing.
            </p>
          </div>

          {/* Column 5: Newsletter */}
          <div className="flex gap-2">
            <Button variant="link" size="icon" className="border-white/40">
              <Facebook className="h-4 w-4 text-white" />
            </Button>
            <Button variant="link" size="icon" className="border-white/40">
              <Instagram className="h-4 w-4 text-white" />
            </Button>
            <Button variant="link" size="icon" className="border-white/40">
              <Twitter className="h-4 w-4 text-white" />
            </Button>
            <Button variant="link" size="icon" className="border-white/40">
              <Youtube className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>

      </div>
    </footer>
  );
}
