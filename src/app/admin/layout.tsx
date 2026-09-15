"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  DoorOpen,
  ScrollText,
  AlertTriangle,
  Siren,
} from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { AppHeader } from "@/components/layout/AppHeader";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/gates", label: "Gates & Devices", icon: DoorOpen },
  { href: "/admin/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/emergency", label: "Emergency Mode", icon: Siren },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RoleGuard allow={["SUPER_ADMIN", "ADMIN"]}>
      {(user) => (
        <div className="min-h-screen">
          <AppHeader user={user} title="Admin" />
          <div className="mx-auto flex max-w-7xl">
            <nav className="hidden w-56 shrink-0 border-r border-border p-4 md:block">
              <ul className="space-y-1">
                {NAV.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
