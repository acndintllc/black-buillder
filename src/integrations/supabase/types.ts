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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      outputs: {
        Row: {
          agent: Database["public"]["Enums"]["agent_type"] | null
          content: string | null
          created_at: string
          id: string
          name: string
          run_id: string
          type: string
          url: string | null
        }
        Insert: {
          agent?: Database["public"]["Enums"]["agent_type"] | null
          content?: string | null
          created_at?: string
          id?: string
          name: string
          run_id: string
          type: string
          url?: string | null
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_type"] | null
          content?: string | null
          created_at?: string
          id?: string
          name?: string
          run_id?: string
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          target_repo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          target_repo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          target_repo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      run_logs: {
        Row: {
          id: string
          level: string
          message: string
          run_id: string
          stage_id: string | null
          ts: string
        }
        Insert: {
          id?: string
          level?: string
          message: string
          run_id: string
          stage_id?: string | null
          ts?: string
        }
        Update: {
          id?: string
          level?: string
          message?: string
          run_id?: string
          stage_id?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_logs_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "run_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      run_stages: {
        Row: {
          agent: Database["public"]["Enums"]["agent_type"]
          attempt: number
          branch: string | null
          created_at: string
          ended_at: string | null
          id: string
          run_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          agent: Database["public"]["Enums"]["agent_type"]
          attempt?: number
          branch?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          run_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_type"]
          attempt?: number
          branch?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          run_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_stages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          aab_path: string | null
          cost_usd: number | null
          created_at: string
          current_stage: Database["public"]["Enums"]["agent_type"] | null
          finished_at: string | null
          id: string
          project_id: string | null
          prompt: string
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          updated_at: string
          user_id: string
          web_url: string | null
        }
        Insert: {
          aab_path?: string | null
          cost_usd?: number | null
          created_at?: string
          current_stage?: Database["public"]["Enums"]["agent_type"] | null
          finished_at?: string | null
          id?: string
          project_id?: string | null
          prompt: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          updated_at?: string
          user_id: string
          web_url?: string | null
        }
        Update: {
          aab_path?: string | null
          cost_usd?: number | null
          created_at?: string
          current_stage?: Database["public"]["Enums"]["agent_type"] | null
          finished_at?: string | null
          id?: string
          project_id?: string | null
          prompt?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          updated_at?: string
          user_id?: string
          web_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      agent_type:
        | "planner"
        | "scavenger"
        | "builder"
        | "stitcher"
        | "fixer"
        | "publisher"
        | "wrapper"
      run_status: "pending" | "running" | "passed" | "failed" | "escalated"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      agent_type: [
        "planner",
        "scavenger",
        "builder",
        "stitcher",
        "fixer",
        "publisher",
        "wrapper",
      ],
      run_status: ["pending", "running", "passed", "failed", "escalated"],
    },
  },
} as const
