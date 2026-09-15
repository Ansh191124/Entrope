"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Plus, Power, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { apiFetch, ApiError } from "@/lib/api";

interface Gate {
  id: string;
  name: string;
  active: boolean;
  devices: Array<{ id: string; name: string; deviceIdentifier: string; active: boolean; lastSeenAt: string | null }>;
}

export default function AdminGatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const gatesQuery = useQuery({
    queryKey: ["gates"],
    queryFn: () => apiFetch<{ success: true; gates: Gate[] }>("/api/gates").then((r) => r.gates),
  });

  const [gateName, setGateName] = useState("");
  const [deviceForm, setDeviceForm] = useState<{ gateId: string; name: string; deviceIdentifier: string }>({
    gateId: "",
    name: "",
    deviceIdentifier: "",
  });
  const [lastSecret, setLastSecret] = useState<{ identifier: string; secret: string } | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["gates"] });
  }

  async function createGate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/gates", { method: "POST", body: JSON.stringify({ name: gateName }) });
      setGateName("");
      refresh();
      toast({ title: "Gate created", variant: "success" });
    } catch (err) {
      toast({ title: "Could not create gate", description: err instanceof ApiError ? err.message : undefined, variant: "error" });
    }
  }

  async function toggleGate(gate: Gate) {
    try {
      await apiFetch(`/api/gates/${gate.id}`, { method: "PATCH", body: JSON.stringify({ active: !gate.active }) });
      refresh();
    } catch {
      toast({ title: "Could not update gate", variant: "error" });
    }
  }

  async function deleteGate(gate: Gate) {
    if (!confirm(`Delete gate "${gate.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/gates/${gate.id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      toast({ title: "Could not delete gate", description: err instanceof ApiError ? err.message : undefined, variant: "error" });
    }
  }

  async function registerDevice(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ success: true; deviceSecret: string }>("/api/devices", {
        method: "POST",
        body: JSON.stringify(deviceForm),
      });
      setLastSecret({ identifier: deviceForm.deviceIdentifier, secret: res.deviceSecret });
      setDeviceForm({ gateId: "", name: "", deviceIdentifier: "" });
      refresh();
    } catch (err) {
      toast({ title: "Could not register device", description: err instanceof ApiError ? err.message : undefined, variant: "error" });
    }
  }

  async function toggleDevice(deviceId: string, active: boolean) {
    try {
      await apiFetch(`/api/devices/${deviceId}`, { method: "PATCH", body: JSON.stringify({ active: !active }) });
      refresh();
      toast({ title: !active ? "Device enabled" : "Device disabled", variant: !active ? "success" : "warning" });
    } catch {
      toast({ title: "Could not update device", variant: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Gates &amp; Devices</h1>

      {lastSecret && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold">Device secret for {lastSecret.identifier} (shown once — copy it now):</p>
            <code className="mt-1 block break-all rounded bg-background p-2">{lastSecret.secret}</code>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Gate</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createGate} className="flex gap-2">
              <Input placeholder="e.g. North Gate" value={gateName} onChange={(e) => setGateName(e.target.value)} required />
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Register Device</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={registerDevice} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="gateSelect">Gate</Label>
                <select
                  id="gateSelect"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={deviceForm.gateId}
                  onChange={(e) => setDeviceForm({ ...deviceForm, gateId: e.target.value })}
                >
                  <option value="">Select a gate…</option>
                  {gatesQuery.data?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="deviceName">Device Name</Label>
                <Input
                  id="deviceName"
                  required
                  value={deviceForm.name}
                  onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="deviceIdentifier">Device Identifier</Label>
                <Input
                  id="deviceIdentifier"
                  required
                  placeholder="e.g. KIOSK-MAIN-02"
                  value={deviceForm.deviceIdentifier}
                  onChange={(e) => setDeviceForm({ ...deviceForm, deviceIdentifier: e.target.value })}
                />
              </div>
              <Button type="submit">Register Device</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {gatesQuery.data?.map((gate) => (
          <Card key={gate.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <DoorOpen className="h-4 w-4" /> {gate.name}
                <Badge variant={gate.active ? "success" : "destructive"}>{gate.active ? "Active" : "Disabled"}</Badge>
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleGate(gate)}>
                  <Power className="mr-1 h-3.5 w-3.5" /> {gate.active ? "Disable" : "Enable"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteGate(gate)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {gate.devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No devices registered.</p>
              ) : (
                <ul className="space-y-2">
                  {gate.devices.map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p>{d.name}</p>
                        <code className="text-xs text-muted-foreground">{d.deviceIdentifier}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={d.active ? "outline" : "destructive"}>{d.active ? "Enabled" : "Revoked"}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => toggleDevice(d.id, d.active)}>
                          {d.active ? "Revoke" : "Re-enable"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
