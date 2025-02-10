export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Booking = Database['public']['Tables']['bookings']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          line_id: string | null
          display_name: string | null
          picture_url: string | null
          provider: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          line_id?: string | null
          display_name?: string | null
          picture_url?: string | null
          provider?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          line_id?: string | null
          display_name?: string | null
          picture_url?: string | null
          provider?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      bookings: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string
          phone_number: string
          date: string
          start_time: string
          duration: number
          number_of_people: number
          bay: string | null
          status: 'confirmed' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          email: string
          phone_number: string
          date: string
          start_time: string
          duration: number
          number_of_people: number
          bay?: string | null
          status?: 'confirmed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          email?: string
          phone_number?: string
          date?: string
          start_time?: string
          duration?: number
          number_of_people?: number
          bay?: string | null
          status?: 'confirmed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
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
  }
} 