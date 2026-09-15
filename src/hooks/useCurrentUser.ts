"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "SECURITY_OFFICER" | "STUDENT";
  active: boolean;
  student: { id: string; enrollmentNo: string; department: string; presence: string } | null;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<{ success: true; user: CurrentUser }>("/api/auth/me").then((r) => r.user),
    retry: false,
  });
}
