import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, Copy, Mail } from "lucide-react";
import { useExplorerReplies, useThemeCounts, useCampaignList, type ExplorerFilters, type UnifiedReply } from "@/hooks/useUnifiedData";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const THEME_TREE: Record<string, { color: string; themes: string[] }> = {
  Interest: {
    color: "bg-green-100 text-green-800",
    themes: ["ready_to_switch", "requesting_demo", "requesting_info", "forwarding_to_decision_maker", "already_signed_up", "comparing_alternatives"],
  },
  Objections: {
    color: "bg-red-100 text-red-800",
    themes: ["happy_with_current", "fees_not_a_concern", "too_small_to_matter", "board_approval_needed", "timing_not_right", "already_free_alternative", "trust_concern", "technical_concern"],
  },
  Questions: {
    color: "bg-blue-100 text-blue-800",
    themes: ["how_zeffy_works", "migration_question", "feature_question", "pricing_question"],
  },
  Operational: {
    color: "bg-gray-100 text-gray-800",
    themes: ["wrong_person", "org_dissolved", "already_using_zeffy", "unsubscribe_request", "auto_reply", "spam_complaint"],
  },
};

const TEMP_COLORS: Record<string, string> = {
  hot: "bg-red-100 text-red-700 border-red-200",
  warm: "bg-orange-100 text-orange-700 border-orange-200",
  simple: "bg-blue-100 text-blue-700 border-blue-200",
  cold: "bg-gray-100 text-gray-600 border-gray-200",
  for_later: "bg-yellow-100 text-yellow-700 border-yellow-200",
  out_of_office: "bg-purple-100 text-purple-700 border-purple-200",
};

function ThemeBadge({ theme }: { theme: string }) {
  const category = Object.entries(THEME_TREE).find(([_, v]) => v.themes.includes(theme));
  const colorClass = category ? category[1].color : "bg-gray-100 text-gray-600";
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${colorClass}`}>{theme.replace(/_/g, " ")}</span>;
}

function TempBadge({ temperature }: { temperature: string | null }) {
  if (!temperature) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${TEMP_COLORS[temperature] || "bg-gray-100"}`}>{temperature}</span>;
}

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  // Parse URL state
  const [filters, setFilters] = useState<ExplorerFilters>(() => ({
    searchQuery: searchParams.get("q") || "",
    themes: searchParams.get("themes")?.split(",").filter(Boolean) || [],
    temperature: searchParams.get("temp")?.split(",").filter(Boolean) || [],
    campaign: searchParams.get("campaign") || undefined,
    sortBy: (searchParams.get("sort") as any) || "newest",
    page: 0,
  }));

  const [selectedReply, setSelectedReply] = useState<UnifiedReply | null>(null);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.searchQuery) params.set("q", filters.searchQuery);
    if (filters.themes?.length) params.set("themes", filters.themes.join(","));
    if (filters.temperature?.length) params.set("temp", filters.temperature.join(","));
    if (filters.campaign) params.set("campaign", filters.campaign);
    if (filters.sortBy && filters.sortBy !== "newest") params.set("sort", filters.sortBy);
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  const { data, isLoading } = useExplorerReplies(filters);
  const { data: themeCounts } = useThemeCounts({
    searchQuery: filters.searchQuery,
    temperature: filters.temperature,
    campaign: filters.campaign,
    dateRange: filters.dateRange,
  });
  const { data: campaigns } = useCampaignList();

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setSelectedReply(null); if (document.activeElement === searchRef.current) searchRef.current?.blur(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const updateFilters = useCallback((patch: Partial<ExplorerFilters>) => {
    setFilters(f => ({ ...f, ...patch, page: 0 }));
    setSelectedReply(null);
  }, []);

  const toggleTheme = useCallback((theme: string) => {
    setFilters(f => {
      const current = f.themes || [];
      const next = current.includes(theme) ? current.filter(t => t !== theme) : [...current, theme];
      return { ...f, themes: next, page: 0 };
    });
  }, []);

  const toggleTemp = useCallback((temp: string) => {
    setFilters(f => {
      const current = f.temperature || [];
      const next = current.includes(temp) ? current.filter(t => t !== temp) : [...current, temp];
      return { ...f, temperature: next, page: 0 };
    });
  }, []);

  const clearAll = useCallback(() => {
    setFilters({ sortBy: "newest", page: 0 });
    setSelectedReply(null);
  }, []);

  const hasFilters = (filters.searchQuery || filters.themes?.length || filters.temperature?.length || filters.campaign);
  const replies = data?.replies || [];
  const total = data?.total || 0;

  return (
    <div className="h-[calc(100vh-40px)] flex">
      {/* Left Panel — Filters & Themes */}
      <div className="w-72 border-r flex flex-col bg-background">
        {/* Search */}
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder='Search replies... (press "/")'
              value={filters.searchQuery || ""}
              onChange={e => updateFilters({ searchQuery: e.target.value })}
              className="pl-9 h-9 text-sm"
            />
            {filters.searchQuery && (
              <button className="absolute right-2.5 top-2.5" onClick={() => updateFilters({ searchQuery: "" })}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          {filters.searchQuery && (
            <p className="text-xs text-muted-foreground mt-1">{total} results</p>
          )}
        </div>

        {/* Active filters */}
        {hasFilters && (
          <div className="p-3 border-b flex flex-wrap gap-1">
            {filters.themes?.map(t => (
              <Badge key={t} variant="secondary" className="text-[10px] cursor-pointer" onClick={() => toggleTheme(t)}>
                {t.replace(/_/g, " ")} <X className="h-2.5 w-2.5 ml-1" />
              </Badge>
            ))}
            {filters.temperature?.map(t => (
              <Badge key={t} variant="secondary" className="text-[10px] cursor-pointer" onClick={() => toggleTemp(t)}>
                {t} <X className="h-2.5 w-2.5 ml-1" />
              </Badge>
            ))}
            <button className="text-[10px] text-muted-foreground underline ml-1" onClick={clearAll}>Clear all</button>
          </div>
        )}

        <ScrollArea className="flex-1">
          {/* Temperature filter */}
          <div className="p-3 border-b">
            <p className="text-xs font-medium text-muted-foreground mb-2">Temperature</p>
            <div className="flex flex-wrap gap-1">
              {Object.keys(TEMP_COLORS).map(temp => (
                <button key={temp}
                  className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                    filters.temperature?.includes(temp) ? TEMP_COLORS[temp] + " font-medium" : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                  onClick={() => toggleTemp(temp)}>
                  {temp}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign filter */}
          <div className="p-3 border-b">
            <p className="text-xs font-medium text-muted-foreground mb-2">Campaign</p>
            <Select value={filters.campaign || "all"} onValueChange={v => updateFilters({ campaign: v === "all" ? undefined : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {(campaigns || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Theme tree */}
          <div className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Themes</p>
            <Accordion type="multiple" defaultValue={["Interest", "Objections"]}>
              {Object.entries(THEME_TREE).map(([category, { themes: categoryThemes }]) => {
                const categoryCount = categoryThemes.reduce((sum, t) => sum + ((themeCounts as any)?.[t] || 0), 0);
                return (
                  <AccordionItem key={category} value={category} className="border-none">
                    <AccordionTrigger className="py-1.5 text-xs font-medium hover:no-underline">
                      <span className="flex items-center gap-2">
                        {category}
                        {categoryCount > 0 && <span className="text-muted-foreground font-normal">{categoryCount}</span>}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <div className="space-y-0.5 ml-2">
                        {categoryThemes.map(theme => {
                          const count = (themeCounts as any)?.[theme] || 0;
                          const isActive = filters.themes?.includes(theme);
                          return (
                            <button key={theme}
                              className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-muted transition-colors ${isActive ? "bg-primary/10 font-medium" : ""}`}
                              onClick={() => toggleTheme(theme)}>
                              <span>{theme.replace(/_/g, " ")}</span>
                              {count > 0 && <span className="text-muted-foreground">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel — Reply List + Detail */}
      <div className="flex-1 flex flex-col">
        {/* Sort bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} {total === 1 ? "reply" : "replies"}
          </p>
          <Select value={filters.sortBy || "newest"} onValueChange={v => updateFilters({ sortBy: v as any })}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="hot_first">Hot first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Reply list */}
          <ScrollArea className={`${selectedReply ? "w-1/2" : "w-full"} border-r`}>
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : replies.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No replies match your filters</p>
              </div>
            ) : (
              <div>
                {replies.map(reply => (
                  <div key={reply.id}
                    className={`px-4 py-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${selectedReply?.id === reply.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                    onClick={() => setSelectedReply(reply)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium truncate">{reply.lead_name || reply.lead_email}</span>
                          <TempBadge temperature={reply.temperature} />
                          {reply.source_system === "both" && <span className="text-[9px] text-muted-foreground">BOTH</span>}
                        </div>
                        {reply.company_name && (
                          <p className="text-xs text-muted-foreground truncate">{reply.company_name}{reply.org_state ? `, ${reply.org_state}` : ""}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{reply.reply_text?.slice(0, 150)}</p>
                        {reply.themes && reply.themes.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {reply.themes.slice(0, 3).map(t => <ThemeBadge key={t} theme={t} />)}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
                {/* Pagination */}
                {total > 50 && (
                  <div className="p-4 flex justify-center gap-2">
                    <Button variant="outline" size="sm" disabled={(filters.page || 0) === 0}
                      onClick={() => setFilters(f => ({ ...f, page: (f.page || 0) - 1 }))}>Previous</Button>
                    <span className="text-xs text-muted-foreground self-center">
                      Page {(filters.page || 0) + 1} of {Math.ceil(total / 50)}
                    </span>
                    <Button variant="outline" size="sm" disabled={((filters.page || 0) + 1) * 50 >= total}
                      onClick={() => setFilters(f => ({ ...f, page: (f.page || 0) + 1 }))}>Next</Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Reply detail */}
          {selectedReply && (
            <ScrollArea className="w-1/2 bg-muted/20">
              <div className="p-4 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold">{selectedReply.lead_name || selectedReply.lead_email}</h3>
                    <p className="text-xs text-muted-foreground">{selectedReply.lead_email}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => {
                      navigator.clipboard.writeText(selectedReply.reply_text || "");
                      toast({ title: "Copied to clipboard" });
                    }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedReply(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Org info */}
                {selectedReply.company_name && (
                  <Card>
                    <CardContent className="py-3 space-y-1">
                      <p className="text-sm font-medium">{selectedReply.company_name}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        {selectedReply.company_domain && <span>{selectedReply.company_domain}</span>}
                        {selectedReply.org_state && <span>{selectedReply.org_city ? `${selectedReply.org_city}, ` : ""}{selectedReply.org_state}</span>}
                        {selectedReply.ein && <span>EIN: {selectedReply.ein}</span>}
                      </div>
                      <div className="flex gap-4 text-xs">
                        {selectedReply.org_total_emails_sent != null && <span>{selectedReply.org_total_emails_sent} emails sent</span>}
                        {selectedReply.org_total_replies != null && <span>{selectedReply.org_total_replies} replies</span>}
                        {selectedReply.org_total_positive != null && <span className="text-green-600">{selectedReply.org_total_positive} positive</span>}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Classification */}
                <Card>
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <TempBadge temperature={selectedReply.temperature} />
                      {selectedReply.classification_source && (
                        <span className="text-[10px] text-muted-foreground">via {selectedReply.classification_source}</span>
                      )}
                    </div>
                    {selectedReply.reasoning && (
                      <p className="text-xs text-muted-foreground italic">{selectedReply.reasoning}</p>
                    )}
                    {selectedReply.themes && selectedReply.themes.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {selectedReply.themes.map(t => <ThemeBadge key={t} theme={t} />)}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Email content */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Re: {selectedReply.reply_subject || "(no subject)"}</span>
                      <span>{new Date(selectedReply.received_at).toLocaleString()}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="py-3">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedReply.reply_text}</p>
                  </CardContent>
                </Card>

                {/* Metadata */}
                <div className="text-xs text-muted-foreground space-y-1">
                  {selectedReply.campaign_name && <p>Campaign: {selectedReply.campaign_name}</p>}
                  {selectedReply.sequence_step && <p>Sequence step: {selectedReply.sequence_step}</p>}
                  {selectedReply.rp_status && <p>ReplyPilot status: {selectedReply.rp_status}</p>}
                  {selectedReply.rp_draft_count != null && selectedReply.rp_draft_count > 0 && <p>Drafts: {selectedReply.rp_draft_count}</p>}
                  <p>Source: {selectedReply.source_system}</p>
                  {selectedReply.original_reply_category && <p>Original category: {selectedReply.original_reply_category}</p>}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
