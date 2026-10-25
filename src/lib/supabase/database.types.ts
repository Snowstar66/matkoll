
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ingredient": {
                  Row: {
                    "created_at": string,"default_unit": string | null,"id": string,"location": string,"name": string,"normalized_name": string,"section": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_unit"?: string | null,"id"?: string,"location": string,"name": string,"normalized_name": string,"section": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_unit"?: string | null,"id"?: string,"location"?: string,"name"?: string,"normalized_name"?: string,"section"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ingredient_synonym": {
                  Row: {
                    "created_at": string,"id": string,"ingredient_id": string,"normalized": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"ingredient_id": string,"normalized": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ingredient_id"?: string,"normalized"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredient_synonym_ingredient_fkey"
      columns: ["ingredient_id","user_id"]
isOneToOne: false
      referencedRelation: "ingredient"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"recipe": {
                  Row: {
                    "created_at": string,"id": string,"image_url": string | null,"is_favorite": boolean,"original_servings": number,"source_kind": string,"source_url": string | null,"title": string,"total_minutes": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"image_url"?: string | null,"is_favorite"?: boolean,"original_servings": number,"source_kind": string,"source_url"?: string | null,"title": string,"total_minutes"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"image_url"?: string | null,"is_favorite"?: boolean,"original_servings"?: number,"source_kind"?: string,"source_url"?: string | null,"title"?: string,"total_minutes"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_ingredient": {
                  Row: {
                    "amount": number | null,"created_at": string,"id": string,"ingredient_id": string | null,"is_vague": boolean,"original_text": string,"position": number,"recipe_id": string,"step_id": string | null,"unit": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string | null,"is_vague": boolean,"original_text": string,"position": number,"recipe_id": string,"step_id"?: string | null,"unit"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string | null,"is_vague"?: boolean,"original_text"?: string,"position"?: number,"recipe_id"?: string,"step_id"?: string | null,"unit"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredient_ingredient_fkey"
      columns: ["ingredient_id","user_id"]
isOneToOne: false
      referencedRelation: "ingredient"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "recipe_ingredient_recipe_fkey"
      columns: ["recipe_id","user_id"]
isOneToOne: false
      referencedRelation: "recipe"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "recipe_ingredient_step_fkey"
      columns: ["step_id","recipe_id","user_id"]
isOneToOne: false
      referencedRelation: "recipe_step"
      referencedColumns: ["id","recipe_id","user_id"]
    }
                  ]
                },"recipe_site": {
                  Row: {
                    "created_at": string,"domain": string,"id": string,"is_active": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"domain": string,"id"?: string,"is_active"?: boolean,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"domain"?: string,"id"?: string,"is_active"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_step": {
                  Row: {
                    "created_at": string,"id": string,"position": number,"recipe_id": string,"text": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"position": number,"recipe_id": string,"text": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"position"?: number,"recipe_id"?: string,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_step_recipe_fkey"
      columns: ["recipe_id","user_id"]
isOneToOne: false
      referencedRelation: "recipe"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "commit_ingredients":
{ Args: { "new_ingredients": Json,"synonyms": Json }; Returns: {
              "id": string,"normalized_name": string
            }[]
                           },
"ensure_user_defaults":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"save_recipe":
{ Args: { "lines": Json,"recipe": Json,"steps": Json }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
