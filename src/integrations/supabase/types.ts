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
      beta_slots: {
        Row: {
          id: number
          slots_total: number
          slots_used: number
        }
        Insert: {
          id?: number
          slots_total?: number
          slots_used?: number
        }
        Update: {
          id?: number
          slots_total?: number
          slots_used?: number
        }
        Relationships: []
      }
      content_bank: {
        Row: {
          anchor: Json
          created_at: string
          grade: string
          id: string
          last_used_at: string | null
          part2_activities: Json
          part3_challenge: Json | null
          theme: string
          topic: string
          used_count: number
        }
        Insert: {
          anchor: Json
          created_at?: string
          grade: string
          id?: string
          last_used_at?: string | null
          part2_activities: Json
          part3_challenge?: Json | null
          theme: string
          topic: string
          used_count?: number
        }
        Update: {
          anchor?: Json
          created_at?: string
          grade?: string
          id?: string
          last_used_at?: string | null
          part2_activities?: Json
          part3_challenge?: Json | null
          theme?: string
          topic?: string
          used_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          check_in_sent: boolean
          created_at: string
          full_name: string | null
          grade_band: string | null
          id: string
          onboarding_complete: boolean
          updated_at: string
        }
        Insert: {
          check_in_sent?: boolean
          created_at?: string
          full_name?: string | null
          grade_band?: string | null
          id: string
          onboarding_complete?: boolean
          updated_at?: string
        }
        Update: {
          check_in_sent?: boolean
          created_at?: string
          full_name?: string | null
          grade_band?: string | null
          id?: string
          onboarding_complete?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      session_students: {
        Row: {
          grade_level: string | null
          id: string
          joined_at: string
          session_id: string
          student_name: string
          theme: string | null
        }
        Insert: {
          grade_level?: string | null
          id?: string
          joined_at?: string
          session_id: string
          student_name: string
          theme?: string | null
        }
        Update: {
          grade_level?: string | null
          id?: string
          joined_at?: string
          session_id?: string
          student_name?: string
          theme?: string | null
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
          theme: string | null
          theme_options: string[] | null
        }
        Insert: {
          code: string
          created_at?: string
          ended_at?: string | null
          grade_band?: string
          id?: string
          status?: string
          teacher_id: string
          theme?: string | null
          theme_options?: string[] | null
        }
        Update: {
          code?: string
          created_at?: string
          ended_at?: string | null
          grade_band?: string
          id?: string
          status?: string
          teacher_id?: string
          theme?: string | null
          theme_options?: string[] | null
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
          consecutive_tier_drops: number
          created_at: string
          current_streak: number
          id: string
          last_domain_scores: Json | null
          last_grade_band: string | null
          last_session_date: string | null
          last_session_score: number | null
          last_session_total: number | null
          sentence_frame_tier: number
          sessions_completed: number
          student_name: string
          teacher_id: string
          total_points: number
          updated_at: string
        }
        Insert: {
          consecutive_tier_drops?: number
          created_at?: string
          current_streak?: number
          id?: string
          last_domain_scores?: Json | null
          last_grade_band?: string | null
          last_session_date?: string | null
          last_session_score?: number | null
          last_session_total?: number | null
          sentence_frame_tier?: number
          sessions_completed?: number
          student_name: string
          teacher_id: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          consecutive_tier_drops?: number
          created_at?: string
          current_streak?: number
          id?: string
          last_domain_scores?: Json | null
          last_grade_band?: string | null
          last_session_date?: string | null
          last_session_score?: number | null
          last_session_total?: number | null
          sentence_frame_tier?: number
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
          speaking_duration_seconds: number | null
          speaking_full_attempt: boolean | null
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
          speaking_duration_seconds?: number | null
          speaking_full_attempt?: boolean | null
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
          speaking_duration_seconds?: number | null
          speaking_full_attempt?: boolean | null
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
      student_tier_history: {
        Row: {
          id: string
          recorded_at: string
          session_id: string | null
          student_name: string
          teacher_id: string
          tier: number
        }
        Insert: {
          id?: string
          recorded_at?: string
          session_id?: string | null
          student_name: string
          teacher_id: string
          tier?: number
        }
        Update: {
          id?: string
          recorded_at?: string
          session_id?: string | null
          student_name?: string
          teacher_id?: string
          tier?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_tier_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          plan: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          plan?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          plan?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_teacher_account: {
        Args: { p_full_name?: string; p_user_id: string }
        Returns: undefined
      }
      get_cached_session: {
        Args: { p_grade: string; p_theme: string }
        Returns: {
          anchor: Json
          created_at: string
          grade: string
          id: string
          last_used_at: string | null
          part2_activities: Json
          part3_challenge: Json | null
          theme: string
          topic: string
          used_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "content_bank"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_session_used: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "teacher"
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
      app_role: ["teacher"],
    },
  },
} as const
