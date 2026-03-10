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
          auto_send_simple_affirmative: boolean
          created_at: string
          default_calendar_link: string | null
          default_deck_link: string | null
          id: string
          instantly_api_base_url: string
          slack_channel_id: string | null
          updated_at: string
          workspace_name: string
        }
        Insert: {
          auto_send_simple_affirmative?: boolean
          created_at?: string
          default_calendar_link?: string | null
          default_deck_link?: string | null
          id?: string
          instantly_api_base_url?: string
          slack_channel_id?: string | null
          updated_at?: string
          workspace_name?: string
        }
        Update: {
          auto_send_simple_affirmative?: boolean
          created_at?: string
          default_calendar_link?: string | null
          default_deck_link?: string | null
          id?: string
          instantly_api_base_url?: string
          slack_channel_id?: string | null
          updated_at?: string
          workspace_name?: string
        }
        Relationships: []
      }
      approval_actions: {
        Row: {
          acted_at: string
          acted_by: string | null
          action: Database["public"]["Enums"]["approval_action_type"]
          draft_version_id: string | null
          feedback: string | null
          id: string
          reply_id: string
        }
        Insert: {
          acted_at?: string
          acted_by?: string | null
          action: Database["public"]["Enums"]["approval_action_type"]
          draft_version_id?: string | null
          feedback?: string | null
          id?: string
          reply_id: string
        }
        Update: {
          acted_at?: string
          acted_by?: string | null
          action?: Database["public"]["Enums"]["approval_action_type"]
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
          created_at: string
          event_payload: Json
          event_type: string
          id: string
          reply_id: string | null
        }
        Insert: {
          created_at?: string
          event_payload?: Json
          event_type: string
          id?: string
          reply_id?: string | null
        }
        Update: {
          created_at?: string
          event_payload?: Json
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
          active: boolean
          calendar_link: string | null
          created_at: string
          deck_link: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          calendar_link?: string | null
          created_at?: string
          deck_link?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          calendar_link?: string | null
          created_at?: string
          deck_link?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      draft_versions: {
        Row: {
          created_at: string
          created_by: string
          draft_html: string | null
          draft_text: string
          feedback_used: string | null
          id: string
          reply_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          draft_html?: string | null
          draft_text: string
          feedback_used?: string | null
          id?: string
          reply_id: string
          version_number: number
        }
        Update: {
          created_at?: string
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
          created_at: string
          email_account: string | null
          id: string
          instantly_email_id: string
          instantly_unibox_url: string | null
          is_first_reply: boolean
          lead_email: string
          lead_name: string | null
          processing_error: string | null
          raw_payload: Json
          reasoning: string | null
          received_at: string
          reply_html: string | null
          reply_subject: string | null
          reply_text: string | null
          sender_email: string | null
          sender_name: string | null
          sentiment: string | null
          simple_affirmative: boolean | null
          status: Database["public"]["Enums"]["reply_status"]
          temperature: Database["public"]["Enums"]["reply_temperature"] | null
          updated_at: string
          wants_pdf: boolean | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email_account?: string | null
          id?: string
          instantly_email_id: string
          instantly_unibox_url?: string | null
          is_first_reply?: boolean
          lead_email: string
          lead_name?: string | null
          processing_error?: string | null
          raw_payload?: Json
          reasoning?: string | null
          received_at?: string
          reply_html?: string | null
          reply_subject?: string | null
          reply_text?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sentiment?: string | null
          simple_affirmative?: boolean | null
          status?: Database["public"]["Enums"]["reply_status"]
          temperature?: Database["public"]["Enums"]["reply_temperature"] | null
          updated_at?: string
          wants_pdf?: boolean | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email_account?: string | null
          id?: string
          instantly_email_id?: string
          instantly_unibox_url?: string | null
          is_first_reply?: boolean
          lead_email?: string
          lead_name?: string | null
          processing_error?: string | null
          raw_payload?: Json
          reasoning?: string | null
          received_at?: string
          reply_html?: string | null
          reply_subject?: string | null
          reply_text?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sentiment?: string | null
          simple_affirmative?: boolean | null
          status?: Database["public"]["Enums"]["reply_status"]
          temperature?: Database["public"]["Enums"]["reply_temperature"] | null
          updated_at?: string
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
          active: boolean
          created_at: string
          id: string
          model_name: string | null
          name: string
          system_prompt: string | null
          template_type: string
          updated_at: string
          user_prompt: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          model_name?: string | null
          name: string
          system_prompt?: string | null
          template_type: string
          updated_at?: string
          user_prompt?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          model_name?: string | null
          name?: string
          system_prompt?: string | null
          template_type?: string
          updated_at?: string
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
          sent_at: string
          status_code: number | null
          success: boolean
        }
        Insert: {
          draft_version_id?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          reply_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string
          status_code?: number | null
          success?: boolean
        }
        Update: {
          draft_version_id?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          reply_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string
          status_code?: number | null
          success?: boolean
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
      approval_action_type: "approved" | "rejected"
      reply_status:
        | "received"
        | "classified"
        | "skipped"
        | "drafted"
        | "awaiting_review"
        | "approved"
        | "rejected"
        | "regenerated"
        | "sent"
        | "manual_review"
        | "failed"
      reply_temperature: "hot" | "warm" | "simple" | "for_later" | "cold" | "out_of_office"
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
    Enums: {
      approval_action_type: ["approved", "rejected"],
      reply_status: [
        "received",
        "classified",
        "skipped",
        "drafted",
        "awaiting_review",
        "approved",
        "rejected",
        "regenerated",
        "sent",
        "manual_review",
        "failed",
      ],
      reply_temperature: ["hot", "warm", "simple", "for_later", "cold", "out_of_office"],
    },
  },
} as const
