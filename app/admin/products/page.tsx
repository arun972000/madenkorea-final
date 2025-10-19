'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Plus, Edit, Trash2, LogOut, Filter, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { mockProducts, mockBrands, mockCategories } from '@/lib/mock-data';

export default function AdminProductsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  if (!hasRole('admin')) {
    router.push('/admin');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const filteredProducts = mockProducts.filter(product => {
    const matchesSearch =
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesBrand = filterBrand === 'all' || product.brand_id === filterBrand;
    const matchesCategory =
      filterCategory === 'all' || product.category_ids.includes(filterCategory);
    const matchesStatus = filterStatus === 'all' || product.status === filterStatus;

    return matchesSearch && matchesBrand && matchesCategory && matchesStatus;
  });

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id));
    }
  };

  const handleBulkAction = (action: string) => {
    if (selectedProducts.length === 0) {
      toast.error('Please select products first');
      return;
    }

    switch (action) {
      case 'activate':
        toast.success(`${selectedProducts.length} product(s) activated`);
        break;
      case 'hide':
        toast.success(`${selectedProducts.length} product(s) hidden`);
        break;
      case 'delete':
        toast.success(`${selectedProducts.length} product(s) deleted`);
        break;
      default:
        toast.info('Action coming soon');
    }

    setSelectedProducts([]);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Products Management</h1>
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
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Product Catalog</CardTitle>
                <CardDescription>Manage your product inventory and listings</CardDescription>
              </div>
              <Button onClick={() => router.push('/admin/products/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-6 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products by name or brand..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
              </div>

              {showFilters && (
                <div className="grid grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/50">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Brand</label>
                    <Select value={filterBrand} onValueChange={setFilterBrand}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Brands</SelectItem>
                        {mockBrands.map(brand => (
                          <SelectItem key={brand.id} value={brand.id}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Category</label>
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {mockCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Status</label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="hidden">Hidden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {selectedProducts.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
                  <span className="text-sm font-medium">
                    {selectedProducts.length} product(s) selected
                  </span>
                  <div className="flex gap-2 ml-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkAction('activate')}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Activate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkAction('hide')}
                    >
                      <EyeOff className="h-4 w-4 mr-1" />
                      Hide
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleBulkAction('delete')}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedProducts.includes(product.id)}
                          onCheckedChange={() => toggleProductSelection(product.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{product.title}</TableCell>
                      <TableCell>{product.brand_name || 'N/A'}</TableCell>
                      <TableCell>₹{product.price.toLocaleString('en-IN')}</TableCell>
                      <TableCell>{product.inventory.qty}</TableCell>
                      <TableCell>
                        <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                          {product.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/products/${product.id}`)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => {
                            if (confirm('Are you sure you want to delete this product?')) {
                              toast.success('Product deleted successfully');
                            }
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No products found matching your search.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
