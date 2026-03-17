import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Save, Pencil, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { PromptTester } from "@/components/cockpit/PromptTester";
import { SendLogsPanel } from "@/components/settings/SendLogsPanel";
import { format } from "date-fns";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").single();
      if (error) throw error;
      return data;
    },
  });

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["prompt_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prompt_templates").select("*").order("template_type");
      if (error) throw error;
      return data;
    },
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (settings) setForm({ ...settings });
  }, [settings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { id, created_at, ...updates } = form;
      const { error } = await supabase.from("app_settings").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
    },
    onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (template: any) => {
      const { error } = await supabase
        .from("prompt_templates")
        .update({
          system_prompt: template.system_prompt,
          user_prompt: template.user_prompt,
          model_name: template.model_name,
          active: template.active,
        })
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Template saved" });
      queryClient.invalidateQueries({ queryKey: ["prompt_templates"] });
    },
    onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
  });

  if (settingsLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-midnight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure ReplyPilot</p>
      </div>

      <Tabs defaultValue="prompts">
        <TabsList className="mb-6">
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="test">Test prompts</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="slack">Slack</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Actions</TabsTrigger>
          <TabsTrigger value="logs">Send Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts">
          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 mb-4">
              <p className="text-xs text-primary font-medium">
                These prompts are used by the edge functions in real-time. Changes take effect immediately on new classifications and drafts.
              </p>
            </div>
            {templatesLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)
            ) : (
              templates?.map((t: any) => (
                <PromptTemplateCard key={t.id} template={t} onSave={(updated) => saveTemplateMutation.mutate(updated)} />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="test">
          <PromptTester />
        </TabsContent>

        <TabsContent value="workspace">
          {form && (
            <Card>
              <CardHeader>
                <CardTitle>Workspace</CardTitle>
                <CardDescription>General configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Workspace name</Label>
                  <Input value={form.workspace_name || ""} onChange={(e) => setForm({ ...form, workspace_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Default calendar link</Label>
                  <Input value={form.default_calendar_link || ""} onChange={(e) => setForm({ ...form, default_calendar_link: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Default deck link</Label>
                  <Input value={form.default_deck_link || ""} onChange={(e) => setForm({ ...form, default_deck_link: e.target.value })} />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.auto_send_simple_affirmative}
                    onCheckedChange={(v) => setForm({ ...form, auto_send_simple_affirmative: v })}
                  />
                  <Label>Auto-send simple affirmative replies</Label>
                </div>
                <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="integrations">
          {form && (
            <Card>
              <CardHeader>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>API endpoints and provider config</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Instantly API base URL</Label>
                  <Input value={form.instantly_api_base_url || ""} onChange={(e) => setForm({ ...form, instantly_api_base_url: e.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground">
                  API keys are stored as Supabase secrets and accessed server-side only.
                </p>
                <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="slack">
          {form && (
            <Card>
              <CardHeader>
                <CardTitle>Slack digests</CardTitle>
                <CardDescription>Scheduled summary notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Slack channel ID</Label>
                  <Input value={form.slack_channel_id || ""} onChange={(e) => setForm({ ...form, slack_channel_id: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const { error } = await supabase.functions.invoke("send-slack-digest", { body: { test: true } });
                      if (error) toast({ title: "Failed", description: String(error), variant: "destructive" });
                      else toast({ title: "Test digest sent" });
                    }}
                  >
                    Send test digest
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="campaigns">
          <div className="space-y-4">
            {campaignsLoading ? (
              <Skeleton className="h-40" />
            ) : (
              campaigns?.map((c: any) => (
                <Card key={c.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.description}</p>
                      </div>
                      <Badge variant={c.active ? "default" : "secondary"} className={c.active ? "bg-success/15 text-success border-success/30" : ""}>
                        {c.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="bulk">
          <BulkActionsPanel />
        </TabsContent>

        <TabsContent value="logs">
          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 mb-4">
              <p className="text-xs text-primary font-medium">
                Recent email sending attempts via Instantly API. Expand rows to see detailed request/response payloads for debugging.
              </p>
            </div>
            <SendLogsPanel />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PromptTemplateCard({ template, onSave }: { template: any; onSave: (t: any) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(template);

  useEffect(() => setLocal(template), [template]);

  return (
    <Card>
      <CardContent className="py-4">
        {!editing ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{local.name}</p>
                {local.active ? (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]">
                    <CheckCircle className="w-3 h-3 mr-0.5" /> Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    <XCircle className="w-3 h-3 mr-0.5" /> Inactive
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Type: <strong>{local.template_type}</strong></span>
              <span>Model: <strong>{local.model_name || "default"}</strong></span>
              {local.updated_at && (
                <span>Updated: {format(new Date(local.updated_at), "MMM d, h:mm a")}</span>
              )}
            </div>
            {local.system_prompt && (
              <p className="text-xs text-muted-foreground mt-2 truncate max-w-full">
                System: {local.system_prompt.slice(0, 100)}...
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{local.name}</p>
              <div className="flex items-center gap-2">
                <Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Model</Label>
              <Input value={local.model_name || ""} onChange={(e) => setLocal({ ...local, model_name: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">System prompt</Label>
              <Textarea value={local.system_prompt || ""} onChange={(e) => setLocal({ ...local, system_prompt: e.target.value })} className="min-h-[100px] text-xs font-mono" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">User prompt</Label>
              <Textarea value={local.user_prompt || ""} onChange={(e) => setLocal({ ...local, user_prompt: e.target.value })} className="min-h-[120px] text-xs font-mono" />
              <p className="text-[10px] text-muted-foreground">
                Available variables: {"{{reply_text}}"}, {"{{lead_email}}"}, {"{{temperature}}"}, {"{{wants_pdf}}"}, {"{{calendar_link}}"}, {"{{deck_link}}"}, {"{{previous_draft}}"}, {"{{feedback}}"}, {"{{thread_history}}"}, {"{{deck_already_shared}}"}, {"{{thread_length}}"}, {"{{mode}}"}, {"{{mode_guidance}}"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onSave(local); setEditing(false); }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setLocal(template); setEditing(false); }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BulkActionsPanel() {
  const { toast } = useToast();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenCount, setRegenCount] = useState(0);

  const handleRegenerateAll = async () => {
    setIsRegenerating(true);
    setRegenCount(0);
    try {
      // Get all awaiting_review / regenerated replies that have drafts
      const { data: replies, error } = await supabase
        .from("inbound_replies")
        .select("id")
        .in("status", ["awaiting_review", "regenerated"])
        .is("archived_at", null);
      if (error) throw error;
      if (!replies?.length) {
        toast({ title: "No pending drafts to regenerate" });
        setIsRegenerating(false);
        return;
      }

      let count = 0;
      for (const reply of replies) {
        try {
          await supabase.functions.invoke("generate-draft", {
            body: { reply_id: reply.id },
          });
          count++;
          setRegenCount(count);
        } catch {
          // continue with next
        }
      }
      toast({ title: `Regenerated ${count} drafts with updated prompt` });
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
    setIsRegenerating(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Regenerate drafts</CardTitle>
          <CardDescription>
            Re-generate all pending drafts using the current prompt. Useful after updating prompt templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              This will regenerate drafts for all replies currently in "Awaiting review" or "Regenerated" status.
              Existing drafts will be preserved as previous versions.
            </p>
          </div>
          <Button
            onClick={handleRegenerateAll}
            disabled={isRegenerating}
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isRegenerating ? "animate-spin" : ""}`} />
            {isRegenerating ? `Regenerating... (${regenCount})` : "Regenerate all pending drafts"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
