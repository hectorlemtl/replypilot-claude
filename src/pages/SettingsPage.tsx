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
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Save, Plus, Pencil } from "lucide-react";

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

  // Settings form state
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

      <Tabs defaultValue="workspace">
        <TabsList className="mb-6">
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="slack">Slack digests</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

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
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.slack_enabled}
                    onCheckedChange={(v) => setForm({ ...form, slack_enabled: v })}
                  />
                  <Label>Enable Slack digests</Label>
                </div>
                <div className="space-y-2">
                  <Label>Slack channel ID</Label>
                  <Input value={form.slack_channel_id || ""} onChange={(e) => setForm({ ...form, slack_channel_id: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={form.digest_timezone || ""} onChange={(e) => setForm({ ...form, digest_timezone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Digest times (JSON array)</Label>
                  <Input
                    value={JSON.stringify(form.digest_times)}
                    onChange={(e) => {
                      try {
                        setForm({ ...form, digest_times: JSON.parse(e.target.value) });
                      } catch {}
                    }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.always_send_digest}
                    onCheckedChange={(v) => setForm({ ...form, always_send_digest: v })}
                  />
                  <Label>Send digest even with zero activity</Label>
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

        <TabsContent value="prompts">
          <div className="space-y-4">
            {templatesLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)
            ) : (
              templates?.map((t: any) => (
                <PromptTemplateCard key={t.id} template={t} onSave={(updated) => saveTemplateMutation.mutate(updated)} />
              ))
            )}
          </div>
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
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${c.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {c.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
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

  if (!editing) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-medium">{local.name}</p>
              <p className="text-xs text-muted-foreground">Type: {local.template_type} · Model: {local.model_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${local.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                {local.active ? "Active" : "Inactive"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">{local.name}</p>
          <div className="flex items-center gap-2">
            <Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} />
            <Label className="text-xs">Active</Label>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Model</Label>
          <Input value={local.model_name || ""} onChange={(e) => setLocal({ ...local, model_name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>System prompt</Label>
          <Textarea value={local.system_prompt || ""} onChange={(e) => setLocal({ ...local, system_prompt: e.target.value })} className="min-h-[100px] text-xs font-mono" />
        </div>
        <div className="space-y-2">
          <Label>User prompt</Label>
          <Textarea value={local.user_prompt || ""} onChange={(e) => setLocal({ ...local, user_prompt: e.target.value })} className="min-h-[120px] text-xs font-mono" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { onSave(local); setEditing(false); }}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setLocal(template); setEditing(false); }}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
