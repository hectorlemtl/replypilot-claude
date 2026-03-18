import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { Flame, TrendingUp, Mail, Send, Clock, Target, Search } from "lucide-react";
import {
  useKPIs, useDailyReplies, useCampaignFunnel, useWeeklyCohort,
  useOrgEngagement, useThemeDistribution, useClassificationQuality,
  useCampaignList, useSyncStatus,
  type DateRange,
} from "@/hooks/useUnifiedData";

const TEMP_COLORS: Record<string, string> = {
  hot: "#ef4444", warm: "#f97316", simple: "#3b82f6",
  cold: "#9ca3af", for_later: "#eab308", out_of_office: "#a855f7",
};

function KPICard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon?: any; color?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-display font-bold text-midnight">{value}</p>
          </div>
          {Icon && <Icon className={`h-5 w-5 ${color || "text-muted-foreground"}`} />}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<string | undefined>();
  const [datePreset, setDatePreset] = useState("all");

  const dateRange: DateRange | undefined = (() => {
    if (datePreset === "all") return undefined;
    const end = new Date().toISOString();
    const days = datePreset === "7d" ? 7 : datePreset === "30d" ? 30 : datePreset === "90d" ? 90 : 0;
    const start = new Date(Date.now() - days * 86400000).toISOString();
    return { start, end };
  })();

  const { data: kpis, isLoading } = useKPIs(dateRange, campaign);
  const { data: daily } = useDailyReplies(dateRange, campaign);
  const { data: campaignFunnel } = useCampaignFunnel();
  const { data: weekly } = useWeeklyCohort();
  const { data: orgs } = useOrgEngagement(20);
  const { data: themes } = useThemeDistribution();
  const { data: classQuality } = useClassificationQuality();
  const { data: campaigns } = useCampaignList();
  const { data: syncStatus } = useSyncStatus();

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

  const tempData = [
    { name: "Hot", value: kpis?.hot || 0, color: TEMP_COLORS.hot },
    { name: "Warm", value: kpis?.warm || 0, color: TEMP_COLORS.warm },
    { name: "Simple", value: kpis?.simple || 0, color: TEMP_COLORS.simple },
    { name: "Cold", value: kpis?.cold || 0, color: TEMP_COLORS.cold },
    { name: "For later", value: kpis?.forLater || 0, color: TEMP_COLORS.for_later },
    { name: "OOO", value: kpis?.ooo || 0, color: TEMP_COLORS.out_of_office },
  ].filter(d => d.value > 0);

  const themeData = (themes || []).slice(0, 12).map((t: any) => ({
    name: (t.theme as string).replace(/_/g, " "),
    count: t.reply_count as number,
    rawName: t.theme as string,
  }));

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-midnight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unified cold email performance &middot; Last sync: {syncStatus?.last_sync_at ? new Date(syncStatus.last_sync_at).toLocaleString() : "Never"}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campaign || "all"} onValueChange={v => setCampaign(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All campaigns" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {(campaigns || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => navigate("/explore")}>
            <Search className="h-4 w-4 mr-1" /> Explore Replies
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Replies" value={kpis?.total || 0} icon={Mail} />
        <KPICard label="Positive Replies" value={kpis?.positive || 0} icon={TrendingUp} color="text-green-500" />
        <KPICard label="Positive Rate" value={`${kpis?.positiveRate || 0}%`} icon={Target} color="text-blue-500" />
        <KPICard label="Hot Replies" value={kpis?.hot || 0} icon={Flame} color="text-red-500" />
        <KPICard label="Warm Replies" value={kpis?.warm || 0} />
        <KPICard label="Responses Sent" value={kpis?.sent || 0} icon={Send} color="text-green-600" />
        <KPICard label="Avg Response Time" value={kpis?.avgResponseHours ? `${kpis.avgResponseHours}h` : "—"} icon={Clock} />
        <KPICard label="Unclassified" value={kpis?.unclassified || 0} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Reply Volume Over Time</CardTitle></CardHeader>
          <CardContent>
            {(daily?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="reply_date" tick={{ fontSize: 10 }} tickFormatter={d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={d => new Date(d).toLocaleDateString()} />
                  <Area type="monotone" dataKey="hot" stackId="1" fill={TEMP_COLORS.hot} stroke={TEMP_COLORS.hot} />
                  <Area type="monotone" dataKey="warm" stackId="1" fill={TEMP_COLORS.warm} stroke={TEMP_COLORS.warm} />
                  <Area type="monotone" dataKey="simple" stackId="1" fill={TEMP_COLORS.simple} stroke={TEMP_COLORS.simple} />
                  <Area type="monotone" dataKey="cold" stackId="1" fill={TEMP_COLORS.cold} stroke={TEMP_COLORS.cold} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No data — run sync first</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Temperature Breakdown</CardTitle></CardHeader>
          <CardContent>
            {tempData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={tempData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {tempData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Performance */}
      {campaignFunnel && campaignFunnel.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Campaign Performance</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Campaign</th>
                    <th className="py-2 px-2 font-medium text-right">Replies</th>
                    <th className="py-2 px-2 font-medium text-right">Hot</th>
                    <th className="py-2 px-2 font-medium text-right">Warm</th>
                    <th className="py-2 px-2 font-medium text-right">Positive</th>
                    <th className="py-2 px-2 font-medium text-right">Pos %</th>
                    <th className="py-2 px-2 font-medium text-right">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {(campaignFunnel as any[]).map((c: any) => (
                    <tr key={c.campaign_name} className="border-b hover:bg-muted/50">
                      <td className="py-2 pr-4 font-medium">{c.campaign_name || "Unknown"}</td>
                      <td className="py-2 px-2 text-right">{c.total_replies}</td>
                      <td className="py-2 px-2 text-right text-red-600">{c.hot_replies}</td>
                      <td className="py-2 px-2 text-right text-orange-600">{c.warm_replies}</td>
                      <td className="py-2 px-2 text-right text-green-600 font-medium">{c.positive_replies}</td>
                      <td className="py-2 px-2 text-right">{c.total_replies > 0 ? Math.round(c.positive_replies / c.total_replies * 100) : 0}%</td>
                      <td className="py-2 px-2 text-right">{c.responses_sent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Trend */}
      {weekly && weekly.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Weekly Trend — Positive Reply Rate</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weekly as any[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                <XAxis dataKey="reply_week" tick={{ fontSize: 10 }}
                  tickFormatter={d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip labelFormatter={d => `Week of ${new Date(d).toLocaleDateString()}`} />
                <Bar yAxisId="left" dataKey="total_replies" fill="#d1d5db" radius={[4, 4, 0, 0]} name="Total" />
                <Bar yAxisId="left" dataKey="positive_replies" fill="#22c55e" radius={[4, 4, 0, 0]} name="Positive" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Theme Analysis */}
      {themeData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Top Reply Themes</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/explore")}>
                <Search className="h-3 w-3 mr-1" /> Explore all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, themeData.length * 32)}>
              <BarChart data={themeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#5555E7" radius={[0, 4, 4, 0]} name="Replies"
                  onClick={(d: any) => navigate(`/explore?themes=${d.rawName}`)} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Orgs */}
      {orgs && orgs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top Engaged Organizations</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Organization</th>
                    <th className="py-2 px-2 font-medium">State</th>
                    <th className="py-2 px-2 font-medium text-right">Emails Sent</th>
                    <th className="py-2 px-2 font-medium text-right">Replies</th>
                    <th className="py-2 px-2 font-medium text-right">Positive</th>
                    <th className="py-2 px-2 font-medium">Last Reply</th>
                  </tr>
                </thead>
                <tbody>
                  {(orgs as any[]).map((o: any) => (
                    <tr key={o.company_name} className="border-b hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/explore?q=${encodeURIComponent(o.company_name)}`)}>
                      <td className="py-2 pr-4">
                        <span className="font-medium">{o.company_name}</span>
                        {o.company_domain && <span className="text-muted-foreground text-xs ml-2">{o.company_domain}</span>}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{o.org_state || "—"}</td>
                      <td className="py-2 px-2 text-right">{o.org_total_emails_sent || "—"}</td>
                      <td className="py-2 px-2 text-right">{o.reply_count}</td>
                      <td className="py-2 px-2 text-right text-green-600 font-medium">{o.positive_reply_count}</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">
                        {o.last_reply_at ? new Date(o.last_reply_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Classification Quality */}
      <Accordion type="single" collapsible>
        <AccordionItem value="quality">
          <AccordionTrigger className="text-sm font-medium">Classification Quality</AccordionTrigger>
          <AccordionContent>
            {classQuality && classQuality.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-medium">Source</th>
                      <th className="py-2 px-2 font-medium">Temperature</th>
                      <th className="py-2 px-2 font-medium text-right">Count</th>
                      <th className="py-2 px-2 font-medium text-right">Avg Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(classQuality as any[]).map((row: any, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 pr-4 text-muted-foreground">{row.classification_source || "unclassified"}</td>
                        <td className="py-1 px-2">{row.temperature || "null"}</td>
                        <td className="py-1 px-2 text-right">{row.count}</td>
                        <td className="py-1 px-2 text-right">{row.avg_confidence ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No classification data yet</p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
