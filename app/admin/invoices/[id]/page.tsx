// app/admin/invoices/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import supabase from '@/lib/supabaseClient';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type InvoiceCompany = {
  id: string;
  display_name: string;
  legal_name: string | null;
  address: string | null;
  gst_number: string | null;
  pan_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  swift_code: string | null;
  phone: string | null;
  email: string | null;
};

type InvoiceItem = {
  id: string;
  description: string;
  hsn_sac: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_percent: number;
  line_subtotal: number;
  line_tax_amount: number;
  line_total: number;
  position: number;
};

type InvoiceDetail = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  customer_name: string;
  billing_address: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  gst_number: string | null;
  pan_number: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  status: string;
  invoice_companies: InvoiceCompany | null;
  invoice_items: InvoiceItem[];
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params?.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) return;

    const loadInvoice = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          *,
          invoice_companies:invoice_companies(*),
          invoice_items:invoice_items(*)
        `
        )
        .eq('id', invoiceId)
        .single();

      if (error) {
        console.error(error);
        setError(error.message || 'Failed to load invoice');
      } else if (data) {
        // sort items by position
        const sortedItems = (data.invoice_items || []).sort(
          (a: InvoiceItem, b: InvoiceItem) => a.position - b.position,
        );

        setInvoice({
          ...(data as any),
          invoice_items: sortedItems,
        });
      }

      setLoading(false);
    };

    loadInvoice();
  }, [invoiceId]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl py-6">
        <div className="text-sm text-slate-600">Loading invoice...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-5xl py-6 space-y-3">
        <div className="text-sm text-red-700">
          Error loading invoice: {error}
        </div>
        <Button variant="outline" onClick={() => router.push('/admin/invoices')}>
          Back to list
        </Button>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="container mx-auto max-w-5xl py-6 space-y-3">
        <div className="text-sm text-slate-600">Invoice not found.</div>
        <Button variant="outline" onClick={() => router.push('/admin/invoices')}>
          Back to list
        </Button>
      </div>
    );
  }

  const company = invoice.invoice_companies;

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-4">
      {/* Top bar (hidden in print) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div className="text-sm text-slate-600">
          Invoice Detail &amp; Print View
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/invoices')}>
            Back to list
          </Button>
          <Button onClick={handlePrint}>Print Invoice</Button>
        </div>
      </div>

      {/* Printable invoice layout */}
      <Card className="p-6 print:shadow-none print:border-none">
        {/* Header: company + invoice meta */}
        <div className="flex flex-col gap-6 border-b pb-4 md:flex-row md:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">
              {company?.display_name || 'Company Name'}
            </h1>
            {company?.legal_name && (
              <p className="text-xs text-slate-600">{company.legal_name}</p>
            )}
            {company?.address && (
              <p className="max-w-md text-xs text-slate-600 whitespace-pre-line">
                {company.address}
              </p>
            )}
            <div className="mt-2 space-y-0.5 text-xs text-slate-700">
              {company?.gst_number && <p>GST: {company.gst_number}</p>}
              {company?.pan_number && <p>PAN: {company.pan_number}</p>}
              {company?.phone && <p>Phone: {company.phone}</p>}
              {company?.email && <p>Email: {company.email}</p>}
            </div>
          </div>

          <div className="space-y-1 text-sm md:text-right">
            <h2 className="text-lg font-semibold">INVOICE</h2>
            <p>
              <span className="font-medium">Invoice No: </span>
              {invoice.invoice_number}
            </p>
            <p>
              <span className="font-medium">Invoice Date: </span>
              {formatDate(invoice.invoice_date)}
            </p>
            <p>
              <span className="font-medium">Due Date: </span>
              {formatDate(invoice.due_date)}
            </p>
            <p>
              <span className="font-medium">Status: </span>
              {invoice.status}
            </p>
          </div>
        </div>

        {/* Bill to + contact */}
        <div className="mt-4 grid gap-6 border-b pb-4 md:grid-cols-2">
          <div className="space-y-1 text-sm">
            <h3 className="font-semibold">Bill To</h3>
            <p className="font-medium">{invoice.customer_name}</p>
            {invoice.billing_address && (
              <p className="whitespace-pre-line text-xs text-slate-700">
                {invoice.billing_address}
              </p>
            )}
            <div className="mt-2 space-y-0.5 text-xs text-slate-700">
              {invoice.gst_number && <p>GST: {invoice.gst_number}</p>}
              {invoice.pan_number && <p>PAN: {invoice.pan_number}</p>}
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <h3 className="font-semibold">Contact</h3>
            {invoice.contact_person && (
              <p>
                <span className="font-medium">Contact Person: </span>
                {invoice.contact_person}
              </p>
            )}
            {invoice.phone && (
              <p>
                <span className="font-medium">Phone: </span>
                {invoice.phone}
              </p>
            )}
            {invoice.email && (
              <p>
                <span className="font-medium">Email: </span>
                {invoice.email}
              </p>
            )}
          </div>
        </div>

        {/* Items table */}
        <div className="mt-4">
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Description</th>
                <th className="px-2 py-2 text-left">HSN/SAC</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Unit Price</th>
                <th className="px-2 py-2 text-right">Discount</th>
                <th className="px-2 py-2 text-right">Tax %</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items.map((item, index) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="px-2 py-2 align-top text-left">
                    {index + 1}
                  </td>
                  <td className="px-2 py-2 align-top text-left">
                    <div className="font-medium">{item.description}</div>
                  </td>
                  <td className="px-2 py-2 align-top text-left">
                    {item.hsn_sac || '-'}
                  </td>
                  <td className="px-2 py-2 align-top text-right">
                    {item.quantity}
                  </td>
                  <td className="px-2 py-2 align-top text-right">
                    {item.unit_price.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 align-top text-right">
                    {item.discount.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 align-top text-right">
                    {item.tax_percent.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 align-top text-right">
                    {item.line_total.toFixed(2)}
                  </td>
                </tr>
              ))}

              {invoice.invoice_items.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-2 py-4 text-center text-xs text-slate-500"
                  >
                    No line items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals + bank details */}
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="space-y-1 text-xs text-slate-700">
            <h3 className="text-sm font-semibold">Bank Details</h3>
            {company?.bank_name && <p>Bank: {company.bank_name}</p>}
            {company?.bank_branch && <p>Branch: {company.bank_branch}</p>}
            {company?.account_number && (
              <p>Account No: {company.account_number}</p>
            )}
            {company?.ifsc_code && <p>IFSC: {company.ifsc_code}</p>}
            {company?.swift_code && <p>SWIFT: {company.swift_code}</p>}
          </div>

          <div className="flex flex-col items-end space-y-1 text-sm">
            <div className="flex w-full max-w-xs justify-between">
              <span>Subtotal</span>
              <span>{invoice.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex w-full max-w-xs justify-between">
              <span>Tax</span>
              <span>{invoice.tax_amount.toFixed(2)}</span>
            </div>
            <div className="flex w-full max-w-xs justify-between font-semibold">
              <span>Total</span>
              <span>{invoice.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes + signature */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-1 text-xs text-slate-700">
            <h3 className="text-sm font-semibold">Notes / Terms</h3>
            <p className="whitespace-pre-line">
              {invoice.notes || 'Thank you for your business.'}
            </p>
          </div>

          <div className="flex flex-col items-end justify-end text-xs text-slate-700">
            <div className="mt-8 w-40 border-t border-slate-400 pt-2 text-center">
              Authorised Signatory
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
