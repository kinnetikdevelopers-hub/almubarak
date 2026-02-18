import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import TenantManagement from './TenantManagement';
import UnitsManagementUpdated from './admin/UnitsManagementUpdated';
import PaymentsManagement from './admin/PaymentsManagement';
import ReportsManagementUpdated from './admin/ReportsManagementUpdated';
import RemindersManagement from './admin/RemindersManagement';
import SettingsManagement from './admin/SettingsManagement';
import ThemeToggle from './ThemeToggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Users,
  DollarSign,
  Home,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
  UserPlus,
  CreditCard,
  Settings2,
} from 'lucide-react';

interface AdminDashboardProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface ActivityLog {
  id: string;
  type: 'payment' | 'tenant' | 'unit';
  description: string;
  time: string;
  status?: string;
}

const AdminDashboard = ({ activeTab, onTabChange }: AdminDashboardProps) => {
  const [stats, setStats] = useState({
    totalUnits: 0,
    occupiedUnits: 0,
    activeTenants: 0,
    occupancyRate: 0,
    pendingPayments: 0,
    totalCollected: 0,
  });
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);

  const fetchStats = async () => {
    try {
      const [unitsRes, tenantsRes, pendingPayRes, paidPayRes] = await Promise.all([
        supabase.from('units').select('id, status'),
        supabase.from('profiles').select('id').eq('role', 'tenant').eq('status', 'approved'),
        supabase.from('payments').select('id').eq('status', 'pending'),
        supabase.from('payments').select('amount').eq('status', 'paid'),
      ]);

      const allUnits = unitsRes.data || [];
      const occupiedUnits = allUnits.filter((u) => u.status === 'occupied').length;
      const totalUnits = allUnits.length;
      const totalCollected = (paidPayRes.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);

      setStats({
        totalUnits,
        occupiedUnits,
        activeTenants: tenantsRes.data?.length || 0,
        occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
        pendingPayments: pendingPayRes.data?.length || 0,
        totalCollected,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchActivityLogs = async () => {
    setIsLoadingActivity(true);
    try {
      const logs: ActivityLog[] = [];

      // Fetch recent payments
      const { data: recentPayments } = await supabase
        .from('payments')
        .select(`
          id, status, amount, created_at, full_name,
          profiles:tenant_id (first_name, last_name),
          units:tenant_id (unit_number)
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      (recentPayments || []).forEach((p) => {
        const name = p.full_name || `${(p.profiles as any)?.first_name || ''} ${(p.profiles as any)?.last_name || ''}`.trim() || 'Unknown';
        logs.push({
          id: `pay-${p.id}`,
          type: 'payment',
          description: `Payment of KES ${(p.amount || 0).toLocaleString()} recorded for ${name}`,
          time: p.created_at,
          status: p.status,
        });
      });

      // Fetch recent tenants added
      const { data: recentTenants } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, created_at, status')
        .eq('role', 'tenant')
        .order('created_at', { ascending: false })
        .limit(5);

      (recentTenants || []).forEach((t) => {
        const name = `${t.first_name || ''} ${t.last_name || ''}`.trim() || t.email;
        logs.push({
          id: `ten-${t.id}`,
          type: 'tenant',
          description: `Tenant "${name}" was added to the system`,
          time: t.created_at,
          status: t.status,
        });
      });

      // Sort all by time descending, take top 10
      logs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setActivityLogs(logs.slice(0, 10));
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchActivityLogs();

    const channels = [
      supabase.channel('dash-units').on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, fetchStats).subscribe(),
      supabase.channel('dash-payments').on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { fetchStats(); fetchActivityLogs(); }).subscribe(),
      supabase.channel('dash-profiles').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { fetchStats(); fetchActivityLogs(); }).subscribe(),
    ];

    return () => { channels.forEach((c) => supabase.removeChannel(c)); };
  }, []);

  const getActivityIcon = (type: string, status?: string) => {
    if (type === 'payment') {
      if (status === 'paid') return <CheckCircle className="h-4 w-4 text-green-500" />;
      if (status === 'overdue') return <AlertCircle className="h-4 w-4 text-red-500" />;
      return <Clock className="h-4 w-4 text-yellow-500" />;
    }
    if (type === 'tenant') return <UserPlus className="h-4 w-4 text-blue-500" />;
    return <Settings2 className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadge = (type: string, status?: string) => {
    if (type === 'payment') {
      const map: Record<string, string> = { paid: 'bg-green-100 text-green-700', pending: 'bg-yellow-100 text-yellow-700', overdue: 'bg-red-100 text-red-700' };
      return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status || ''] || 'bg-muted text-muted-foreground'}`}>{status}</span>;
    }
    return null;
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="shadow-sm hover:scale-105 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Units</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalUnits}</div>
                  <p className="text-xs text-muted-foreground">{stats.occupiedUnits} occupied</p>
                </CardContent>
              </Card>

              <Card className="shadow-sm hover:scale-105 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
                  <Users className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeTenants}</div>
                  <p className="text-xs text-muted-foreground">Currently approved</p>
                </CardContent>
              </Card>

              <Card className="shadow-sm hover:scale-105 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{stats.occupancyRate}%</div>
                  <div className="mt-1 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${stats.occupancyRate}%` }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm hover:scale-105 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
                  <DollarSign className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{stats.pendingPayments}</div>
                  <p className="text-xs text-muted-foreground">Awaiting collection</p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity — full width */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingActivity ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No activity yet</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {activityLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="mt-0.5 shrink-0">{getActivityIcon(log.type, log.status)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-snug">{log.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(log.time).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {getStatusBadge(log.type, log.status)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'units':
        return <UnitsManagementUpdated />;

      case 'tenants':
        return <TenantManagement />;

      case 'payments':
        return <PaymentsManagement />;

      case 'reports':
        return <ReportsManagementUpdated />;

      case 'reminders':
        return <RemindersManagement />;

      case 'settings':
        return <SettingsManagement />;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      {renderTabContent()}
    </div>
  );
};

export default AdminDashboard;
