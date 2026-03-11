import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function PromptTester() {
  const [sampleReply, setSampleReply] = useState("");
  const [selectedType, setSelectedType] = useState("classification");
  const [model, setModel] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replySearch, setReplySearch] = useState("");
  const [showReplyPicker, setShowReplyPicker] = useState(false);

  const { data: templates } = useQuery({
    queryKey: ["prompt_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prompt_templates").select("*").order("template_type");
      if (error) throw error;
      return data;
    },
  });

  // Fetch recent inbound replies for the picker
  const { data: pastReplies } = useQuery({
    queryKey: ["past_replies_for_tester"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_replies")
        .select("id, lead_name, lead_email, reply_text, reply_subject, temperature, status, received_at, is_first_reply")
        .not("instantly_email_id", "like", "test_%")
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const filteredReplies = useMemo(() => {
    if (!pastReplies) return [];
    if (!replySearch.trim()) return pastReplies;
    const q = replySearch.toLowerCase();
    return pastReplies.filter(
      (r) =>
        (r.lead_name || "").toLowerCase().includes(q) ||
        (r.lead_email || "").toLowerCase().includes(q) ||
        (r.reply_text || "").toLowerCase().includes(q) ||
        (r.reply_subject || "").toLowerCase().includes(q)
    );
  }, [pastReplies, replySearch]);

  const activeTemplate = templates?.find(t => t.template_type === selectedType && t.active);

  const handleRun = async () => {
    if (!sampleReply.trim()) return;
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      // Determine which edge function to call based on type
      let functionName: string;
      let body: any;

      if (selectedType === "classification") {
        // We'll create a temporary test by calling classify-reply with a test payload
        // For testing, we use a special test mode
        functionName = "classify-reply";

        // Insert a temporary test reply
        const { data: testReply, error: insertError } = await supabase
          .from("inbound_replies")
          .insert({
            instantly_email_id: `test_${Date.now()}`,
            lead_email: "test@prompt-tester.local",
            lead_name: "Prompt Test",
            reply_text: sampleReply,
            reply_subject: "Prompt Test",
            is_first_reply: true,
            status: "received",
          })
          .select("id")
          .single();

        if (insertError) throw insertError;

        const { data: fnResult, error: fnError } = await supabase.functions.invoke(functionName, {
          body: { reply_id: testReply.id },
        });

        // Fetch the updated reply
        const { data: updatedReply } = await supabase
          .from("inbound_replies")
          .select("temperature, reasoning, wants_pdf, simple_affirmative, sentiment, status")
          .eq("id", testReply.id)
          .single();

        // Clean up test reply
        await supabase.from("draft_versions").delete().eq("reply_id", testReply.id);
        await supabase.from("audit_logs").delete().eq("reply_id", testReply.id);
        await supabase.from("inbound_replies").delete().eq("id", testReply.id);

        setResult({
          function_response: fnResult,
          classification: updatedReply,
          template_used: activeTemplate?.name || "default",
          model_used: activeTemplate?.model_name || "default",
        });
      } else if (selectedType === "draft_generation") {
        // Create temp reply, classify it, then check draft
        const { data: testReply, error: insertError } = await supabase
          .from("inbound_replies")
          .insert({
            instantly_email_id: `test_draft_${Date.now()}`,
            lead_email: "test@prompt-tester.local",
            lead_name: "Draft Test",
            reply_text: sampleReply,
            reply_subject: "Draft Test",
            is_first_reply: true,
            status: "classified",
            temperature: "hot",
          })
          .select("id")
          .single();

        if (insertError) throw insertError;

        const { data: fnResult, error: fnError } = await supabase.functions.invoke("generate-draft", {
          body: { reply_id: testReply.id },
        });

        // Fetch draft
        const { data: draft } = await supabase
          .from("draft_versions")
          .select("*")
          .eq("reply_id", testReply.id)
          .order("version_number", { ascending: false })
          .limit(1)
          .single();

        // Clean up
        await supabase.from("draft_versions").delete().eq("reply_id", testReply.id);
        await supabase.from("audit_logs").delete().eq("reply_id", testReply.id);
        await supabase.from("inbound_replies").delete().eq("id", testReply.id);

        setResult({
          function_response: fnResult,
          draft: draft?.draft_text || "No draft generated",
          template_used: activeTemplate?.name || "default",
          model_used: activeTemplate?.model_name || "default",
        });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prompt Tester</CardTitle>
        <CardDescription>Test prompts against sample replies without affecting live data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Prompt type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classification">Classification</SelectItem>
                <SelectItem value="draft_generation">Draft generation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Active template</Label>
            <p className="text-xs text-muted-foreground py-1.5">
              {activeTemplate ? `${activeTemplate.name} (${activeTemplate.model_name})` : "Using defaults"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Sample inbound reply</Label>
            <button
              type="button"
              onClick={() => setShowReplyPicker(!showReplyPicker)}
              className="text-[11px] text-primary hover:underline"
            >
              {showReplyPicker ? "Hide" : "Load from past replies"}
            </button>
          </div>

          {showReplyPicker && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="relative p-1.5 border-b border-border bg-muted/30">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  value={replySearch}
                  onChange={(e) => setReplySearch(e.target.value)}
                  placeholder="Search by name, email, or text..."
                  className="pl-7 h-7 text-[11px]"
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {filteredReplies.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-4">No replies found</p>
                ) : (
                  filteredReplies.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSampleReply(r.reply_text || "");
                        setShowReplyPicker(false);
                        setReplySearch("");
                      }}
                      className="w-full text-left px-3 py-2 border-b border-border/50 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-medium text-foreground truncate">
                          {r.lead_name || r.lead_email}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {r.temperature}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {r.status}
                        </span>
                        {r.received_at && (
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            {formatDistanceToNow(new Date(r.received_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {r.reply_text?.slice(0, 100) || r.reply_subject || "No text"}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <Textarea
            value={sampleReply}
            onChange={(e) => setSampleReply(e.target.value)}
            placeholder="Paste a sample email reply here, or load one from past replies above..."
            className="min-h-[100px] text-xs font-mono"
          />
        </div>

        <Button
          onClick={handleRun}
          disabled={isRunning || !sampleReply.trim()}
          size="sm"
        >
          {isRunning ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running...</>
          ) : (
            <><Play className="w-3.5 h-3.5 mr-1.5" /> Test prompt</>
          )}
        </Button>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-xs font-semibold mb-2">Result</p>
            <pre className="text-[11px] font-mono whitespace-pre-wrap overflow-auto max-h-[300px]">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
