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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agent_tasks: {
        Row: {
          agent_name: string
          completed_at: string | null
          created_at: string | null
          document_id: string | null
          error_message: string | null
          id: string
          input_data: Json | null
          output_data: Json | null
          priority: number | null
          process_id: string | null
          started_at: string | null
          status: string | null
          task_type: string
        }
        Insert: {
          agent_name: string
          completed_at?: string | null
          created_at?: string | null
          document_id?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          priority?: number | null
          process_id?: string | null
          started_at?: string | null
          status?: string | null
          task_type: string
        }
        Update: {
          agent_name?: string
          completed_at?: string | null
          created_at?: string | null
          document_id?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          priority?: number | null
          process_id?: string | null
          started_at?: string | null
          status?: string | null
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      document_references: {
        Row: {
          confidence: string | null
          created_at: string | null
          id: string
          reference_type: string
          source_document_id: string
          source_excerpt: string | null
          source_page: number | null
          target_doc_number: string | null
          target_document_id: string | null
          target_url: string | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string | null
          id?: string
          reference_type: string
          source_document_id: string
          source_excerpt?: string | null
          source_page?: number | null
          target_doc_number?: string | null
          target_document_id?: string | null
          target_url?: string | null
        }
        Update: {
          confidence?: string | null
          created_at?: string | null
          id?: string
          reference_type?: string
          source_document_id?: string
          source_excerpt?: string | null
          source_page?: number | null
          target_doc_number?: string | null
          target_document_id?: string | null
          target_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_references_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_references_target_document_id_fkey"
            columns: ["target_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          doc_number: string
          doc_type: string
          external_urls: Json | null
          id: string
          lifecycle_stage: string | null
          metadata: Json | null
          ministry: string | null
          pdf_url: string | null
          processed_at: string | null
          publication_date: string | null
          raw_content: string | null
          search_vector: unknown
          title: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          doc_number: string
          doc_type: string
          external_urls?: Json | null
          id?: string
          lifecycle_stage?: string | null
          metadata?: Json | null
          ministry?: string | null
          pdf_url?: string | null
          processed_at?: string | null
          publication_date?: string | null
          raw_content?: string | null
          search_vector?: unknown
          title: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          doc_number?: string
          doc_type?: string
          external_urls?: Json | null
          id?: string
          lifecycle_stage?: string | null
          metadata?: Json | null
          ministry?: string | null
          pdf_url?: string | null
          processed_at?: string | null
          publication_date?: string | null
          raw_content?: string | null
          search_vector?: unknown
          title?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          created_at: string | null
          entity_type: string
          id: string
          metadata: Json | null
          name: string
          name_lower: string | null
          role: string | null
          source_document_id: string | null
          source_excerpt: string | null
          source_page: number | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          name: string
          name_lower?: string | null
          role?: string | null
          source_document_id?: string | null
          source_excerpt?: string | null
          source_page?: number | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          name?: string
          name_lower?: string | null
          role?: string | null
          source_document_id?: string | null
          source_excerpt?: string | null
          source_page?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      entities_duplicates_backup_20260115: {
        Row: {
          created_at: string | null
          entity_type: string | null
          id: string | null
          metadata: Json | null
          name: string | null
          role: string | null
          source_document_id: string | null
          source_excerpt: string | null
          source_page: number | null
        }
        Insert: {
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          metadata?: Json | null
          name?: string | null
          role?: string | null
          source_document_id?: string | null
          source_excerpt?: string | null
          source_page?: number | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          metadata?: Json | null
          name?: string | null
          role?: string | null
          source_document_id?: string | null
          source_excerpt?: string | null
          source_page?: number | null
        }
        Relationships: []
      }
      entity_name_rules: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          name_lower: string | null
          reason: string | null
          rule_type: string
          source_document_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          name_lower?: string | null
          reason?: string | null
          rule_type: string
          source_document_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          name_lower?: string | null
          reason?: string | null
          rule_type?: string
          source_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_name_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_name_rules_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      process_documents: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          process_id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          process_id: string
          role: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          process_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_documents_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          created_at: string | null
          current_stage: string
          directive_number: string | null
          id: string
          main_document_id: string | null
          ministry: string | null
          process_key: string
          stage_explanation: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_stage?: string
          directive_number?: string | null
          id?: string
          main_document_id?: string | null
          ministry?: string | null
          process_key: string
          stage_explanation?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_stage?: string
          directive_number?: string | null
          id?: string
          main_document_id?: string | null
          ministry?: string | null
          process_key?: string
          stage_explanation?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_processes_main_document"
            columns: ["main_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          organization: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          organization?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          organization?: string | null
        }
        Relationships: []
      }
      relations: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          relation_type: string
          source_document_id: string | null
          source_excerpt: string | null
          source_id: string
          source_page: number | null
          source_type: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          relation_type: string
          source_document_id?: string | null
          source_excerpt?: string | null
          source_id: string
          source_page?: number | null
          source_type: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          relation_type?: string
          source_document_id?: string | null
          source_excerpt?: string | null
          source_id?: string
          source_page?: number | null
          source_type?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "relations_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relations_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      remiss_documents: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          parent_document_id: string
          remiss_deadline: string | null
          remiss_page_url: string
          remissinstanser_pdf_url: string | null
          remissvar_count: number | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          parent_document_id: string
          remiss_deadline?: string | null
          remiss_page_url: string
          remissinstanser_pdf_url?: string | null
          remissvar_count?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          parent_document_id?: string
          remiss_deadline?: string | null
          remiss_page_url?: string
          remissinstanser_pdf_url?: string | null
          remissvar_count?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remiss_documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      remiss_invitees: {
        Row: {
          entity_id: string | null
          id: string
          invited_at: string | null
          metadata: Json | null
          organization_name: string
          remiss_id: string
        }
        Insert: {
          entity_id?: string | null
          id?: string
          invited_at?: string | null
          metadata?: Json | null
          organization_name: string
          remiss_id: string
        }
        Update: {
          entity_id?: string | null
          id?: string
          invited_at?: string | null
          metadata?: Json | null
          organization_name?: string
          remiss_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remiss_invitees_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remiss_invitees_remiss_id_fkey"
            columns: ["remiss_id"]
            isOneToOne: false
            referencedRelation: "remiss_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      remiss_responses: {
        Row: {
          analysis_status: string | null
          analyzed_at: string | null
          created_at: string | null
          document_id: string | null
          entity_id: string | null
          extracted_at: string | null
          extraction_status: string | null
          file_type: string | null
          file_url: string
          filename: string | null
          id: string
          match_confidence: string | null
          metadata: Json | null
          normalized_org_name: string | null
          raw_content: string | null
          remiss_id: string
          responding_organization: string | null
          stance_signals: Json | null
          stance_summary: string | null
          status: string | null
        }
        Insert: {
          analysis_status?: string | null
          analyzed_at?: string | null
          created_at?: string | null
          document_id?: string | null
          entity_id?: string | null
          extracted_at?: string | null
          extraction_status?: string | null
          file_type?: string | null
          file_url: string
          filename?: string | null
          id?: string
          match_confidence?: string | null
          metadata?: Json | null
          normalized_org_name?: string | null
          raw_content?: string | null
          remiss_id: string
          responding_organization?: string | null
          stance_signals?: Json | null
          stance_summary?: string | null
          status?: string | null
        }
        Update: {
          analysis_status?: string | null
          analyzed_at?: string | null
          created_at?: string | null
          document_id?: string | null
          entity_id?: string | null
          extracted_at?: string | null
          extraction_status?: string | null
          file_type?: string | null
          file_url?: string
          filename?: string | null
          id?: string
          match_confidence?: string | null
          metadata?: Json | null
          normalized_org_name?: string | null
          raw_content?: string | null
          remiss_id?: string
          responding_organization?: string | null
          stance_signals?: Json | null
          stance_summary?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remiss_responses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remiss_responses_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remiss_responses_remiss_id_fkey"
            columns: ["remiss_id"]
            isOneToOne: false
            referencedRelation: "remiss_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actors: Json | null
          created_at: string | null
          description: string | null
          event_date: string
          event_type: string
          id: string
          metadata: Json | null
          process_id: string
          source_excerpt: string | null
          source_page: number | null
          source_url: string | null
        }
        Insert: {
          actors?: Json | null
          created_at?: string | null
          description?: string | null
          event_date: string
          event_type: string
          id?: string
          metadata?: Json | null
          process_id: string
          source_excerpt?: string | null
          source_page?: number | null
          source_url?: string | null
        }
        Update: {
          actors?: Json | null
          created_at?: string | null
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          process_id?: string
          source_excerpt?: string | null
          source_page?: number | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
