"use client";

import { ShieldCheck, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import type { CurrentUser } from "@/hooks/useCurrentUser";

const ROLE_LABEL: Record<CurrentUser["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SECURITY_OFFICER: "Security Officer",
  STUDENT: "Student",
};

export function AppHeader({ user, title }: { user: CurrentUser; title: string }) {
  const router = useRouter();

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="font-semibold">CampusGuard</span>
        <span className="hidden text-muted-foreground sm:inline">/ {title}</span>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
        <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
