export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          always_send_digest: boolean | null
          auto_send_simple_affirmative: boolean | null
          created_at: string | null
          default_calendar_link: string | null
          default_deck_link: string | null
          digest_times: Json | null
          digest_timezone: string | null
          id: string
          instantly_api_base_url: string | null
          slack_bot_token: string | null
          slack_channel_id: string | null
          slack_enabled: boolean | null
          updated_at: string | null
          workspace_name: string | null
        }
        Insert: {
          always_send_digest?: boolean | null
          auto_send_simple_affirmative?: boolean | null
          created_at?: string | null
          default_calendar_link?: string | null
          default_deck_link?: string | null
          digest_times?: Json | null
          digest_timezone?: string | null
          id?: string
          instantly_api_base_url?: string | null
          slack_bot_token?: string | null
          slack_channel_id?: string | null
          slack_enabled?: boolean | null
          updated_at?: string | null
          workspace_name?: string | null
        }
        Update: {
          always_send_digest?: boolean | null
          auto_send_simple_affirmative?: boolean | null
          created_at?: string | null
          default_calendar_link?: string | null
          default_deck_link?: string | null
          digest_times?: Json | null
          digest_timezone?: string | null
          id?: string
          instantly_api_base_url?: string | null
          slack_bot_token?: string | null
          slack_channel_id?: string | null
          slack_enabled?: boolean | null
          updated_at?: string | null
          workspace_name?: string | null
        }
        Relationships: []
      }
      approval_actions: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          action: string
          draft_version_id: string | null
          feedback: string | null
          id: string
          reply_id: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          action: string
          draft_version_id?: string | null
          feedback?: string | null
          id?: string
          reply_id: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          action?: string
          draft_version_id?: string | null
          feedback?: string | null
          id?: string
          reply_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "draft_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "inbound_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          created_at: string | null
          event_payload: Json | null
          event_type: string
          id: string
          reply_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_payload?: Json | null
          event_type: string
          id?: string
          reply_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_payload?: Json | null
          event_type?: string
          id?: string
          reply_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "inbound_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean | null
          calendar_link: string | null
          created_at: string | null
          deck_link: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          calendar_link?: string | null
          created_at?: string | null
          deck_link?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          calendar_link?: string | null
          created_at?: string | null
          deck_link?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      draft_versions: {
        Row: {
          created_at: string | null
          created_by: string
          draft_html: string | null
          draft_text: string
          feedback_used: string | null
          id: string
          reply_id: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string
          draft_html?: string | null
          draft_text: string
          feedback_used?: string | null
          id?: string
          reply_id: string
          version_number: number
        }
        Update: {
          created_at?: string | null
          created_by?: string
          draft_html?: string | null
          draft_text?: string
          feedback_used?: string | null
          id?: string
          reply_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_versions_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "inbound_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_replies: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          email_account: string | null
          id: string
          instantly_email_id: string
          instantly_unibox_url: string | null
          is_first_reply: boolean | null
          lead_email: string
          lead_name: string | null
          processing_error: string | null
          raw_payload: Json | null
          reasoning: string | null
          received_at: string | null
          reply_html: string | null
          reply_subject: string | null
          reply_text: string | null
          sentiment: string | null
          simple_affirmative: boolean | null
          status: string
          temperature: string | null
          updated_at: string | null
          wants_pdf: boolean | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          email_account?: string | null
          id?: string
          instantly_email_id: string
          instantly_unibox_url?: string | null
          is_first_reply?: boolean | null
          lead_email: string
          lead_name?: string | null
          processing_error?: string | null
          raw_payload?: Json | null
          reasoning?: string | null
          received_at?: string | null
          reply_html?: string | null
          reply_subject?: string | null
          reply_text?: string | null
          sentiment?: string | null
          simple_affirmative?: boolean | null
          status?: string
          temperature?: string | null
          updated_at?: string | null
          wants_pdf?: boolean | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          email_account?: string | null
          id?: string
          instantly_email_id?: string
          instantly_unibox_url?: string | null
          is_first_reply?: boolean | null
          lead_email?: string
          lead_name?: string | null
          processing_error?: string | null
          raw_payload?: Json | null
          reasoning?: string | null
          received_at?: string | null
          reply_html?: string | null
          reply_subject?: string | null
          reply_text?: string | null
          sentiment?: string | null
          simple_affirmative?: boolean | null
          status?: string
          temperature?: string | null
          updated_at?: string | null
          wants_pdf?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          model_name: string | null
          name: string
          system_prompt: string | null
          template_type: string
          updated_at: string | null
          user_prompt: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          model_name?: string | null
          name: string
          system_prompt?: string | null
          template_type: string
          updated_at?: string | null
          user_prompt?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          model_name?: string | null
          name?: string
          system_prompt?: string | null
          template_type?: string
          updated_at?: string | null
          user_prompt?: string | null
        }
        Relationships: []
      }
      send_attempts: {
        Row: {
          draft_version_id: string | null
          id: string
          provider: string
          provider_message_id: string | null
          reply_id: string
          request_payload: Json | null
          response_payload: Json | null
          sent_at: string | null
          status_code: number | null
          success: boolean | null
        }
        Insert: {
          draft_version_id?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          reply_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string | null
          status_code?: number | null
          success?: boolean | null
        }
        Update: {
          draft_version_id?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          reply_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string | null
          status_code?: number | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "send_attempts_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "draft_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_attempts_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "inbound_replies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
