import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Inbox, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: Zap, label: "Cockpit" },
  { to: "/untracked", icon: Inbox, label: "Untracked" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function AppLayout() {
  const location = useLocation();
  const isCockpit = location.pathname === "/";

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Top nav - compact */}
      <header className="h-10 border-b border-border bg-card flex items-center px-3 shrink-0">
        <div className="flex items-center gap-2 mr-6">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Zap className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-sm text-midnight">ReplyPilot</span>
        </div>
        <nav className="flex items-center gap-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Main content - full height for cockpit */}
      <main className={cn("flex-1 overflow-hidden", !isCockpit && "overflow-auto")}>
        <Outlet />
      </main>
    </div>
  );
}
