import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, Plus, CheckCircle, Clock, AlertCircle, Home, Search } from 'lucide-react';

interface Tenant {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  unit?: { id: string; unit_number: string; rent_amount: number } | null;
}

interface Payment {
  id: string;
  tenant_id: string;
  amount: number;
  status: string;
  created_at: string;
  full_name: string;
  mpesa_code?: string | null;
  notes?: string | null;
  unit_number?: string;
  rent_amount?: number;
}

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  paid:    { label: 'Paid',    icon: CheckCircle, className: 'bg-green-100 text-green-700 border-green-200' },
  partial: { label: 'Partial', icon: Clock,       className: 'bg-blue-100 text-blue-700 border-blue-200' },
  pending: { label: 'Pending', icon: Clock,       className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  overdue: { label: 'Overdue', icon: AlertCircle, className: 'bg-red-100 text-red-700 border-red-200' },
};

const PaymentsManagement = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ collected: 0, balance: 0, overdue: 0 });

  const [form, setForm] = useState({
    tenantId: '',
    amount: '',
    status: 'paid',
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // Derived balance for partial payments
  const balance =
    selectedTenant?.unit?.rent_amount && form.status === 'partial'
      ? Math.max(selectedTenant.unit.rent_amount - (parseFloat(form.amount) || 0), 0)
      : 0;

  const { toast } = useToast();

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`id, tenant_id, amount, status, created_at, full_name, mpesa_code`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with unit info
      const enriched: Payment[] = await Promise.all(
        (data || []).map(async (p: any) => {
          const { data: unitData } = await supabase
            .from('units')
            .select('unit_number, rent_amount')
            .eq('tenant_id', p.tenant_id)
            .maybeSingle();
          return {
            ...p,
            unit_number: unitData?.unit_number || '—',
            rent_amount: unitData?.rent_amount || 0,
            notes: p.mpesa_code || null,
          };
        })
      );

      setPayments(enriched);

      // Stats
      const collected = enriched
        .filter((p) => p.status === 'paid' || p.status === 'partial')
        .reduce((s, p) => s + p.amount, 0);

      // Balance = sum of (rent - paid) for partial payments
      const partialBalance = enriched
        .filter((p) => p.status === 'partial')
        .reduce((s, p) => s + Math.max((p.rent_amount || 0) - p.amount, 0), 0);

      // Pending = full rent owed for purely pending entries
      const pendingTotal = enriched
        .filter((p) => p.status === 'pending')
        .reduce((s, p) => s + p.amount, 0);

      const overdue = enriched
        .filter((p) => p.status === 'overdue')
        .reduce((s, p) => s + p.amount, 0);

      setStats({ collected, balance: partialBalance + pendingTotal, overdue });
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast({ title: 'Error', description: 'Failed to load payments', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`id, first_name, last_name, email, units!tenant_id (id, unit_number, rent_amount)`)
        .eq('role', 'tenant')
        .eq('status', 'approved')
        .order('first_name');

      if (error) throw error;
      const mapped = (data || []).map((t: any) => ({ ...t, unit: t.units?.[0] || null }));
      setTenants(mapped);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchTenants();
    const ch = supabase.channel('pay-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchPayments)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleTenantChange = (tenantId: string) => {
    const t = tenants.find((x) => x.id === tenantId) || null;
    setSelectedTenant(t);
    setForm((f) => ({ ...f, tenantId, amount: t?.unit?.rent_amount?.toString() || '' }));
  };

  const handleStatusChange = (status: string) => {
    setForm((f) => ({
      ...f,
      status,
      // Reset amount to full rent when switching back to paid/pending
      amount: status !== 'partial' && selectedTenant?.unit?.rent_amount
        ? selectedTenant.unit.rent_amount.toString()
        : f.amount,
    }));
  };

  const handleSave = async () => {
    if (!form.tenantId || !form.amount || !form.status || !form.paymentDate) {
      toast({ title: 'Missing fields', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    const parsedAmount = parseFloat(form.amount);
    const rentAmount = selectedTenant?.unit?.rent_amount || 0;

    if (form.status === 'partial' && parsedAmount >= rentAmount) {
      toast({ title: 'Invalid amount', description: `Partial payment must be less than KES ${rentAmount.toLocaleString()}. Use "Paid" for full payments.`, variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const tenant = tenants.find((t) => t.id === form.tenantId);
      const fullName = `${tenant?.first_name || ''} ${tenant?.last_name || ''}`.trim() || 'Unknown';

      const now = new Date(form.paymentDate);
      let billingMonthId: string;
      const { data: bm } = await supabase
        .from('billing_months')
        .select('id')
        .eq('month', now.getMonth() + 1)
        .eq('year', now.getFullYear())
        .maybeSingle();

      if (bm) {
        billingMonthId = bm.id;
      } else {
        const { data: newBm, error: bmErr } = await supabase
          .from('billing_months')
          .insert({ month: now.getMonth() + 1, year: now.getFullYear() })
          .select('id')
          .single();
        if (bmErr) throw bmErr;
        billingMonthId = newBm.id;
      }

      const { error } = await supabase.from('payments').insert({
        tenant_id: form.tenantId,
        billing_month_id: billingMonthId,
        amount: parsedAmount,
        status: form.status,
        full_name: fullName,
        mpesa_code: form.notes || `MANUAL-${Date.now()}`,
        created_at: new Date(form.paymentDate).toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      const balanceMsg = form.status === 'partial'
        ? ` Balance remaining: KES ${Math.max(rentAmount - parsedAmount, 0).toLocaleString()}.`
        : '';

      toast({ title: 'Payment recorded', description: `KES ${parsedAmount.toLocaleString()} saved as ${form.status}.${balanceMsg}` });
      setIsAddOpen(false);
      setForm({ tenantId: '', amount: '', status: 'paid', paymentDate: new Date().toISOString().slice(0, 10), notes: '' });
      setSelectedTenant(null);
      fetchPayments();
    } catch (error: any) {
      console.error('Error saving payment:', error);
      toast({ title: 'Error', description: error.message || 'Failed to save payment.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = payments.filter((p) => {
    const q = searchTerm.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      (p.unit_number || '').toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">KES {stats.collected.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">From fully paid payments</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Balance Owed</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">KES {stats.balance.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Pending + partial balances</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">KES {stats.overdue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Payment Records</CardTitle>
              <CardDescription>All manual and system-recorded payments</CardDescription>
            </div>
            <Button onClick={() => setIsAddOpen(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Record Payment
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by tenant, unit or status…"
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-14">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
              <DollarSign className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">{searchTerm ? 'No payments match your search' : 'No payments recorded yet'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tenant</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unit</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paid</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Balance</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const sc = statusConfig[p.status] || statusConfig.pending;
                    const Icon = sc.icon;
                    const bal = p.status === 'partial'
                      ? Math.max((p.rent_amount || 0) - p.amount, 0)
                      : 0;
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{p.full_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Home className="h-3 w-3" />{p.unit_number}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold">KES {(p.amount || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {p.status === 'partial' ? (
                            <span className="text-red-600 font-medium">KES {bal.toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString('en-KE')}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`gap-1 ${sc.className}`}>
                            <Icon className="h-3 w-3" />{sc.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">
                          {p.notes || '—'}
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

      {/* Record Payment Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Record New Payment
            </DialogTitle>
            <DialogDescription>Log a payment manually for any tenant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Tenant *</Label>
              <Select value={form.tenantId} onValueChange={handleTenantChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}
                      {t.unit ? ` — Unit ${t.unit.unit_number}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit + Rent amount (auto-filled) */}
            {selectedTenant?.unit && (
              <div className="p-3 bg-muted rounded-lg text-sm flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Home className="h-3 w-3" /> Unit {selectedTenant.unit.unit_number}
                </span>
                <span className="font-medium">
                  Rent: KES {selectedTenant.unit.rent_amount.toLocaleString()}
                </span>
              </div>
            )}

            <div className="space-y-1">
              <Label>Status *</Label>
              <Select value={form.status} onValueChange={handleStatusChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid — Full amount received</SelectItem>
                  <SelectItem value="partial">Partial — Part of rent paid</SelectItem>
                  <SelectItem value="pending">Pending — Payment expected</SelectItem>
                  <SelectItem value="overdue">Overdue — Past due date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pf-amount">Amount Paid (KES) *</Label>
              <Input
                id="pf-amount"
                type="number"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            {/* Live balance preview for partial */}
            {form.status === 'partial' && parseFloat(form.amount) > 0 && selectedTenant?.unit && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm flex items-center justify-between dark:bg-red-950/20 dark:border-red-900">
                <span className="text-red-700 dark:text-red-400">Balance remaining</span>
                <span className="font-bold text-red-700 dark:text-red-400">
                  KES {balance.toLocaleString()}
                </span>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="pf-date">Payment Date *</Label>
              <Input
                id="pf-date"
                type="date"
                value={form.paymentDate}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pf-notes">Notes</Label>
              <Textarea
                id="pf-notes"
                placeholder="e.g. M-Pesa ref, bank deposit, cash…"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentsManagement;