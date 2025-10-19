'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { ProductForm } from '@/components/admin/ProductForm';
import { toast } from 'sonner';
import { mockProducts } from '@/lib/mock-data';

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const productId = params.id as string;

  const product = mockProducts.find(p => p.id === productId);

  if (!hasRole('admin')) {
    router.push('/admin');
    return null;
  }

  if (!product) {
    router.push('/admin/products');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const handleSave = (updatedProduct: any) => {
    toast.success('Product updated successfully');
    router.push('/admin/products');
  };

  const handleCancel = () => {
    router.push('/admin/products');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin/products')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Edit Product</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <ProductForm product={product} onSave={handleSave} onCancel={handleCancel} />
      </div>
    </div>
  );
}
