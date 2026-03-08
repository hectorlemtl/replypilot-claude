import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const CHART_COLORS = ["#5555E7", "#09CFAF", "#FFB424", "#FF3947", "#1B1BB5", "#0F0E5B"];

export default function AnalyticsPage() {
  const { data: replies, isLoading } = useQuery({
    queryKey: ["analytics_replies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_replies")
        .select("status, temperature, received_at, campaign_id, is_first_reply, simple_affirmative");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const total = replies?.length || 0;
  const byTemp: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  replies?.forEach((r) => {
    if (r.temperature) byTemp[r.temperature] = (byTemp[r.temperature] || 0) + 1;
    if (r.status) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  });

  const pct = (n: number) => total ? `${Math.round((n / total) * 100)}%` : "0%";

  const stats = [
    { label: "Total replies", value: total },
    { label: "Hot rate", value: pct(byTemp.hot || 0) },
    { label: "Warm rate", value: pct(byTemp.warm || 0) },
    { label: "Skipped rate", value: pct(byStatus.skipped || 0) },
    { label: "Sent", value: byStatus.sent || 0 },
    { label: "Awaiting review", value: byStatus.awaiting_review || 0 },
    { label: "Manual review", value: byStatus.manual_review || 0 },
    { label: "Failed sends", value: byStatus.failed || 0 },
  ];

  const tempData = Object.entries(byTemp).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-midnight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Operational performance overview</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className="text-2xl font-display font-bold text-midnight">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temperature breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By temperature</CardTitle>
          </CardHeader>
          <CardContent>
            {tempData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={tempData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {tempData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#5555E7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
