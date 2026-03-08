import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { TemperatureBadge } from "@/components/TemperatureBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ExternalLink, Check, X, RefreshCw, AlertTriangle, Send } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function ReplyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [editedDraft, setEditedDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const { data: reply, isLoading } = useQuery({
    queryKey: ["reply", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_replies")
        .select("*, campaigns(name, deck_link, calendar_link)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: drafts } = useQuery({
    queryKey: ["drafts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("draft_versions")
        .select("*")
        .eq("reply_id", id!)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: actions } = useQuery({
    queryKey: ["approval_actions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_actions")
        .select("*")
        .eq("reply_id", id!)
        .order("acted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: sendAttempts } = useQuery({
    queryKey: ["send_attempts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("send_attempts")
        .select("*")
        .eq("reply_id", id!)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const latestDraft = drafts?.[0];
      if (!latestDraft) throw new Error("No draft to approve");

      // Log approval
      await supabase.from("approval_actions").insert({
        reply_id: id!,
        draft_version_id: latestDraft.id,
        action: "approved",
        acted_by: "reviewer",
      });

      // Update status
      await supabase
        .from("inbound_replies")
        .update({ status: "approved" })
        .eq("id", id!);

      // Trigger send via edge function
      const { error } = await supabase.functions.invoke("send-reply", {
        body: { reply_id: id, draft_version_id: latestDraft.id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Reply approved and sent!" });
      queryClient.invalidateQueries({ queryKey: ["reply", id] });
      queryClient.invalidateQueries({ queryKey: ["inbound_replies"] });
    },
    onError: (err) => {
      toast({ title: "Failed to send", description: String(err), variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!feedback.trim()) throw new Error("Please provide feedback");
      const latestDraft = drafts?.[0];

      await supabase.from("approval_actions").insert({
        reply_id: id!,
        draft_version_id: latestDraft?.id,
        action: "rejected",
        feedback: feedback.trim(),
        acted_by: "reviewer",
      });

      await supabase
        .from("inbound_replies")
        .update({ status: "rejected" })
        .eq("id", id!);

      // Trigger regeneration
      const { error } = await supabase.functions.invoke("regenerate-draft", {
        body: { reply_id: id, feedback: feedback.trim() },
      });
      if (error) throw error;
      setFeedback("");
    },
    onSuccess: () => {
      toast({ title: "Feedback submitted, regenerating draft..." });
      queryClient.invalidateQueries({ queryKey: ["reply", id] });
      queryClient.invalidateQueries({ queryKey: ["drafts", id] });
    },
    onError: (err) => {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    },
  });

  const markManualMutation = useMutation({
    mutationFn: async () => {
      await supabase
        .from("inbound_replies")
        .update({ status: "manual_review" })
        .eq("id", id!);
    },
    onSuccess: () => {
      toast({ title: "Marked for manual review" });
      queryClient.invalidateQueries({ queryKey: ["reply", id] });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const nextVersion = (drafts?.[0]?.version_number || 0) + 1;
      await supabase.from("draft_versions").insert({
        reply_id: id!,
        version_number: nextVersion,
        draft_text: editedDraft,
        draft_html: `<p>${editedDraft.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
        created_by: "manual",
      });
      await supabase
        .from("inbound_replies")
        .update({ status: "awaiting_review" })
        .eq("id", id!);
      setIsEditing(false);
    },
    onSuccess: () => {
      toast({ title: "Draft saved" });
      queryClient.invalidateQueries({ queryKey: ["drafts", id] });
      queryClient.invalidateQueries({ queryKey: ["reply", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!reply) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-muted-foreground">Reply not found</p>
        <Button variant="ghost" onClick={() => navigate("/")} className="mt-4">
          Back to inbox
        </Button>
      </div>
    );
  }

  const latestDraft = drafts?.[0];
  const canApprove = ["awaiting_review", "regenerated"].includes(reply.status);
  const canReject = canApprove;

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-display font-bold text-midnight">
              {reply.lead_name || reply.lead_email}
            </h1>
            <TemperatureBadge temperature={reply.temperature} />
            <StatusBadge status={reply.status} />
          </div>
          <p className="text-sm text-muted-foreground">{reply.lead_email}</p>
        </div>
        {reply.instantly_unibox_url && (
          <a
            href={reply.instantly_unibox_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-frozen flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Instantly
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Original Reply */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Original reply</CardTitle>
              <p className="text-xs text-muted-foreground">{reply.reply_subject}</p>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="text">
                <TabsList className="mb-3">
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                </TabsList>
                <TabsContent value="text">
                  <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
                    {reply.reply_text || "No text content"}
                  </div>
                </TabsContent>
                <TabsContent value="html">
                  <div
                    className="bg-muted/50 rounded-lg p-4 text-sm prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: reply.reply_html || "<p>No HTML content</p>" }}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Campaign</dt>
                  <dd className="font-medium">{(reply as any).campaigns?.name || "None"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">First reply</dt>
                  <dd className="font-medium">{reply.is_first_reply ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Wants PDF</dt>
                  <dd className="font-medium">{reply.wants_pdf ? "Yes" : reply.wants_pdf === false ? "No" : "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Simple affirmative</dt>
                  <dd className="font-medium">{reply.simple_affirmative ? "Yes" : reply.simple_affirmative === false ? "No" : "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Sentiment</dt>
                  <dd className="font-medium capitalize">{reply.sentiment || "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Received</dt>
                  <dd className="font-medium">{reply.received_at ? format(new Date(reply.received_at), "PPp") : "—"}</dd>
                </div>
              </dl>
              {reply.reasoning && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">AI reasoning</p>
                  <p className="text-sm">{reply.reasoning}</p>
                </div>
              )}
              {reply.processing_error && (
                <div className="mt-4 pt-4 border-t border-destructive/20">
                  <div className="flex items-center gap-2 text-destructive text-xs mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Error
                  </div>
                  <p className="text-sm text-destructive">{reply.processing_error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Draft & Actions */}
        <div className="space-y-4">
          {latestDraft ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Draft v{latestDraft.version_number}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    by {latestDraft.created_by}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editedDraft}
                      onChange={(e) => setEditedDraft(e.target.value)}
                      className="min-h-[200px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveDraftMutation.mutate()}>
                        Save draft
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap mb-4">
                      {latestDraft.draft_text}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditedDraft(latestDraft.draft_text);
                        setIsEditing(true);
                      }}
                    >
                      Edit draft
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground text-sm">No draft generated yet</p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {canApprove && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                  >
                    <Send className="w-4 h-4 mr-1" />
                    {approveMutation.isPending ? "Sending..." : "Approve & send"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => markManualMutation.mutate()}
                    disabled={markManualMutation.isPending}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Manual
                  </Button>
                </div>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Provide feedback to regenerate the draft..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => rejectMutation.mutate()}
                    disabled={rejectMutation.isPending || !feedback.trim()}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    {rejectMutation.isPending ? "Regenerating..." : "Reject & regenerate"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {reply.status === "failed" && (
            <Card>
              <CardContent className="py-4">
                <Button
                  className="w-full"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry send
                </Button>
              </CardContent>
            </Card>
          )}

          {/* History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="versions">
                <TabsList className="mb-3">
                  <TabsTrigger value="versions">Versions ({drafts?.length || 0})</TabsTrigger>
                  <TabsTrigger value="actions">Reviews ({actions?.length || 0})</TabsTrigger>
                  <TabsTrigger value="sends">Sends ({sendAttempts?.length || 0})</TabsTrigger>
                </TabsList>
                <TabsContent value="versions" className="space-y-2">
                  {drafts?.map((d: any) => (
                    <div key={d.id} className="border border-border rounded-lg p-3 text-sm">
                      <div className="flex justify-between mb-1">
                        <span className="font-medium">v{d.version_number}</span>
                        <span className="text-xs text-muted-foreground">
                          {d.created_at ? format(new Date(d.created_at), "PPp") : ""}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs truncate">{d.draft_text.slice(0, 120)}...</p>
                      {d.feedback_used && (
                        <p className="text-xs text-primary mt-1">Feedback: {d.feedback_used}</p>
                      )}
                    </div>
                  ))}
                  {!drafts?.length && <p className="text-sm text-muted-foreground">No versions yet</p>}
                </TabsContent>
                <TabsContent value="actions" className="space-y-2">
                  {actions?.map((a: any) => (
                    <div key={a.id} className="border border-border rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        {a.action === "approved" ? (
                          <Check className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-destructive" />
                        )}
                        <span className="font-medium capitalize">{a.action}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {a.acted_at ? format(new Date(a.acted_at), "PPp") : ""}
                        </span>
                      </div>
                      {a.feedback && <p className="text-xs text-muted-foreground">{a.feedback}</p>}
                    </div>
                  ))}
                  {!actions?.length && <p className="text-sm text-muted-foreground">No reviews yet</p>}
                </TabsContent>
                <TabsContent value="sends" className="space-y-2">
                  {sendAttempts?.map((s: any) => (
                    <div key={s.id} className="border border-border rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2">
                        {s.success ? (
                          <Check className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-destructive" />
                        )}
                        <span className="font-medium">
                          {s.success ? "Sent" : `Failed (${s.status_code || "unknown"})`}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {s.sent_at ? format(new Date(s.sent_at), "PPp") : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                  {!sendAttempts?.length && <p className="text-sm text-muted-foreground">No send attempts yet</p>}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
