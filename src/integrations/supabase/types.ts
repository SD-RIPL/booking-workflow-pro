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
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          module: string
          new_value: Json | null
          previous_value: Json | null
          remarks: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module: string
          new_value?: Json | null
          previous_value?: Json | null
          remarks?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          new_value?: Json | null
          previous_value?: Json | null
          remarks?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          id: string
          module: string
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          id?: string
          module: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          module?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      booking_stage_history: {
        Row: {
          booking_id: string
          from_stage: string | null
          id: string
          performed_at: string
          performed_by: string | null
          remarks: string | null
          to_stage: string
        }
        Insert: {
          booking_id: string
          from_stage?: string | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          remarks?: string | null
          to_stage: string
        }
        Update: {
          booking_id?: string
          from_stage?: string | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          remarks?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_stage_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          aadhaar_no: string | null
          activation_date: string | null
          activation_notes: string | null
          activation_status: string | null
          address: string | null
          address_line: string | null
          alternate_mobile: string | null
          assigned_executive: string | null
          booking_amount: number | null
          booking_code: string
          booking_date: string | null
          booking_gateway: Database["public"]["Enums"]["booking_gateway"] | null
          booking_gst: number | null
          booking_total: number | null
          booking_txn_id: string | null
          city: string | null
          cod_amount: number | null
          cod_date: string | null
          cod_delivery_charge: number | null
          cod_delivery_received_date: string | null
          cod_delivery_status: string | null
          cod_delivery_txn_id: string | null
          cod_received_on: string | null
          cod_txn_id: string | null
          company_account: string | null
          configuration_date: string | null
          courier_partner: string | null
          courier_tracking: string | null
          created_at: string
          created_by: string | null
          current_stage: Database["public"]["Enums"]["booking_stage"]
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_date: string | null
          dispatch_schedule_date: string | null
          dispatch_status: string | null
          dispatched_at: string | null
          district: string | null
          email: string | null
          father_name: string | null
          full_name: string
          id: string
          kyc_docs_url: string | null
          kyc_mail_status: string | null
          kyc_number: string | null
          kyc_sent_date: string | null
          kyc_type: string | null
          kyc_verification: string | null
          mobile: string
          notes: string | null
          payment_mode: string | null
          pickup_date: string | null
          pincode: string | null
          remarks: string | null
          router_company: string | null
          router_id: string | null
          router_imei_mac: string | null
          router_imei_wavlink: string | null
          router_model_no: string | null
          router_password: string | null
          router_sim_card_no: string | null
          router_sim_no: string | null
          router_ssid: string | null
          sales_employee: string | null
          sd_amount: number | null
          sd_payment_received: number | null
          sd_received_date: string | null
          sd_received_on: Database["public"]["Enums"]["booking_gateway"] | null
          sd_status: string | null
          sd_txn_id: string | null
          sim_activation_status: string | null
          sim_company: string | null
          sim_id: string | null
          sim_packet_no: string | null
          source: string | null
          state: string | null
          updated_at: string
          workflow_stage: string
        }
        Insert: {
          aadhaar_no?: string | null
          activation_date?: string | null
          activation_notes?: string | null
          activation_status?: string | null
          address?: string | null
          address_line?: string | null
          alternate_mobile?: string | null
          assigned_executive?: string | null
          booking_amount?: number | null
          booking_code?: string
          booking_date?: string | null
          booking_gateway?:
            | Database["public"]["Enums"]["booking_gateway"]
            | null
          booking_gst?: number | null
          booking_total?: number | null
          booking_txn_id?: string | null
          city?: string | null
          cod_amount?: number | null
          cod_date?: string | null
          cod_delivery_charge?: number | null
          cod_delivery_received_date?: string | null
          cod_delivery_status?: string | null
          cod_delivery_txn_id?: string | null
          cod_received_on?: string | null
          cod_txn_id?: string | null
          company_account?: string | null
          configuration_date?: string | null
          courier_partner?: string | null
          courier_tracking?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: Database["public"]["Enums"]["booking_stage"]
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_date?: string | null
          dispatch_schedule_date?: string | null
          dispatch_status?: string | null
          dispatched_at?: string | null
          district?: string | null
          email?: string | null
          father_name?: string | null
          full_name: string
          id?: string
          kyc_docs_url?: string | null
          kyc_mail_status?: string | null
          kyc_number?: string | null
          kyc_sent_date?: string | null
          kyc_type?: string | null
          kyc_verification?: string | null
          mobile: string
          notes?: string | null
          payment_mode?: string | null
          pickup_date?: string | null
          pincode?: string | null
          remarks?: string | null
          router_company?: string | null
          router_id?: string | null
          router_imei_mac?: string | null
          router_imei_wavlink?: string | null
          router_model_no?: string | null
          router_password?: string | null
          router_sim_card_no?: string | null
          router_sim_no?: string | null
          router_ssid?: string | null
          sales_employee?: string | null
          sd_amount?: number | null
          sd_payment_received?: number | null
          sd_received_date?: string | null
          sd_received_on?: Database["public"]["Enums"]["booking_gateway"] | null
          sd_status?: string | null
          sd_txn_id?: string | null
          sim_activation_status?: string | null
          sim_company?: string | null
          sim_id?: string | null
          sim_packet_no?: string | null
          source?: string | null
          state?: string | null
          updated_at?: string
          workflow_stage?: string
        }
        Update: {
          aadhaar_no?: string | null
          activation_date?: string | null
          activation_notes?: string | null
          activation_status?: string | null
          address?: string | null
          address_line?: string | null
          alternate_mobile?: string | null
          assigned_executive?: string | null
          booking_amount?: number | null
          booking_code?: string
          booking_date?: string | null
          booking_gateway?:
            | Database["public"]["Enums"]["booking_gateway"]
            | null
          booking_gst?: number | null
          booking_total?: number | null
          booking_txn_id?: string | null
          city?: string | null
          cod_amount?: number | null
          cod_date?: string | null
          cod_delivery_charge?: number | null
          cod_delivery_received_date?: string | null
          cod_delivery_status?: string | null
          cod_delivery_txn_id?: string | null
          cod_received_on?: string | null
          cod_txn_id?: string | null
          company_account?: string | null
          configuration_date?: string | null
          courier_partner?: string | null
          courier_tracking?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: Database["public"]["Enums"]["booking_stage"]
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_date?: string | null
          dispatch_schedule_date?: string | null
          dispatch_status?: string | null
          dispatched_at?: string | null
          district?: string | null
          email?: string | null
          father_name?: string | null
          full_name?: string
          id?: string
          kyc_docs_url?: string | null
          kyc_mail_status?: string | null
          kyc_number?: string | null
          kyc_sent_date?: string | null
          kyc_type?: string | null
          kyc_verification?: string | null
          mobile?: string
          notes?: string | null
          payment_mode?: string | null
          pickup_date?: string | null
          pincode?: string | null
          remarks?: string | null
          router_company?: string | null
          router_id?: string | null
          router_imei_mac?: string | null
          router_imei_wavlink?: string | null
          router_model_no?: string | null
          router_password?: string | null
          router_sim_card_no?: string | null
          router_sim_no?: string | null
          router_ssid?: string | null
          sales_employee?: string | null
          sd_amount?: number | null
          sd_payment_received?: number | null
          sd_received_date?: string | null
          sd_received_on?: Database["public"]["Enums"]["booking_gateway"] | null
          sd_status?: string | null
          sd_txn_id?: string | null
          sim_activation_status?: string | null
          sim_company?: string | null
          sim_id?: string | null
          sim_packet_no?: string | null
          source?: string | null
          state?: string | null
          updated_at?: string
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "sims"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          activation_date: string | null
          address: string | null
          address_line: string | null
          alternate_mobile: string | null
          assigned_executive: string | null
          booking_id: string | null
          city: string | null
          created_at: string
          current_expiry_date: string | null
          current_plan_id: string | null
          customer_code: string
          days_since_last_recharge: number | null
          deleted_at: string | null
          deleted_by: string | null
          district: string | null
          due_soon_flag: boolean
          email: string | null
          expiry_date: string | null
          father_name: string | null
          full_name: string
          id: string
          installation_date: string | null
          internal_remarks: string | null
          kyc_number: string | null
          kyc_type: string | null
          last_recharge_date: string | null
          manual_suspend: boolean
          mobile: string
          notes: string | null
          pincode: string | null
          ready_for_suspension: boolean
          remaining_days: number | null
          router_id: string | null
          sim_id: string | null
          source: string | null
          state: string | null
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
        }
        Insert: {
          activation_date?: string | null
          address?: string | null
          address_line?: string | null
          alternate_mobile?: string | null
          assigned_executive?: string | null
          booking_id?: string | null
          city?: string | null
          created_at?: string
          current_expiry_date?: string | null
          current_plan_id?: string | null
          customer_code?: string
          days_since_last_recharge?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          district?: string | null
          due_soon_flag?: boolean
          email?: string | null
          expiry_date?: string | null
          father_name?: string | null
          full_name: string
          id?: string
          installation_date?: string | null
          internal_remarks?: string | null
          kyc_number?: string | null
          kyc_type?: string | null
          last_recharge_date?: string | null
          manual_suspend?: boolean
          mobile: string
          notes?: string | null
          pincode?: string | null
          ready_for_suspension?: boolean
          remaining_days?: number | null
          router_id?: string | null
          sim_id?: string | null
          source?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Update: {
          activation_date?: string | null
          address?: string | null
          address_line?: string | null
          alternate_mobile?: string | null
          assigned_executive?: string | null
          booking_id?: string | null
          city?: string | null
          created_at?: string
          current_expiry_date?: string | null
          current_plan_id?: string | null
          customer_code?: string
          days_since_last_recharge?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          district?: string | null
          due_soon_flag?: boolean
          email?: string | null
          expiry_date?: string | null
          father_name?: string | null
          full_name?: string
          id?: string
          installation_date?: string | null
          internal_remarks?: string | null
          kyc_number?: string | null
          kyc_type?: string | null
          last_recharge_date?: string | null
          manual_suspend?: boolean
          mobile?: string
          notes?: string | null
          pincode?: string | null
          ready_for_suspension?: boolean
          remaining_days?: number | null
          router_id?: string | null
          sim_id?: string | null
          source?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_current_plan_id_fkey"
            columns: ["current_plan_id"]
            isOneToOne: false
            referencedRelation: "recharge_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "sims"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          error: string | null
          id: string
          message: string
          phone: string
          provider_sid: string | null
          sent_at: string | null
          status: string
          template: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          message: string
          phone: string
          provider_sid?: string | null
          sent_at?: string | null
          status?: string
          template: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          message?: string
          phone?: string
          provider_sid?: string | null
          sent_at?: string | null
          status?: string
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          approval_status: string
          collected_by: string | null
          collection_date: string
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          deposit_id: string | null
          gst: number | null
          id: string
          mode: string | null
          net_amount: number | null
          payment_code: string
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          recharge_id: string | null
          reference_number: string | null
          remarks: string | null
          total_amount: number | null
        }
        Insert: {
          amount: number
          approval_status?: string
          collected_by?: string | null
          collection_date?: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_id?: string | null
          gst?: number | null
          id?: string
          mode?: string | null
          net_amount?: number | null
          payment_code?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          recharge_id?: string | null
          reference_number?: string | null
          remarks?: string | null
          total_amount?: number | null
        }
        Update: {
          amount?: number
          approval_status?: string
          collected_by?: string | null
          collection_date?: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_id?: string | null
          gst?: number | null
          id?: string
          mode?: string | null
          net_amount?: number | null
          payment_code?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          recharge_id?: string | null
          reference_number?: string | null
          remarks?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "security_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recharge_id_fkey"
            columns: ["recharge_id"]
            isOneToOne: false
            referencedRelation: "recharges"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recharge_plans: {
        Row: {
          amount: number
          created_at: string
          data_allowance: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          telecom: Database["public"]["Enums"]["telecom_operator"] | null
          updated_at: string
          validity_days: number
        }
        Insert: {
          amount: number
          created_at?: string
          data_allowance?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          telecom?: Database["public"]["Enums"]["telecom_operator"] | null
          updated_at?: string
          validity_days: number
        }
        Update: {
          amount?: number
          created_at?: string
          data_allowance?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          telecom?: Database["public"]["Enums"]["telecom_operator"] | null
          updated_at?: string
          validity_days?: number
        }
        Relationships: []
      }
      recharges: {
        Row: {
          amount: number | null
          collected_by: string | null
          collection_source: string | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          deleted_by: string | null
          discount: number | null
          expiry_date: string
          gst_amount: number | null
          id: string
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          plan_amount: number | null
          plan_id: string | null
          plan_name: string | null
          recharge_code: string
          recharge_date: string
          remarks: string | null
          transaction_id: string | null
          transaction_ref: string | null
          validity_days: number
        }
        Insert: {
          amount?: number | null
          collected_by?: string | null
          collection_source?: string | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount?: number | null
          expiry_date: string
          gst_amount?: number | null
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          plan_amount?: number | null
          plan_id?: string | null
          plan_name?: string | null
          recharge_code?: string
          recharge_date?: string
          remarks?: string | null
          transaction_id?: string | null
          transaction_ref?: string | null
          validity_days: number
        }
        Update: {
          amount?: number | null
          collected_by?: string | null
          collection_source?: string | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount?: number | null
          expiry_date?: string
          gst_amount?: number | null
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          plan_amount?: number | null
          plan_id?: string | null
          plan_name?: string | null
          recharge_code?: string
          recharge_date?: string
          remarks?: string | null
          transaction_id?: string | null
          transaction_ref?: string | null
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "recharges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharges_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "recharge_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      routers: {
        Row: {
          assigned_customer_id: string | null
          condition: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          installation_date: string | null
          model: string | null
          notes: string | null
          purchase_date: string | null
          return_date: string | null
          serial_number: string
          status: Database["public"]["Enums"]["router_status"]
          updated_at: string
          vendor: string | null
          warranty_until: string | null
        }
        Insert: {
          assigned_customer_id?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          installation_date?: string | null
          model?: string | null
          notes?: string | null
          purchase_date?: string | null
          return_date?: string | null
          serial_number: string
          status?: Database["public"]["Enums"]["router_status"]
          updated_at?: string
          vendor?: string | null
          warranty_until?: string | null
        }
        Update: {
          assigned_customer_id?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          installation_date?: string | null
          model?: string | null
          notes?: string | null
          purchase_date?: string | null
          return_date?: string | null
          serial_number?: string
          status?: Database["public"]["Enums"]["router_status"]
          updated_at?: string
          vendor?: string | null
          warranty_until?: string | null
        }
        Relationships: []
      }
      security_deposits: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          customer_id: string | null
          deposit_code: string
          deposit_date: string | null
          id: string
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          refund_amount: number | null
          refund_approved_at: string | null
          refund_mode: Database["public"]["Enums"]["payment_mode"] | null
          refund_remarks: string | null
          refund_requested_at: string | null
          refund_txn_ref: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          transaction_ref: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          deposit_code?: string
          deposit_date?: string | null
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          refund_amount?: number | null
          refund_approved_at?: string | null
          refund_mode?: Database["public"]["Enums"]["payment_mode"] | null
          refund_remarks?: string | null
          refund_requested_at?: string | null
          refund_txn_ref?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          transaction_ref?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          deposit_code?: string
          deposit_date?: string | null
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          refund_amount?: number | null
          refund_approved_at?: string | null
          refund_mode?: Database["public"]["Enums"]["payment_mode"] | null
          refund_remarks?: string | null
          refund_requested_at?: string | null
          refund_txn_ref?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          transaction_ref?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_deposits_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      sims: {
        Row: {
          activation_date: string | null
          assigned_customer_id: string | null
          company: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          packet_number: string | null
          purchase_date: string | null
          sim_number: string
          status: Database["public"]["Enums"]["sim_status"]
          telecom: Database["public"]["Enums"]["telecom_operator"] | null
          updated_at: string
        }
        Insert: {
          activation_date?: string | null
          assigned_customer_id?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          packet_number?: string | null
          purchase_date?: string | null
          sim_number: string
          status?: Database["public"]["Enums"]["sim_status"]
          telecom?: Database["public"]["Enums"]["telecom_operator"] | null
          updated_at?: string
        }
        Update: {
          activation_date?: string | null
          assigned_customer_id?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          packet_number?: string | null
          purchase_date?: string | null
          sim_number?: string
          status?: Database["public"]["Enums"]["sim_status"]
          telecom?: Database["public"]["Enums"]["telecom_operator"] | null
          updated_at?: string
        }
        Relationships: []
      }
      suspensions: {
        Row: {
          created_at: string
          customer_id: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          reason: string | null
          resume_notes: string | null
          resumed_at: string | null
          resumed_by: string | null
          suspended_at: string
          suspended_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          reason?: string | null
          resume_notes?: string | null
          resumed_at?: string | null
          resumed_by?: string | null
          suspended_at?: string
          suspended_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          reason?: string | null
          resume_notes?: string | null
          resumed_at?: string | null
          resumed_by?: string | null
          suspended_at?: string
          suspended_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suspensions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_updates: {
        Row: {
          author_id: string | null
          created_at: string
          id: string
          message: string | null
          remark: string | null
          status: string | null
          ticket_id: string
          updated_by: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          remark?: string | null
          status?: string | null
          ticket_id: string
          updated_by?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          remark?: string | null
          status?: string | null
          ticket_id?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_updates_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          module: string | null
          priority: string | null
          raised_by: string | null
          resolution_remark: string | null
          resolved_at: string | null
          status: string
          subject: string
          ticket_code: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          module?: string | null
          priority?: string | null
          raised_by?: string | null
          resolution_remark?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_code?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          module?: string | null
          priority?: string | null
          raised_by?: string | null
          resolution_remark?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          created_at?: string
          id?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
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
      grant_role_by_email: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _uid: string }; Returns: boolean }
      log_audit_event: {
        Args: {
          _action: string
          _entity_id?: string
          _module: string
          _new_value?: Json
          _old_value?: Json
        }
        Returns: string
      }
      purge_row: { Args: { _id: string; _table: string }; Returns: boolean }
      refresh_customer_status: { Args: never; Returns: number }
      refresh_customer_statuses: { Args: never; Returns: number }
      restore_row: { Args: { _id: string; _table: string }; Returns: boolean }
      revoke_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      soft_delete_row: {
        Args: { _id: string; _table: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "finance_manager"
        | "ops_manager"
        | "support"
        | "operator"
        | "executive"
        | "viewer"
        | "auditor"
        | "manager"
        | "finance"
      booking_gateway: "razorpay" | "zoho_pay" | "company_account" | "other"
      booking_stage:
        | "customer_info"
        | "kyc_submitted"
        | "kyc_verified"
        | "deposit_requested"
        | "deposit_verified"
        | "approved"
        | "router_assigned"
        | "sim_assigned"
        | "courier_dispatched"
        | "courier_in_transit"
        | "delivered"
        | "installed"
        | "activated"
        | "go_live"
        | "cancelled"
        | "rejected"
      customer_status:
        | "active"
        | "due_soon"
        | "expired"
        | "suspended"
        | "disconnected"
        | "blacklisted"
        | "returned"
      deposit_status:
        | "pending"
        | "received"
        | "verified"
        | "refunded"
        | "partially_refunded"
        | "forfeited"
        | "cancelled"
        | "rejected"
      payment_mode:
        | "upi"
        | "cash"
        | "bank_transfer"
        | "qr_code"
        | "gateway"
        | "cheque"
        | "other"
      router_status:
        | "in_stock"
        | "assigned"
        | "installed"
        | "returned"
        | "faulty"
        | "lost"
        | "damaged"
        | "under_repair"
        | "scrapped"
      sim_status:
        | "available"
        | "assigned"
        | "active"
        | "lost"
        | "damaged"
        | "blocked"
        | "returned"
        | "deactivated"
      telecom_operator: "airtel" | "vi" | "jio" | "bsnl" | "other"
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
      app_role: [
        "super_admin",
        "admin",
        "finance_manager",
        "ops_manager",
        "support",
        "operator",
        "executive",
        "viewer",
        "auditor",
        "manager",
        "finance",
      ],
      booking_gateway: ["razorpay", "zoho_pay", "company_account", "other"],
      booking_stage: [
        "customer_info",
        "kyc_submitted",
        "kyc_verified",
        "deposit_requested",
        "deposit_verified",
        "approved",
        "router_assigned",
        "sim_assigned",
        "courier_dispatched",
        "courier_in_transit",
        "delivered",
        "installed",
        "activated",
        "go_live",
        "cancelled",
        "rejected",
      ],
      customer_status: [
        "active",
        "due_soon",
        "expired",
        "suspended",
        "disconnected",
        "blacklisted",
        "returned",
      ],
      deposit_status: [
        "pending",
        "received",
        "verified",
        "refunded",
        "partially_refunded",
        "forfeited",
        "cancelled",
        "rejected",
      ],
      payment_mode: [
        "upi",
        "cash",
        "bank_transfer",
        "qr_code",
        "gateway",
        "cheque",
        "other",
      ],
      router_status: [
        "in_stock",
        "assigned",
        "installed",
        "returned",
        "faulty",
        "lost",
        "damaged",
        "under_repair",
        "scrapped",
      ],
      sim_status: [
        "available",
        "assigned",
        "active",
        "lost",
        "damaged",
        "blocked",
        "returned",
        "deactivated",
      ],
      telecom_operator: ["airtel", "vi", "jio", "bsnl", "other"],
    },
  },
} as const
