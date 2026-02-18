import { useAuth } from '@/hooks/useAuth';
import {
  Home,
  Building2,
  Users,
  CreditCard,
  BarChart3,
  Bell,
  Settings,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const { state } = useSidebar();
  const { profile } = useAuth();
  const collapsed = state === 'collapsed';

  const adminItems = [
    { id: 'dashboard', title: 'Dashboard', icon: Home },
    { id: 'units',     title: 'Units',     icon: Building2 },
    { id: 'tenants',   title: 'Tenants',   icon: Users },
    { id: 'payments',  title: 'Payments',  icon: CreditCard },
    { id: 'reports',   title: 'Reports',   icon: BarChart3 },
    { id: 'reminders', title: 'Reminders', icon: Bell },
    { id: 'settings',  title: 'Settings',  icon: Settings },
  ];

  const isActive = (id: string) => activeTab === id;

  return (
    <Sidebar
      className={`transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} border-r border-border bg-sidebar`}
      collapsible="icon"
    >
      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel className={`px-3 py-2 text-sidebar-foreground font-semibold ${collapsed ? 'hidden' : 'block'}`}>
            Admin Panel
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild={false}
                    onClick={() => onTabChange(item.id)}
                    className={`
                      w-full justify-start h-10 px-3 rounded-lg transition-all duration-300 group cursor-pointer hover:shadow-md
                      ${isActive(item.id)
                        ? 'bg-gradient-to-r from-sidebar-accent/90 to-sidebar-accent text-sidebar-accent-foreground font-medium shadow-lg border border-sidebar-accent/20'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-accent-foreground hover:scale-105'
                      }
                    `}
                  >
                    <item.icon className={`h-4 w-4 ${collapsed ? 'mx-auto' : 'mr-3'} shrink-0 transition-colors duration-200 ${isActive(item.id) ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground'}`} />
                    {!collapsed && (
                      <span className="truncate text-sm transition-all duration-300 group-hover:font-medium">
                        {item.title}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
