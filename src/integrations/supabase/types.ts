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
      artifacts: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["artifact_kind"]
          run_id: string
          storage_path: string
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["artifact_kind"]
          run_id: string
          storage_path: string
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["artifact_kind"]
          run_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      run_logs: {
        Row: {
          id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          run_id: string
          stage_id: string | null
          ts: string | null
        }
        Insert: {
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message: string
          run_id: string
          stage_id?: string | null
          ts?: string | null
        }
        Update: {
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          run_id?: string
          stage_id?: string | null
          ts?: string | null
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
          attempt: number | null
          branch: string | null
          ended_at: string | null
          id: string
          run_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["stage_status"]
          summary: string | null
        }
        Insert: {
          agent: Database["public"]["Enums"]["agent_type"]
          attempt?: number | null
          branch?: string | null
          ended_at?: string | null
          id?: string
          run_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          summary?: string | null
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_type"]
          attempt?: number | null
          branch?: string | null
          ended_at?: string | null
          id?: string
          run_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          summary?: string | null
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
          created_at: string | null
          current_stage: Database["public"]["Enums"]["agent_type"] | null
          finished_at: string | null
          id: string
          input_repo_url: string | null
          prompt: string
          status: Database["public"]["Enums"]["run_status"]
          user_id: string
          web_url: string | null
        }
        Insert: {
          aab_path?: string | null
          cost_usd?: number | null
          created_at?: string | null
          current_stage?: Database["public"]["Enums"]["agent_type"] | null
          finished_at?: string | null
          id?: string
          input_repo_url?: string | null
          prompt: string
          status?: Database["public"]["Enums"]["run_status"]
          user_id: string
          web_url?: string | null
        }
        Update: {
          aab_path?: string | null
          cost_usd?: number | null
          created_at?: string | null
          current_stage?: Database["public"]["Enums"]["agent_type"] | null
          finished_at?: string | null
          id?: string
          input_repo_url?: string | null
          prompt?: string
          status?: Database["public"]["Enums"]["run_status"]
          user_id?: string
          web_url?: string | null
        }
        Relationships: []
      }
      sources: {
        Row: {
          commit_sha: string | null
          decision: Database["public"]["Enums"]["decision_type"]
          function_key: string
          id: string
          license_spdx: string | null
          reason: string | null
          ref: string | null
          run_id: string
          source_type: Database["public"]["Enums"]["source_type"]
        }
        Insert: {
          commit_sha?: string | null
          decision: Database["public"]["Enums"]["decision_type"]
          function_key: string
          id?: string
          license_spdx?: string | null
          reason?: string | null
          ref?: string | null
          run_id: string
          source_type: Database["public"]["Enums"]["source_type"]
        }
        Update: {
          commit_sha?: string | null
          decision?: Database["public"]["Enums"]["decision_type"]
          function_key?: string
          id?: string
          license_spdx?: string | null
          reason?: string | null
          ref?: string | null
          run_id?: string
          source_type?: Database["public"]["Enums"]["source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "sources_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
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
      artifact_kind:
        | "spec"
        | "manifest"
        | "tests"
        | "notices"
        | "report"
        | "aab"
      decision_type: "accepted" | "rejected"
      log_level: "info" | "warn" | "error"
      run_status: "pending" | "running" | "passed" | "failed"
      source_type: "base" | "registry" | "npm" | "repo" | "scratch"
      stage_status: "pending" | "running" | "passed" | "failed" | "escalated"
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
      artifact_kind: ["spec", "manifest", "tests", "notices", "report", "aab"],
      decision_type: ["accepted", "rejected"],
      log_level: ["info", "warn", "error"],
      run_status: ["pending", "running", "passed", "failed"],
      source_type: ["base", "registry", "npm", "repo", "scratch"],
      stage_status: ["pending", "running", "passed", "failed", "escalated"],
    },
  },
} as const
