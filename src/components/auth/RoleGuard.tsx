"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser, type CurrentUser } from "@/hooks/useCurrentUser";

export function RoleGuard({
  allow,
  children,
}: {
  allow: Array<CurrentUser["role"]>;
  children: (user: CurrentUser) => React.ReactNode;
}) {
  const { data: user, isLoading, isError } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace("/login");
    } else if (user && !allow.includes(user.role)) {
      router.replace("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isError, user]);

  if (isLoading || !user || !allow.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <>{children(user)}</>;
}
