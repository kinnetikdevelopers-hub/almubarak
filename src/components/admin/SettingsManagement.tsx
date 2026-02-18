import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import { Settings, Lock, Moon, Sun, User, Save, Eye, EyeOff, CreditCard } from 'lucide-react';

const SettingsManagement = () => {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Profile section
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Payment settings (stored in localStorage as simple config for now)
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [defaultDueDay, setDefaultDueDay] = useState('5');
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // Password section
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileName(profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || '');
      setProfilePhone((profile as any).phone || '');
    }
    // Load payment settings from localStorage
    setPaymentInstructions(localStorage.getItem('paymentInstructions') || '');
    setDefaultDueDay(localStorage.getItem('defaultDueDay') || '5');
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      toast({ title: 'Error', description: 'Name cannot be empty.', variant: 'destructive' });
      return;
    }
    setIsSavingProfile(true);
    try {
      const nameParts = profileName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: profileName.trim(),
          first_name: firstName,
          last_name: lastName || null,
          phone: profilePhone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile!.id);

      if (error) throw error;
      toast({ title: 'Profile updated', description: 'Your name and phone have been saved.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update profile.', variant: 'destructive' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePaymentSettings = () => {
    setIsSavingPayment(true);
    try {
      localStorage.setItem('paymentInstructions', paymentInstructions);
      const day = parseInt(defaultDueDay);
      if (isNaN(day) || day < 1 || day > 31) {
        toast({ title: 'Invalid day', description: 'Due day must be between 1 and 31.', variant: 'destructive' });
        return;
      }
      localStorage.setItem('defaultDueDay', defaultDueDay);
      toast({ title: 'Payment settings saved', description: 'Your payment settings have been updated.' });
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Error', description: 'Please fill in all password fields.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'New passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setIsChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password changed', description: 'Your password has been updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to change password.', variant: 'destructive' });
    } finally {
      setIsChangingPw(false);
    }
  };

  const PasswordInput = ({ id, label, value, onChange, show, onToggle }: any) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e: any) => onChange(e.target.value)} className="pr-10" />
        <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6" onClick={onToggle}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-3"><Settings className="h-6 w-6 text-primary" />Settings</h2>
        <p className="text-muted-foreground text-sm">Manage your profile, payment settings, and security preferences</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Profile</CardTitle>
          <CardDescription>Update your display name and phone number. Email cannot be changed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="s-email">Email Address</Label>
            <Input id="s-email" type="email" value={profile?.email || ''} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Email is read-only. Contact support if needed.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-name">Full Name</Label>
            <Input id="s-name" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Your full name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-phone">Phone Number</Label>
            <Input id="s-phone" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} placeholder="+254 7XX XXX XXX" />
          </div>
          <Button onClick={handleSaveProfile} disabled={isSavingProfile} className="gap-2">
            <Save className="h-4 w-4" />
            {isSavingProfile ? 'Saving…' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* Payment Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment Settings</CardTitle>
          <CardDescription>Configure payment instructions and the default reminder due date.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="s-instructions">Payment Instructions</Label>
            <Textarea
              id="s-instructions"
              placeholder="e.g. Pay via M-Pesa to Paybill 123456, Account: your unit number…"
              rows={3}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">These instructions will be included in reminder messages.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-dueday">Default Due Day (day of month)</Label>
            <Input
              id="s-dueday"
              type="number"
              min={1}
              max={31}
              value={defaultDueDay}
              onChange={(e) => setDefaultDueDay(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">Rent is due on this day each month (used for reminder scheduling).</p>
          </div>
          <Button onClick={handleSavePaymentSettings} disabled={isSavingPayment} className="gap-2">
            <Save className="h-4 w-4" />
            {isSavingPayment ? 'Saving…' : 'Save Payment Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Change Password</CardTitle>
          <CardDescription>Update your admin account password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PasswordInput id="s-cur" label="Current Password" value={currentPassword} onChange={setCurrentPassword} show={showCurrent} onToggle={() => setShowCurrent((v: boolean) => !v)} />
          <PasswordInput id="s-new" label="New Password" value={newPassword} onChange={setNewPassword} show={showNew} onToggle={() => setShowNew((v: boolean) => !v)} />
          <PasswordInput id="s-conf" label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} onToggle={() => setShowConfirm((v: boolean) => !v)} />
          <Button onClick={handleChangePassword} disabled={isChangingPw} className="gap-2">
            <Save className="h-4 w-4" />
            {isChangingPw ? 'Changing…' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            Appearance
          </CardTitle>
          <CardDescription>Toggle between light and dark mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Currently {theme === 'dark' ? 'enabled' : 'disabled'}</p>
            </div>
            <Switch checked={theme === 'dark'} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsManagement;
