
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  deck_link TEXT,
  calendar_link TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. inbound_replies
CREATE TABLE public.inbound_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instantly_email_id TEXT UNIQUE NOT NULL,
  instantly_unibox_url TEXT,
  lead_email TEXT NOT NULL,
  lead_name TEXT,
  email_account TEXT,
  reply_subject TEXT,
  reply_text TEXT,
  reply_html TEXT,
  raw_payload JSONB,
  is_first_reply BOOLEAN DEFAULT false,
  received_at TIMESTAMPTZ DEFAULT now(),
  campaign_id UUID REFERENCES public.campaigns(id),
  status TEXT NOT NULL DEFAULT 'received',
  temperature TEXT,
  reasoning TEXT,
  wants_pdf BOOLEAN,
  simple_affirmative BOOLEAN,
  sentiment TEXT,
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_inbound_replies_status ON public.inbound_replies(status);
CREATE INDEX idx_inbound_replies_temperature ON public.inbound_replies(temperature);
CREATE INDEX idx_inbound_replies_received_at ON public.inbound_replies(received_at);
CREATE INDEX idx_inbound_replies_lead_email ON public.inbound_replies(lead_email);

CREATE TRIGGER update_inbound_replies_updated_at
  BEFORE UPDATE ON public.inbound_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. draft_versions
CREATE TABLE public.draft_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id UUID NOT NULL REFERENCES public.inbound_replies(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  draft_text TEXT NOT NULL,
  draft_html TEXT,
  created_by TEXT NOT NULL DEFAULT 'ai',
  feedback_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_draft_versions_reply_id ON public.draft_versions(reply_id);

-- 4. approval_actions
CREATE TABLE public.approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id UUID NOT NULL REFERENCES public.inbound_replies(id) ON DELETE CASCADE,
  draft_version_id UUID REFERENCES public.draft_versions(id),
  action TEXT NOT NULL,
  feedback TEXT,
  acted_by TEXT,
  acted_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approval_actions_reply_id ON public.approval_actions(reply_id);

-- 5. send_attempts
CREATE TABLE public.send_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id UUID NOT NULL REFERENCES public.inbound_replies(id) ON DELETE CASCADE,
  draft_version_id UUID REFERENCES public.draft_versions(id),
  provider TEXT NOT NULL DEFAULT 'instantly',
  provider_message_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status_code INTEGER,
  success BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_send_attempts_reply_id ON public.send_attempts(reply_id);

-- 6. app_settings
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_name TEXT DEFAULT 'ReplyPilot',
  instantly_api_base_url TEXT DEFAULT 'https://api.instantly.ai/api/v1',
  default_calendar_link TEXT,
  default_deck_link TEXT,
  slack_enabled BOOLEAN DEFAULT true,
  slack_bot_token TEXT,
  slack_channel_id TEXT,
  digest_timezone TEXT DEFAULT 'America/Montreal',
  digest_times JSONB DEFAULT '["10:00","14:00","17:00"]'::jsonb,
  auto_send_simple_affirmative BOOLEAN DEFAULT true,
  always_send_digest BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. prompt_templates
CREATE TABLE public.prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_type TEXT NOT NULL,
  system_prompt TEXT,
  user_prompt TEXT,
  model_name TEXT DEFAULT 'google/gemini-3-flash-preview',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_prompt_templates_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. audit_logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id UUID REFERENCES public.inbound_replies(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_reply_id ON public.audit_logs(reply_id);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);

-- Disable RLS for v1 (internal tool)
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Open policies for v1 (no auth restriction)
CREATE POLICY "Allow all access" ON public.campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.inbound_replies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.draft_versions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.approval_actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.send_attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.prompt_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
