import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  PieChart as PieChartIcon,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  PieChart,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Pie,
} from 'recharts';
import PDFGenerator from '../PDFGenerator';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  paid:    { label: 'Paid',    icon: CheckCircle, className: 'bg-green-100 text-green-700 border-green-200' },
  pending: { label: 'Pending', icon: Clock,       className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  overdue: { label: 'Overdue', icon: AlertCircle, className: 'bg-red-100 text-red-700 border-red-200' },
};

const ReportsManagementUpdated = () => {
  const [billingMonths, setBillingMonths] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [payments, setPayments] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalExpected: 0,
    totalCollected: 0,
    totalPending: 0,
    collectionRate: 0,
  });

  const fetchBillingMonths = async () => {
    const { data } = await supabase
      .from('billing_months')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    setBillingMonths(data || []);
  };

  const fetchUnits = async () => {
    const { data } = await supabase.from('units').select('*').eq('status', 'occupied');
    setUnits(data || []);
  };

  const fetchPayments = async (billingMonthId: string) => {
    const { data } = await supabase
      .from('payments')
      .select(`*, profiles:tenant_id (first_name, last_name)`)
      .eq('billing_month_id', billingMonthId)
      .order('created_at', { ascending: false });

    // Enrich with unit numbers
    const enriched = await Promise.all(
      (data || []).map(async (p: any) => {
        const { data: unit } = await supabase
          .from('units')
          .select('unit_number')
          .eq('tenant_id', p.tenant_id)
          .maybeSingle();
        return { ...p, unit_number: unit?.unit_number || '—' };
      })
    );

    setPayments(enriched);

    const totalExpected = units.reduce((s, u) => s + (u.rent_amount || 0), 0);
    const collected = enriched.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const pending   = enriched.filter((p) => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
    const rate = totalExpected > 0 ? (collected / totalExpected) * 100 : 0;

    setStats({ totalExpected, totalCollected: collected, totalPending: pending, collectionRate: rate });
  };

  useEffect(() => { fetchBillingMonths(); fetchUnits(); }, []);
  useEffect(() => { if (selectedMonth && units.length >= 0) fetchPayments(selectedMonth); }, [selectedMonth, units]);

  const selectedBillingMonth = billingMonths.find((m) => m.id === selectedMonth);
  const monthLabel = selectedBillingMonth
    ? `${MONTHS[selectedBillingMonth.month - 1]} ${selectedBillingMonth.year}`
    : '';

  const pieData = [
    { name: 'Collected', value: stats.totalCollected, color: '#10b981' },
    { name: 'Pending',   value: Math.max(stats.totalExpected - stats.totalCollected, 0), color: '#f59e0b' },
  ].filter((d) => d.value > 0);

  const barData = [
    { name: 'Expected',  amount: stats.totalExpected,  fill: '#3b82f6' },
    { name: 'Collected', amount: stats.totalCollected, fill: '#10b981' },
    { name: 'Pending',   amount: stats.totalPending,   fill: '#f59e0b' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-primary" />
            Financial Reports
          </h2>
          <p className="text-muted-foreground text-sm">View and export detailed financial analytics</p>
        </div>
        <PDFGenerator
          fileName="financial-report"
          disabled={!selectedMonth}
          reportData={selectedMonth ? { monthLabel, stats, payments } : undefined}
        />
      </div>

      {/* Month Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Billing Period</CardTitle>
          <CardDescription>Choose a month to view its financial report</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select billing month" />
            </SelectTrigger>
            <SelectContent>
              {billingMonths.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {MONTHS[m.month - 1]} {m.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selectedMonth && (
        <Card>
          <CardContent className="text-center py-14">
            <BarChart3 className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-40" />
            <h3 className="text-lg font-semibold mb-1">No period selected</h3>
            <p className="text-muted-foreground text-sm">Choose a billing month above to view the report</p>
          </CardContent>
        </Card>
      )}

      {selectedMonth && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Expected Rent</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">KES {stats.totalExpected.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Total target</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Collected</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">KES {stats.totalCollected.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Successfully received</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Calendar className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">KES {stats.totalPending.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
                <PieChartIcon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stats.collectionRate >= 80 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {stats.collectionRate.toFixed(1)}%
                </div>
                <div className="mt-1 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${stats.collectionRate >= 80 ? 'bg-green-500' : 'bg-yellow-500'}`}
                    style={{ width: `${Math.min(stats.collectionRate, 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Collection Breakdown</CardTitle>
                <CardDescription>Collected vs outstanding for {monthLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" paddingAngle={3}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Amount']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-2">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-sm text-muted-foreground">{d.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Comparison</CardTitle>
                <CardDescription>Expected vs collected vs pending</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Amount']} />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                        {barData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Table */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Records — {monthLabel}</CardTitle>
              <CardDescription>{payments.length} payment(s) recorded</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {payments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No payments recorded for this period</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tenant</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unit</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reference</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => {
                        const sc = statusConfig[p.status] || statusConfig.pending;
                        const Icon = sc.icon;
                        return (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium">{p.full_name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{p.unit_number}</td>
                            <td className="px-4 py-3 text-right font-semibold">KES {(p.amount || 0).toLocaleString()}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`gap-1 ${sc.className}`}>
                                <Icon className="h-3 w-3" />{sc.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{p.mpesa_code || p.notes || '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {p.created_at ? new Date(p.created_at).toLocaleDateString('en-KE') : '—'}
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
      )}
    </div>
  );
};

export default ReportsManagementUpdated;