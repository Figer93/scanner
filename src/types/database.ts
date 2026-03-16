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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ch_cache: {
        Row: {
          address: string | null
          company_name: string
          company_number: string
          date_of_creation: string | null
          postcode: string | null
          raw_json: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name: string
          company_number: string
          date_of_creation?: string | null
          postcode?: string | null
          raw_json?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string
          company_number?: string
          date_of_creation?: string | null
          postcode?: string | null
          raw_json?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          body: string | null
          brevo_message_id: string | null
          direction: string | null
          from_email: string | null
          id: number
          lead_id: number
          sent_at: string
          status: string | null
          subject: string | null
          template_id: number | null
          to_email: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          brevo_message_id?: string | null
          direction?: string | null
          from_email?: string | null
          id?: number
          lead_id: number
          sent_at?: string
          status?: string | null
          subject?: string | null
          template_id?: number | null
          to_email?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          brevo_message_id?: string | null
          direction?: string | null
          from_email?: string | null
          id?: number
          lead_id?: number
          sent_at?: string
          status?: string | null
          subject?: string | null
          template_id?: number | null
          to_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          id: number
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: number
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: number
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          content: string | null
          created_at: string
          id: number
          lead_id: number
          type: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: number
          lead_id: number
          type: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: number
          lead_id?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          assigned_to: string | null
          company_name: string
          company_number: string
          contact_form: number | null
          created_at: string
          date_of_creation: string | null
          emails: string | null
          enrichment_status: string | null
          ice_breaker: string | null
          id: number
          linkedin_url: string | null
          outreach_draft: string | null
          phones: string | null
          postcode: string | null
          predicted_email: string | null
          score: number | null
          score_breakdown: string | null
          score_reasoning: string | null
          source: string | null
          source_metadata: string | null
          status: string
          updated_at: string
          website: string | null
          website_services: string | null
          website_size: string | null
          website_tech: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          company_name: string
          company_number: string
          contact_form?: number | null
          created_at?: string
          date_of_creation?: string | null
          emails?: string | null
          enrichment_status?: string | null
          ice_breaker?: string | null
          id?: number
          linkedin_url?: string | null
          outreach_draft?: string | null
          phones?: string | null
          postcode?: string | null
          predicted_email?: string | null
          score?: number | null
          score_breakdown?: string | null
          score_reasoning?: string | null
          source?: string | null
          source_metadata?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          website_services?: string | null
          website_size?: string | null
          website_tech?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          company_name?: string
          company_number?: string
          contact_form?: number | null
          created_at?: string
          date_of_creation?: string | null
          emails?: string | null
          enrichment_status?: string | null
          ice_breaker?: string | null
          id?: number
          linkedin_url?: string | null
          outreach_draft?: string | null
          phones?: string | null
          postcode?: string | null
          predicted_email?: string | null
          score?: number | null
          score_breakdown?: string | null
          score_reasoning?: string | null
          source?: string | null
          source_metadata?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          website_services?: string | null
          website_size?: string | null
          website_tech?: string | null
        }
        Relationships: []
      }
      list_lead: {
        Row: {
          added_at: string
          id: number
          lead_id: number
          list_id: number
        }
        Insert: {
          added_at?: string
          id?: number
          lead_id: number
          list_id: number
        }
        Update: {
          added_at?: string
          id?: number
          lead_id?: number
          list_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "list_lead_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_lead_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          description: string | null
          id: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value?: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      sequence_enrolments: {
        Row: {
          current_step: number | null
          enrolled_at: string | null
          id: number
          lead_id: number
          next_send_at: string | null
          sequence_id: number
          status: string | null
        }
        Insert: {
          current_step?: number | null
          enrolled_at?: string | null
          id?: number
          lead_id: number
          next_send_at?: string | null
          sequence_id: number
          status?: string | null
        }
        Update: {
          current_step?: number | null
          enrolled_at?: string | null
          id?: number
          lead_id?: number
          next_send_at?: string | null
          sequence_id?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrolments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrolments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          condition: string
          delay_days: number
          id: number
          sequence_id: number
          step_number: number
          template_id: number
        }
        Insert: {
          condition: string
          delay_days: number
          id?: number
          sequence_id: number
          step_number: number
          template_id: number
        }
        Update: {
          condition?: string
          delay_days?: number
          id?: number
          sequence_id?: number
          step_number?: number
          template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      usage_log: {
        Row: {
          called_at: string
          endpoint: string | null
          estimated_cost_gbp: number | null
          id: number
          input_tokens: number | null
          output_tokens: number | null
          request_count: number | null
          service: string
        }
        Insert: {
          called_at?: string
          endpoint?: string | null
          estimated_cost_gbp?: number | null
          id?: number
          input_tokens?: number | null
          output_tokens?: number | null
          request_count?: number | null
          service: string
        }
        Update: {
          called_at?: string
          endpoint?: string | null
          estimated_cost_gbp?: number | null
          id?: number
          input_tokens?: number | null
          output_tokens?: number | null
          request_count?: number | null
          service?: string
        }
        Relationships: []
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
