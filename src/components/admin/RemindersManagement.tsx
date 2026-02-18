import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Bell, Send, Users, Filter, CheckCircle, Clock, AlertCircle, MessageSquare, History } from 'lucide-react';

interface ReminderLog {
  id: string;
  message: string;
  created_at: string;
  read: boolean;
  tenant_id: string;
  tenantName?: string;
}

const RemindersManagement = () => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, first_name, last_name, email, phone,
          units!tenant_id (unit_number, rent_amount)
        `)
        .eq('role', 'tenant')
        .eq('status', 'approved');

      if (error) throw error;

      const withStatus = await Promise.all(
        (data || []).map(async (t: any) => {
          const { data: latestPay } = await supabase
            .from('payments')
            .select('status')
            .eq('tenant_id', t.id)
            .order('created_at', { ascending: false })
            .limit(1);
          return { ...t, unit: t.units?.[0] || null, paymentStatus: latestPay?.[0]?.status || 'none' };
        })
      );

      setTenants(withStatus);
    } catch (error) {
      console.error('Error fetching tenants:', error);
      toast({ title: 'Error', description: 'Failed to load tenants', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchReminderLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id, message, created_at, read, tenant_id,
          profiles:tenant_id (first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const mapped = (data || []).map((n: any) => ({
        ...n,
        tenantName: n.profiles ? `${n.profiles.first_name || ''} ${n.profiles.last_name || ''}`.trim() : 'Unknown',
      }));
      setReminderLogs(mapped);
    } catch (error) {
      console.error('Error fetching reminder logs:', error);
    }
  };

  useEffect(() => {
    fetchTenants();
    fetchReminderLogs();
  }, []);

  const getFiltered = () => {
    if (filterStatus === 'all') return tenants;
    if (filterStatus === 'overdue') return tenants.filter((t) => t.paymentStatus === 'overdue');
    if (filterStatus === 'pending') return tenants.filter((t) => t.paymentStatus === 'pending');
    if (filterStatus === 'none') return tenants.filter((t) => t.paymentStatus === 'none');
    return tenants;
  };

  const filteredTenants = getFiltered();

  const toggleTenant = (id: string) => {
    setSelectedTenants((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const selectAll = () => setSelectedTenants(filteredTenants.map((t) => t.id));
  const clearAll = () => setSelectedTenants([]);

  const sendReminders = async () => {
    if (!message.trim()) {
      toast({ title: 'Error', description: 'Please enter a message.', variant: 'destructive' });
      return;
    }
    if (selectedTenants.length === 0) {
      toast({ title: 'Error', description: 'Select at least one tenant.', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    try {
      const rows = selectedTenants.map((tenantId) => ({
        tenant_id: tenantId,
        message: message.trim(),
        read: false,
      }));
      const { error } = await supabase.from('notifications').insert(rows);
      if (error) throw error;

      toast({ title: 'Reminders sent', description: `Sent to ${selectedTenants.length} tenant(s).` });
      setMessage('');
      setSelectedTenants([]);
      fetchReminderLogs();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send reminders.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const payStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      paid:    { label: 'Paid',    className: 'bg-green-100 text-green-700 border-green-200' },
      pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
      overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' },
      none:    { label: 'No Record', className: 'bg-muted text-muted-foreground' },
    };
    const cfg = map[status] || map.none;
    return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-3"><Bell className="h-6 w-6 text-primary" />Reminders</h2>
        <p className="text-muted-foreground text-sm">Send SMS payment reminders via bulk integration and review reminder history</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compose */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />Compose Message</CardTitle>
              <CardDescription>Message will be logged as a notification. Attach payment link via SMS integration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g. Dear {name}, your rent for this month is due. Please pay via the link below…"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{selectedTenants.length} tenant(s) selected</p>
                <Button onClick={sendReminders} disabled={isSending || !message.trim() || selectedTenants.length === 0} className="gap-2">
                  <Send className="h-4 w-4" />
                  {isSending ? 'Sending…' : 'Send Reminders'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tenant Picker */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Select Recipients</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 text-xs w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tenants</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="none">No payment record</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={selectAll}>Select all</Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={clearAll}>Clear</Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
              ) : filteredTenants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No tenants match this filter</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {filteredTenants.map((t) => (
                    <label
                      key={t.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedTenants.includes(t.id) ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/40 border-transparent'}`}
                    >
                      <Checkbox checked={selectedTenants.includes(t.id)} onCheckedChange={() => toggleTenant(t.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{t.first_name} {t.last_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.unit ? `Unit ${t.unit.unit_number}` : 'No unit'} • {t.phone || t.email}</p>
                      </div>
                      {payStatusBadge(t.paymentStatus)}
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Reminder History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Reminder History</CardTitle>
            <CardDescription>Quick log of all sent reminders</CardDescription>
          </CardHeader>
          <CardContent>
            {reminderLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No reminders sent yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {reminderLogs.map((log) => (
                  <div key={log.id} className="flex gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="mt-0.5 shrink-0">
                      <MessageSquare className="h-4 w-4 text-primary/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{log.tenantName}</p>
                        <Badge variant="outline" className={log.read ? 'bg-green-100 text-green-700 text-xs' : 'bg-blue-100 text-blue-700 text-xs'}>
                          {log.read ? 'Read' : 'Sent'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{log.message}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {new Date(log.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RemindersManagement;
