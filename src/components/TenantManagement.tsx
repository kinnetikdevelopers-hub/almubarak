import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, UserPlus, Search, Trash2, FileKey2, Home, Phone, Mail, Calendar, Shield } from 'lucide-react';

interface Tenant {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  status: 'pending' | 'approved' | 'suspended';
  created_at: string;
  lease_start_date?: string | null;
  unit?: { id: string; unit_number: string } | null;
}

interface Unit {
  id: string;
  unit_number: string;
  rent_amount: number;
  floor: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  approved: { label: 'Active', className: 'bg-green-100 text-green-700 border-green-200' },
  pending:  { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  suspended:{ label: 'Suspended', className: 'bg-red-100 text-red-700 border-red-200' },
};

const TenantManagement = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [vacantUnits, setVacantUnits] = useState<Unit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stats
  const [stats, setStats] = useState({ total: 0, activeLeases: 0, pendingPayments: 0 });

  // Add form state
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    unitId: '',
    leaseStart: '',
  });

  const { toast } = useToast();

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, first_name, last_name, email, phone, status, created_at, lease_start_date,
          units!tenant_id (id, unit_number)
        `)
        .eq('role', 'tenant')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((t: any) => ({
        ...t,
        unit: t.units?.[0] || null,
      }));
      setTenants(mapped);
    } catch (error) {
      console.error('Error fetching tenants:', error);
      toast({ title: 'Error', description: 'Failed to load tenants', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVacantUnits = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_number, rent_amount, floor')
        .eq('status', 'vacant')
        .order('unit_number');
      if (error) throw error;
      setVacantUnits(data || []);
    } catch (error) {
      console.error('Error fetching vacant units:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const [tenantsRes, pendingPayRes] = await Promise.all([
        supabase.from('profiles').select('id, status').eq('role', 'tenant'),
        supabase.from('payments').select('id').eq('status', 'pending'),
      ]);
      const all = tenantsRes.data || [];
      setStats({
        total: all.length,
        activeLeases: all.filter((t: any) => t.status === 'approved').length,
        pendingPayments: pendingPayRes.data?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchTenants();
    fetchVacantUnits();
    fetchStats();

    const ch = supabase.channel('tm-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { fetchTenants(); fetchStats(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, () => { fetchVacantUnits(); fetchTenants(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchStats)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleAddTenant = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.unitId || !form.leaseStart) {
      toast({ title: 'Missing fields', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      // Create a stable UUID for this tenant (no auth user)
      const tenantId = crypto.randomUUID();

      // Insert profile directly
      const { error: profileError } = await supabase.from('profiles').insert({
        id: tenantId,
        email: form.email,
        first_name: form.firstName,
        last_name: form.lastName,
        display_name: `${form.firstName} ${form.lastName}`,
        phone: form.phone,
        role: 'tenant',
        status: 'approved',
        lease_start_date: form.leaseStart,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (profileError) throw profileError;

      // Assign unit
      const { error: unitError } = await supabase
        .from('units')
        .update({ tenant_id: tenantId, status: 'occupied' })
        .eq('id', form.unitId);

      if (unitError) throw unitError;

      toast({ title: 'Tenant added', description: `${form.firstName} ${form.lastName} has been added successfully.` });
      setIsAddOpen(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', unitId: '', leaseStart: '' });
      fetchTenants();
      fetchVacantUnits();
      fetchStats();
    } catch (error: any) {
      console.error('Error adding tenant:', error);
      toast({ title: 'Error', description: error.message || 'Failed to add tenant.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveTenant = async (tenant: Tenant) => {
    if (!confirm(`Remove ${tenant.first_name} ${tenant.last_name}? This will vacate their unit too.`)) return;
    try {
      // Vacate unit if assigned
      if (tenant.unit?.id) {
        await supabase.from('units').update({ tenant_id: null, status: 'vacant' }).eq('id', tenant.unit.id);
      }
      await supabase.from('profiles').delete().eq('id', tenant.id);
      toast({ title: 'Removed', description: 'Tenant removed successfully.' });
      fetchTenants();
      fetchVacantUnits();
      fetchStats();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to remove tenant.', variant: 'destructive' });
    }
  };

  const filtered = tenants.filter((t) => {
    const name = `${t.first_name || ''} ${t.last_name || ''}`.toLowerCase();
    const q = searchTerm.toLowerCase();
    return name.includes(q) || t.email.toLowerCase().includes(q) || (t.phone || '').includes(q);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Leases</CardTitle>
            <FileKey2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activeLeases}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <Shield className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingPayments}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Tenant Directory</CardTitle>
              <CardDescription>All tenants managed by admin</CardDescription>
            </div>
            <Button onClick={() => setIsAddOpen(true)} className="gap-2 shrink-0">
              <UserPlus className="h-4 w-4" />
              Add Tenant
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email or phone…"
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">{searchTerm ? 'No tenants match your search' : 'No tenants yet — add the first one!'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unit</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lease Start</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tenant) => {
                    const sc = statusConfig[tenant.status] || statusConfig.pending;
                    return (
                      <tr key={tenant.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                              {(tenant.first_name?.[0] || tenant.email[0]).toUpperCase()}
                            </div>
                            {tenant.first_name} {tenant.last_name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {tenant.unit ? (
                            <span className="flex items-center gap-1"><Home className="h-3 w-3" /> {tenant.unit.unit_number}</span>
                          ) : (
                            <span className="text-xs italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{tenant.phone || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{tenant.email}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {tenant.lease_start_date ? (
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(tenant.lease_start_date).toLocaleDateString('en-KE')}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={sc.className}>{sc.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveTenant(tenant)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Add Tenant Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Add New Tenant</DialogTitle>
            <DialogDescription>Fill in the tenant's details. They will be added as active immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tf-fn">First Name *</Label>
                <Input id="tf-fn" placeholder="Jane" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tf-ln">Last Name *</Label>
                <Input id="tf-ln" placeholder="Doe" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-phone">Phone *</Label>
              <Input id="tf-phone" placeholder="+254 7XX XXX XXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-email">Email *</Label>
              <Input id="tf-email" type="email" placeholder="jane@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Assigned Unit *</Label>
              <Select value={form.unitId} onValueChange={(v) => setForm({ ...form, unitId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vacant unit" />
                </SelectTrigger>
                <SelectContent>
                  {vacantUnits.length === 0 ? (
                    <SelectItem value="_none" disabled>No vacant units available</SelectItem>
                  ) : (
                    vacantUnits.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        Unit {u.unit_number} — Floor {u.floor} (KES {u.rent_amount.toLocaleString()}/mo)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-lease">Lease Start Date *</Label>
              <Input id="tf-lease" type="date" value={form.leaseStart} onChange={(e) => setForm({ ...form, leaseStart: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleAddTenant} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save Tenant'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantManagement;
