import { prisma } from "@/server/lib/prisma";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getOverview() {
  const todayStart = startOfToday();

  const [inside, totalActive, entriesToday, exitsToday, openAlerts] = await Promise.all([
    prisma.studentPresence.count({ where: { status: "INSIDE" } }),
    prisma.student.count({ where: { active: true } }),
    prisma.accessEvent.count({ where: { eventType: "ENTRY", timestamp: { gte: todayStart } } }),
    prisma.accessEvent.count({ where: { eventType: "EXIT", timestamp: { gte: todayStart } } }),
    prisma.alert.count({ where: { status: "OPEN" } }),
  ]);

  // Peak occupancy today: running balance of ENTRY(+1)/EXIT(-1) events ordered by time,
  // seeded with whoever was already inside as of midnight (entered on a previous day and
  // hasn't exited yet) so the count reflects true occupancy, not just today's deltas.
  const [carriedOverInside, todaysEvents] = await Promise.all([
    prisma.studentPresence.count({ where: { status: "INSIDE", enteredAt: { lt: todayStart } } }),
    prisma.accessEvent.findMany({
      where: { timestamp: { gte: todayStart } },
      orderBy: { timestamp: "asc" },
      select: { eventType: true, timestamp: true },
    }),
  ]);
  let running = carriedOverInside;
  let peak = carriedOverInside;
  let peakAt: Date | null = null;
  for (const event of todaysEvents) {
    running += event.eventType === "ENTRY" ? 1 : -1;
    if (running > peak) {
      peak = running;
      peakAt = event.timestamp;
    }
  }

  return {
    inside,
    outside: Math.max(totalActive - inside, 0),
    totalActive,
    entriesToday,
    exitsToday,
    peakOccupancyToday: peak,
    peakOccupancyAt: peakAt,
    openAlerts,
    // Today's counters are necessarily partial until end of day — label them as such
    // in the UI (§29: "Clearly label incomplete/current-day data").
    isPartialDay: true,
  };
}

/** Hourly ENTRY/EXIT counts for today, for the occupancy/entry-exit charts. */
export async function getHourlyActivity() {
  const todayStart = startOfToday();
  const events = await prisma.accessEvent.findMany({
    where: { timestamp: { gte: todayStart } },
    select: { eventType: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  const buckets = new Map<number, { hour: number; entries: number; exits: number }>();
  for (let h = 0; h < 24; h++) buckets.set(h, { hour: h, entries: 0, exits: 0 });

  for (const event of events) {
    const hour = event.timestamp.getHours();
    const bucket = buckets.get(hour)!;
    if (event.eventType === "ENTRY") bucket.entries += 1;
    else bucket.exits += 1;
  }

  return Array.from(buckets.values());
}

export async function getGateActivity() {
  const todayStart = startOfToday();
  const grouped = await prisma.accessEvent.groupBy({
    by: ["gateId", "eventType"],
    where: { timestamp: { gte: todayStart } },
    _count: { _all: true },
  });
  const gates = await prisma.gate.findMany({ select: { id: true, name: true } });
  const gateNameById = new Map(gates.map((g) => [g.id, g.name]));

  const byGate = new Map<string, { gateId: string; gateName: string; entries: number; exits: number }>();
  for (const row of grouped) {
    const existing = byGate.get(row.gateId) ?? {
      gateId: row.gateId,
      gateName: gateNameById.get(row.gateId) ?? "Unknown",
      entries: 0,
      exits: 0,
    };
    if (row.eventType === "ENTRY") existing.entries = row._count._all;
    else existing.exits = row._count._all;
    byGate.set(row.gateId, existing);
  }
  return Array.from(byGate.values());
}

export async function getDepartmentActivity() {
  const todayStart = startOfToday();
  const events = await prisma.accessEvent.findMany({
    where: { timestamp: { gte: todayStart }, eventType: "ENTRY" },
    include: { student: { select: { department: true } } },
  });
  const counts = new Map<string, number>();
  for (const event of events) {
    const dept = event.student.department;
    counts.set(dept, (counts.get(dept) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([department, entries]) => ({ department, entries }));
}
