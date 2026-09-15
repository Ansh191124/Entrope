import { redirect } from "next/navigation";
import { getServerSession, dashboardPathForRole } from "@/server/lib/serverSession";

export default function HomePage() {
  const session = getServerSession();
  redirect(session ? dashboardPathForRole(session.role) : "/login");
}
