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
      session_students: {
        Row: {
          id: string
          joined_at: string
          session_id: string
          student_name: string
        }
        Insert: {
          id?: string
          joined_at?: string
          session_id: string
          student_name: string
        }
        Update: {
          id?: string
          joined_at?: string
          session_id?: string
          student_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_students_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          code: string
          created_at: string
          ended_at: string | null
          grade_band: string
          id: string
          status: string
          teacher_id: string
        }
        Insert: {
          code: string
          created_at?: string
          ended_at?: string | null
          grade_band?: string
          id?: string
          status?: string
          teacher_id: string
        }
        Update: {
          code?: string
          created_at?: string
          ended_at?: string | null
          grade_band?: string
          id?: string
          status?: string
          teacher_id?: string
        }
        Relationships: []
      }
      student_badges: {
        Row: {
          badge_icon: string
          badge_id: string
          badge_name: string
          earned_at: string
          id: string
          student_name: string
          teacher_id: string
        }
        Insert: {
          badge_icon: string
          badge_id: string
          badge_name: string
          earned_at?: string
          id?: string
          student_name: string
          teacher_id: string
        }
        Update: {
          badge_icon?: string
          badge_id?: string
          badge_name?: string
          earned_at?: string
          id?: string
          student_name?: string
          teacher_id?: string
        }
        Relationships: []
      }
      student_content_history: {
        Row: {
          activity_formats: string[]
          challenge_type: string | null
          created_at: string
          grade_band: string
          id: string
          is_baseline: boolean
          key_vocabulary: string[]
          session_date: string
          session_id: string | null
          student_name: string
          teacher_id: string
          theme: string
          topic: string
          vocabulary_results: Json
        }
        Insert: {
          activity_formats?: string[]
          challenge_type?: string | null
          created_at?: string
          grade_band?: string
          id?: string
          is_baseline?: boolean
          key_vocabulary?: string[]
          session_date?: string
          session_id?: string | null
          student_name: string
          teacher_id: string
          theme: string
          topic: string
          vocabulary_results?: Json
        }
        Update: {
          activity_formats?: string[]
          challenge_type?: string | null
          created_at?: string
          grade_band?: string
          id?: string
          is_baseline?: boolean
          key_vocabulary?: string[]
          session_date?: string
          session_id?: string | null
          student_name?: string
          teacher_id?: string
          theme?: string
          topic?: string
          vocabulary_results?: Json
        }
        Relationships: [
          {
            foreignKeyName: "student_content_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      student_points: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_session_date: string | null
          sessions_completed: number
          student_name: string
          teacher_id: string
          total_points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_session_date?: string | null
          sessions_completed?: number
          student_name: string
          teacher_id: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_session_date?: string | null
          sessions_completed?: number
          student_name?: string
          teacher_id?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: []
      }
      student_responses: {
        Row: {
          correct_answer: string
          created_at: string
          domain: string
          grade_band: string
          id: string
          is_correct: boolean
          question: string
          session_id: string
          session_part: string
          strategy: string | null
          student_answer: string
          student_id: string
          wida_level: string
        }
        Insert: {
          correct_answer: string
          created_at?: string
          domain: string
          grade_band?: string
          id?: string
          is_correct?: boolean
          question: string
          session_id: string
          session_part?: string
          strategy?: string | null
          student_answer: string
          student_id: string
          wida_level?: string
        }
        Update: {
          correct_answer?: string
          created_at?: string
          domain?: string
          grade_band?: string
          id?: string
          is_correct?: boolean
          question?: string
          session_id?: string
          session_part?: string
          strategy?: string | null
          student_answer?: string
          student_id?: string
          wida_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "session_students"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_preferences: {
        Row: {
          created_at: string
          id: string
          teacher_id: string
          updated_at: string
          weekly_email_opt_out: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          teacher_id: string
          updated_at?: string
          weekly_email_opt_out?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          teacher_id?: string
          updated_at?: string
          weekly_email_opt_out?: boolean
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
