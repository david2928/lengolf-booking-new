export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Booking = Database['public']['Tables']['bookings']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type CrmCustomerMapping = Database['public']['Tables']['crm_customer_mapping']['Row'];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          line_id: string | null
          display_name: string | null
          name: string | null
          email: string | null
          phone_number: string | null
          picture_url: string | null
          provider: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          line_id?: string | null
          display_name?: string | null
          name?: string | null
          email?: string | null
          phone_number?: string | null
          picture_url?: string | null
          provider?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          line_id?: string | null
          display_name?: string | null
          name?: string | null
          email?: string | null
          phone_number?: string | null
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
          calendar_events: Json | null
          customer_notes?: string | null
          booking_type?: string | null
          package_name?: string | null
          stable_hash_id?: string | null
          language?: string | null
          google_calendar_sync_status?: string | null
          updated_by_type?: string | null
          updated_by_identifier?: string | null
          cancelled_by_type?: string | null
          cancelled_by_identifier?: string | null
          cancellation_reason?: string | null
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
          calendar_events?: Json | null
          customer_notes?: string | null
          booking_type?: string | null
          package_name?: string | null
          stable_hash_id?: string | null
          language?: string | null
          google_calendar_sync_status?: string | null
          updated_by_type?: string | null
          updated_by_identifier?: string | null
          cancelled_by_type?: string | null
          cancelled_by_identifier?: string | null
          cancellation_reason?: string | null
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
          calendar_events?: Json | null
          customer_notes?: string | null
          booking_type?: string | null
          package_name?: string | null
          stable_hash_id?: string | null
          language?: string | null
          google_calendar_sync_status?: string | null
          updated_by_type?: string | null
          updated_by_identifier?: string | null
          cancelled_by_type?: string | null
          cancelled_by_identifier?: string | null
          cancellation_reason?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      crm_customer_mapping: {
        Row: {
          id: string
          profile_id: string
          crm_customer_id: string
          crm_customer_data: Json
          is_matched: boolean
          match_method: 'auto' | 'manual'
          match_confidence: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          crm_customer_id: string
          crm_customer_data?: Json
          is_matched?: boolean
          match_method?: 'auto' | 'manual'
          match_confidence?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          crm_customer_id?: string
          crm_customer_data?: Json
          is_matched?: boolean
          match_method?: 'auto' | 'manual'
          match_confidence?: number
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