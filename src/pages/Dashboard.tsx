import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AdminDashboard from '@/components/AdminDashboard';
import DashboardLayout from '@/components/DashboardLayout';
import { useState } from 'react';

const Dashboard = () => {
  const { profile, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    if (!isLoading && !profile) {
      navigate('/auth');
    }
    // If somehow a tenant profile exists and tries to log in, redirect to auth
    if (!isLoading && profile && profile.role !== 'admin') {
      navigate('/auth');
    }
  }, [profile, isLoading, navigate]);

  if (isLoading || !profile) return null;

  if (isAdmin) {
    return (
      <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
        <AdminDashboard activeTab={activeTab} onTabChange={setActiveTab} />
      </DashboardLayout>
    );
  }

  return null;
};

export default Dashboard;
