// app/admin/invoices/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabaseClient';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  customer_name: string;
  total_amount: number;
  status: string;
  invoice_companies: {
    display_name: string;
  } | null;
};

export default function InvoicesListPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          id,
          invoice_number,
          invoice_date,
          customer_name,
          total_amount,
          status,
          invoice_companies:invoice_companies(display_name)
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        setError(error.message || 'Failed to load invoices');
      } else if (data) {
        setInvoices(data as InvoiceRow[]);
      }

      setLoading(false);
    };

    loadInvoices();
  }, []);

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.customer_name.toLowerCase().includes(q) ||
      inv.invoice_companies?.display_name.toLowerCase().includes(q)
    );
  });

  const renderStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    let className = 'border-slate-500 text-slate-700';
    if (s === 'DRAFT') className = 'border-yellow-500 text-yellow-700';
    if (s === 'SENT') className = 'border-blue-500 text-blue-700';
    if (s === 'PAID') className = 'border-green-600 text-green-700';
    if (s === 'CANCELLED') className = 'border-red-600 text-red-700';

    return (
      <Badge variant="outline" className={className}>
        {s}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto max-w-6xl py-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>View and manage all generated invoices.</CardDescription>
          </div>
          <Button onClick={() => router.push('/admin/invoices/new')}>
            + New Invoice
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search bar */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="w-full max-w-sm">
              <Input
                placeholder="Search by invoice no., customer, company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Errors / loading */}
          {error && (
            <div className="rounded-md border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading && (
            <div className="text-sm text-slate-600">Loading invoices...</div>
          )}

          {/* Table */}
          {!loading && filtered.length === 0 && (
            <div className="text-sm text-slate-500">No invoices found.</div>
          )}

          {filtered.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Invoice No.</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Company</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => {
                    const dateLabel = inv.invoice_date
                      ? new Date(inv.invoice_date).toLocaleDateString()
                      : '-';

                    return (
                      <tr key={inv.id} className="border-t">
                        <td className="px-3 py-2 align-middle font-medium">
                          {inv.invoice_number}
                        </td>
                        <td className="px-3 py-2 align-middle">{dateLabel}</td>
                        <td className="px-3 py-2 align-middle">
                          {inv.invoice_companies?.display_name || '-'}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {inv.customer_name}
                        </td>
                        <td className="px-3 py-2 align-middle text-right">
                          {inv.total_amount?.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 align-middle text-center">
                          {renderStatusBadge(inv.status)}
                        </td>
                        <td className="px-3 py-2 align-middle text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              router.push(`/admin/invoices/${inv.id}`)
                            }
                          >
                            View / Print
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
