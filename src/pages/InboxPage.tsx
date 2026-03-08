import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { TemperatureBadge } from "@/components/TemperatureBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Inbox, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "hot", label: "🔥 Hot", type: "temperature" },
  { key: "warm", label: "☀️ Warm", type: "temperature" },
  { key: "cold", label: "❄️ Cold", type: "temperature" },
  { key: "for_later", label: "⏳ For later", type: "temperature" },
  { key: "out_of_office", label: "✈️ OOO", type: "temperature" },
  { key: "awaiting_review", label: "Awaiting review", type: "status" },
  { key: "sent", label: "Sent", type: "status" },
  { key: "manual_review", label: "Manual review", type: "status" },
  { key: "failed", label: "Failed", type: "status" },
] as const;

export default function InboxPage() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { data: replies, isLoading } = useQuery({
    queryKey: ["inbound_replies", activeFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("inbound_replies")
        .select("*, campaigns(name)")
        .order("received_at", { ascending: false });

      if (activeFilter !== "all") {
        const filter = FILTERS.find((f) => f.key === activeFilter);
        if (filter && "type" in filter) {
          if (filter.type === "temperature") query = query.eq("temperature", activeFilter as any);
          else query = query.eq("status", activeFilter as any);
        }
      }

      if (search) {
        query = query.or(
          `lead_email.ilike.%${search}%,reply_subject.ilike.%${search}%,reply_text.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["inbox_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_replies")
        .select("status, temperature");
      if (error) throw error;
      const statusCounts: Record<string, number> = {};
      const tempCounts: Record<string, number> = {};
      data?.forEach((r) => {
        if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        if (r.temperature) tempCounts[r.temperature] = (tempCounts[r.temperature] || 0) + 1;
      });
      return { status: statusCounts, temperature: tempCounts, total: data?.length || 0 };
    },
  });

  function getCount(key: string): number {
    if (key === "all") return counts?.total || 0;
    const filter = FILTERS.find((f) => f.key === key);
    if (filter && "type" in filter) {
      return filter.type === "temperature"
        ? counts?.temperature[key] || 0
        : counts?.status[key] || 0;
    }
    return 0;
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-midnight">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and manage inbound email replies
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by email, subject, or reply text..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              activeFilter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
            )}
          >
            {f.label}
            <span className="ml-1.5 opacity-70">{getCount(f.key)}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : !replies?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold text-foreground mb-1">No replies yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Inbound replies from Instantly will appear here once the webhook is configured.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[200px]">Lead</TableHead>
                <TableHead>Subject / Preview</TableHead>
                <TableHead className="w-[100px]">Temp</TableHead>
                <TableHead className="w-[60px] text-center">PDF</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[120px]">Received</TableHead>
                <TableHead className="w-[140px]">Campaign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {replies.map((reply: any) => (
                <TableRow
                  key={reply.id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    reply.status === "awaiting_review" && "bg-warning/5",
                    reply.temperature === "hot" && reply.status === "awaiting_review" && "bg-destructive/5"
                  )}
                  onClick={() => navigate(`/reply/${reply.id}`)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-foreground truncate">
                        {reply.lead_name || reply.lead_email}
                      </p>
                      {reply.lead_name && (
                        <p className="text-xs text-muted-foreground truncate">{reply.lead_email}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground truncate max-w-[300px]">
                      {reply.reply_subject}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                      {reply.reply_text?.slice(0, 80)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <TemperatureBadge temperature={reply.temperature} />
                  </TableCell>
                  <TableCell className="text-center">
                    {reply.wants_pdf ? (
                      <Check className="w-4 h-4 text-success mx-auto" />
                    ) : reply.wants_pdf === false ? (
                      <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={reply.status} />
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {reply.received_at
                        ? formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {(reply as any).campaigns?.name || "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
