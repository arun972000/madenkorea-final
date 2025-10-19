import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Award, Globe, Heart, ShieldCheck } from "lucide-react";

export default function AboutPage() {
  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4">About Made Korea</h1>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            Your trusted destination for authentic Korean beauty and lifestyle
            products, bringing the best of Consumer Innovations directly to your
            doorstep.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardContent className="pt-6">
              <Award className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Premium Quality</h3>
              <p className="text-muted-foreground">
                We carefully curate and source only authentic products from
                trusted Korean brands, ensuring the highest quality standards
                for our customers.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Globe className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Global Reach</h3>
              <p className="text-muted-foreground">
                Connecting beauty enthusiasts worldwide with Korea's finest
                products, we ship across India with fast and reliable delivery
                services.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Heart className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Customer First</h3>
              <p className="text-muted-foreground">
                Your satisfaction is our priority. We provide exceptional
                customer service, hassle-free returns, and personalized beauty
                recommendations.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <ShieldCheck className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">100% Authentic</h3>
              <p className="text-muted-foreground">
                All our products are sourced directly from official distributors
                and brands in Korea. We guarantee authenticity on every
                purchase.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="prose prose-lg max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-6">Our Story</h2>

          <p className="text-muted-foreground mb-6">
            Made Korea was founded with a simple mission: to make authentic
            Korean beauty and lifestyle products accessible to everyone in
            India. What started as a passion for Consumer Innovations has grown
            into a trusted marketplace connecting thousands of customers with
            their favorite Korean brands.
          </p>

          <p className="text-muted-foreground mb-6">
            We understand the challenges of finding genuine Korean products
            locally, which is why we've built strong partnerships with verified
            vendors and brands in Korea. Our team personally tests and verifies
            each product to ensure it meets our strict quality standards.
          </p>

          <h2 className="text-3xl font-bold mb-6 mt-12">Why Choose Us</h2>

          <ul className="space-y-4 text-muted-foreground mb-6">
            <li className="flex gap-3">
              <span className="text-primary font-bold">•</span>
              <span>
                <strong>Authenticity Guaranteed:</strong> Direct sourcing from
                Korea ensures 100% genuine products
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">•</span>
              <span>
                <strong>Curated Selection:</strong> Hand-picked products from
                the best Consumer Innovations brands
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">•</span>
              <span>
                <strong>Competitive Pricing:</strong> Best prices without
                compromising on quality
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">•</span>
              <span>
                <strong>Fast Shipping:</strong> Quick and reliable delivery
                across India
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">•</span>
              <span>
                <strong>Expert Support:</strong> Beauty experts ready to help
                with product recommendations
              </span>
            </li>
          </ul>

          <h2 className="text-3xl font-bold mb-6 mt-12">Our Commitment</h2>

          <p className="text-muted-foreground mb-6">
            We're committed to providing not just products, but a complete
            Consumer Innovations experience. From skincare routines to makeup
            trends, we keep you updated with the latest from Korea's beauty
            industry. Our blog and social media channels share tips, tutorials,
            and insights to help you make the most of your purchases.
          </p>

          <p className="text-muted-foreground">
            Join thousands of satisfied customers who trust Made Korea for their
            Consumer Innovations needs. Experience the difference of authentic
            Korean products today.
          </p>
        </div>
      </div>
    </CustomerLayout>
  );
}
