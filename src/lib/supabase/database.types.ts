
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_job": {
                  Row: {
                    "client_key": string,"context": NonNullable<Json>,"created_at": string,"error_code": string | null,"expires_at": string,"finished_at": string | null,"id": string,"kind": string,"result": Json | null,"seen_at": string | null,"started_at": string | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_key": string,"context"?: NonNullable<Json>,"created_at"?: string,"error_code"?: string | null,"expires_at": string,"finished_at"?: string | null,"id"?: string,"kind": string,"result"?: Json | null,"seen_at"?: string | null,"started_at"?: string | null,"status"?: string,"user_id"?: string
                  }
                  Update: {
                    "client_key"?: string,"context"?: NonNullable<Json>,"created_at"?: string,"error_code"?: string | null,"expires_at"?: string,"finished_at"?: string | null,"id"?: string,"kind"?: string,"result"?: Json | null,"seen_at"?: string | null,"started_at"?: string | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ingredient": {
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
                },"meal_plan": {
                  Row: {
                    "created_at": string,"id": string,"is_current": boolean,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_current"?: boolean,"name": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_current"?: boolean,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"meal_plan_recipe": {
                  Row: {
                    "cooked_at": string | null,"cooked_deductions": Json | null,"created_at": string,"id": string,"meal_plan_id": string,"position": number,"recipe_id": string | null,"recipe_title": string,"servings": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cooked_at"?: string | null,"cooked_deductions"?: Json | null,"created_at"?: string,"id"?: string,"meal_plan_id": string,"position": number,"recipe_id"?: string | null,"recipe_title": string,"servings": number,"user_id"?: string
                  }
                  Update: {
                    "cooked_at"?: string | null,"cooked_deductions"?: Json | null,"created_at"?: string,"id"?: string,"meal_plan_id"?: string,"position"?: number,"recipe_id"?: string | null,"recipe_title"?: string,"servings"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_plan_recipe_meal_plan_fkey"
      columns: ["meal_plan_id","user_id"]
isOneToOne: false
      referencedRelation: "meal_plan"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "meal_plan_recipe_recipe_fkey"
      columns: ["recipe_id","user_id"]
isOneToOne: false
      referencedRelation: "recipe"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"pantry_addition": {
                  Row: {
                    "created_at": string,"id": string,"key": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"key": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"key"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pantry_item": {
                  Row: {
                    "amount": number | null,"created_at": string,"id": string,"ingredient_id": string,"label": string | null,"location": string,"site_id": string,"unit": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"id"?: string,"ingredient_id": string,"label"?: string | null,"location": string,"site_id"?: string,"unit"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string,"label"?: string | null,"location"?: string,"site_id"?: string,"unit"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pantry_item_ingredient_fkey"
      columns: ["ingredient_id","user_id"]
isOneToOne: false
      referencedRelation: "ingredient"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "pantry_item_site_fkey"
      columns: ["site_id","user_id"]
isOneToOne: false
      referencedRelation: "pantry_site"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"pantry_photo": {
                  Row: {
                    "created_at": string,"height": number,"id": string,"location": string,"media_type": string,"object_path": string,"points": Json | null,"reading": NonNullable<Json>,"site_id": string,"taken_at": string,"user_id": string,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"height": number,"id": string,"location": string,"media_type": string,"object_path": string,"points"?: Json | null,"reading": NonNullable<Json>,"site_id": string,"taken_at": string,"user_id"?: string,"width": number
                  }
                  Update: {
                    "created_at"?: string,"height"?: number,"id"?: string,"location"?: string,"media_type"?: string,"object_path"?: string,"points"?: Json | null,"reading"?: NonNullable<Json>,"site_id"?: string,"taken_at"?: string,"user_id"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pantry_photo_site_fkey"
      columns: ["site_id","user_id"]
isOneToOne: false
      referencedRelation: "pantry_site"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"pantry_removal": {
                  Row: {
                    "created_at": string,"id": string,"removed_rows": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"removed_rows": NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"removed_rows"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pantry_site": {
                  Row: {
                    "created_at": string,"id": string,"is_selected": boolean,"name": string,"normalized_name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_selected"?: boolean,"name": string,"normalized_name": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_selected"?: boolean,"name"?: string,"normalized_name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_choice": {
                  Row: {
                    "created_at": string,"id": string,"ingredient_id": string,"package_size": string | null,"product_name": string,"store_id": string,"updated_at": string,"url": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"ingredient_id": string,"package_size"?: string | null,"product_name": string,"store_id": string,"updated_at"?: string,"url"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ingredient_id"?: string,"package_size"?: string | null,"product_name"?: string,"store_id"?: string,"updated_at"?: string,"url"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_choice_ingredient_fkey"
      columns: ["ingredient_id","user_id"]
isOneToOne: false
      referencedRelation: "ingredient"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "product_choice_store_fkey"
      columns: ["store_id","user_id"]
isOneToOne: false
      referencedRelation: "store"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"recipe": {
                  Row: {
                    "created_at": string,"id": string,"image_url": string | null,"is_favorite": boolean,"offer_names": (string)[],"original_servings": number,"source_kind": string,"source_url": string | null,"title": string,"total_minutes": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"image_url"?: string | null,"is_favorite"?: boolean,"offer_names"?: (string)[],"original_servings": number,"source_kind": string,"source_url"?: string | null,"title": string,"total_minutes"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"image_url"?: string | null,"is_favorite"?: boolean,"offer_names"?: (string)[],"original_servings"?: number,"source_kind"?: string,"source_url"?: string | null,"title"?: string,"total_minutes"?: number | null,"updated_at"?: string,"user_id"?: string
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
                },"shopping_check": {
                  Row: {
                    "created_at": string,"id": string,"line_key": string,"meal_plan_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"line_key": string,"meal_plan_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"line_key"?: string,"meal_plan_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_check_meal_plan_fkey"
      columns: ["meal_plan_id","user_id"]
isOneToOne: false
      referencedRelation: "meal_plan"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"shopping_custom_item": {
                  Row: {
                    "amount": number | null,"created_at": string,"id": string,"ingredient_id": string | null,"label": string,"meal_plan_id": string,"unit": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string | null,"label": string,"meal_plan_id": string,"unit"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string | null,"label"?: string,"meal_plan_id"?: string,"unit"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_custom_item_ingredient_fkey"
      columns: ["ingredient_id","user_id"]
isOneToOne: false
      referencedRelation: "ingredient"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "shopping_custom_item_meal_plan_fkey"
      columns: ["meal_plan_id","user_id"]
isOneToOne: false
      referencedRelation: "meal_plan"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"shopping_line_override": {
                  Row: {
                    "amount": number | null,"base_amount": number | null,"created_at": string,"hidden": boolean,"id": string,"line_key": string,"meal_plan_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"base_amount"?: number | null,"created_at"?: string,"hidden"?: boolean,"id"?: string,"line_key": string,"meal_plan_id": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number | null,"base_amount"?: number | null,"created_at"?: string,"hidden"?: boolean,"id"?: string,"line_key"?: string,"meal_plan_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_line_override_meal_plan_fkey"
      columns: ["meal_plan_id","user_id"]
isOneToOne: false
      referencedRelation: "meal_plan"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"store": {
                  Row: {
                    "address": string | null,"chain": string,"created_at": string,"external_store_id": string | null,"id": string,"is_selected": boolean,"name": string,"offers_attempted_at": string | null,"offers_url": string | null,"url": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"chain": string,"created_at"?: string,"external_store_id"?: string | null,"id"?: string,"is_selected"?: boolean,"name": string,"offers_attempted_at"?: string | null,"offers_url"?: string | null,"url"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "address"?: string | null,"chain"?: string,"created_at"?: string,"external_store_id"?: string | null,"id"?: string,"is_selected"?: boolean,"name"?: string,"offers_attempted_at"?: string | null,"offers_url"?: string | null,"url"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"store_offer": {
                  Row: {
                    "created_at": string,"id": string,"ingredient_id": string | null,"label": string,"label_key": string | null,"member_only": boolean,"name": string,"note": string | null,"price": string | null,"regular_price": number | null,"saving_percent": number | null,"section": string,"source": string,"store_id": string,"user_id": string,"valid_to": string | null,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"ingredient_id"?: string | null,"label": string,"label_key"?: never,"member_only"?: boolean,"name": string,"note"?: string | null,"price"?: string | null,"regular_price"?: number | null,"saving_percent"?: number | null,"section": string,"source": string,"store_id": string,"user_id"?: string,"valid_to"?: string | null,"week_start": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ingredient_id"?: string | null,"label"?: string,"label_key"?: never,"member_only"?: boolean,"name"?: string,"note"?: string | null,"price"?: string | null,"regular_price"?: number | null,"saving_percent"?: number | null,"section"?: string,"source"?: string,"store_id"?: string,"user_id"?: string,"valid_to"?: string | null,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "store_offer_ingredient_fkey"
      columns: ["ingredient_id","user_id"]
isOneToOne: false
      referencedRelation: "ingredient"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "store_offer_store_fkey"
      columns: ["store_id","user_id"]
isOneToOne: false
      referencedRelation: "store"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_shopping_custom_item":
{ Args: { "item": Json }; Returns: {
              "amount": number | null,
"created_at": string,
"id": string,
"ingredient_id": string | null,
"label": string,
"meal_plan_id": string,
"unit": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "shopping_custom_item"
        isOneToOne: true
        isSetofReturn: false
      } },
"add_to_current_plan":
{ Args: { "dish_id": string,"dish_recipe_id": string,"dish_recipe_title": string,"dish_servings": number,"plan_name": string }; Returns: {
              "cooked_at": string | null,
"cooked_deductions": Json | null,
"created_at": string,
"id": string,
"meal_plan_id": string,
"position": number,
"recipe_id": string | null,
"recipe_title": string,
"servings": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "meal_plan_recipe"
        isOneToOne: true
        isSetofReturn: false
      } },
"add_to_pantry":
{ Args: { "items": Json,"site"?: string }; Returns: number
                           },
"ai_job_expire":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"ai_job_lock":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"apply_pantry_inventory":
{ Args: { "items": Json,"operation_id"?: string,"place": string,"remove_ids": (string)[],"replace_ids": (string)[],"site"?: string }; Returns: Json
                           },
"cancel_ai_job":
{ Args: { "job_id": string }; Returns: boolean
                           },
"catalog_display_name":
{ Args: { "name_text": string }; Returns: string
                           },
"claim_ai_job":
{ Args: { "job_id": string,"run_deadline": string }; Returns: Json
                           },
"clear_put_in_pantry":
{ Args: { "check_ids": (string)[],"custom_item_ids": (string)[],"override_keys": (string)[],"plan_id": string }; Returns: number
                           },
"commit_ingredients":
{ Args: { "new_ingredients": Json,"synonyms": Json }; Returns: {
              "id": string,"normalized_name": string
            }[]
                           },
"delete_expired_pantry_photos":
{ Args: { "photo_ids": (string)[],"taken_before": string }; Returns: string[]
                           },
"delete_meal_plan":
{ Args: { "plan_id": string }; Returns: boolean
                           },
"delete_pantry_site":
{ Args: { "site_id": string }; Returns: boolean
                           },
"detach_recipe_from_current_plan":
{ Args: { "detached_recipe_id": string }; Returns: number
                           },
"dismiss_ai_job":
{ Args: { "job_id": string }; Returns: undefined
                           },
"empty_pantry_place":
{ Args: { "operation_id": string,"place": string,"site"?: string }; Returns: Json
                           },
"enqueue_ai_job":
{ Args: { "job_client_key": string,"job_context": Json,"job_kind": string,"queue_deadline": string }; Returns: Json
                           },
"ensure_pantry_defaults":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"ensure_user_defaults":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"finish_ai_job":
{ Args: { "job_error_code"?: string,"job_id": string,"job_result"?: Json,"job_status": string }; Returns: boolean
                           },
"hide_shopping_line":
{ Args: { "line_key": string,"plan_id": string }; Returns: Json
                           },
"mark_ai_job_seen":
{ Args: { "job_id": string }; Returns: undefined
                           },
"mark_dish_cooked":
{ Args: { "deductions": Json,"dish": string,"site": string }; Returns: Json
                           },
"meal_plan_lock":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"pantry_added_time":
{ Args: { "value": string }; Returns: string
                           },
"pantry_lock":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"pantry_owner_lock":
{ Args: { "owner": string }; Returns: undefined
                           },
"pantry_photo_orphans":
{ Args: { "min_age": string }; Returns: string[]
                           },
"pantry_photo_points_valid":
{ Args: { "points": Json,"reading": Json }; Returns: boolean
                           },
"pantry_photo_reading_valid":
{ Args: { "reading": Json }; Returns: boolean
                           },
"pantry_place_has_item":
{ Args: { "ingredient": string,"item_unit": string,"place": string,"site"?: string }; Returns: boolean
                           },
"pantry_selected_site":
{ Args: { "owner"?: string }; Returns: string
                           },
"pantry_session_site":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"pantry_site_item_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "item_count": number,"site_id": string
            }[]
                           },
"pantry_target_site":
{ Args: { "site": string }; Returns: string
                           },
"remove_shopping_custom_item":
{ Args: { "item_id": string }; Returns: {
              "amount": number | null,
"created_at": string,
"id": string,
"ingredient_id": string | null,
"label": string,
"meal_plan_id": string,
"unit": string | null,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "shopping_custom_item"
        isOneToOne: false
        isSetofReturn: true
      } },
"restore_pantry_item":
{ Args: { "item": Json,"site"?: string }; Returns: {
              "amount": number | null,
"created_at": string,
"id": string,
"ingredient_id": string,
"label": string | null,
"location": string,
"site_id": string,
"unit": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "pantry_item"
        isOneToOne: true
        isSetofReturn: false
      } },
"restore_pantry_removal":
{ Args: { "operation_id": string,"site"?: string }; Returns: Json
                           },
"restore_plan_recipe":
{ Args: { "dish": Json }; Returns: {
              "cooked_at": string | null,
"cooked_deductions": Json | null,
"created_at": string,
"id": string,
"meal_plan_id": string,
"position": number,
"recipe_id": string | null,
"recipe_title": string,
"servings": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "meal_plan_recipe"
        isOneToOne: true
        isSetofReturn: false
      } },
"restore_shopping_line":
{ Args: { "hidden_updated_at"?: string,"line_key": string,"plan_id": string,"previous": Json }; Returns: undefined
                           },
"save_pantry_photo":
{ Args: { "photo_height": number,"photo_id": string,"photo_path": string,"photo_points"?: Json,"photo_reading": Json,"photo_taken_at": string,"photo_type": string,"photo_width": number,"place": string,"site": string }; Returns: {
              "outcome": string,"previous_path": string
            }[]
                           },
"save_pantry_site":
{ Args: { "mode": string,"site_id": string,"site_name": string,"site_normalized_name": string }; Returns: {
              "created_at": string,
"id": string,
"is_selected": boolean,
"name": string,
"normalized_name": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "pantry_site"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_product_choice":
{ Args: { "choice": Json,"expected_id": string,"expected_updated_at": string }; Returns: {
              "created_at": string,
"id": string,
"ingredient_id": string,
"package_size": string | null,
"product_name": string,
"store_id": string,
"updated_at": string,
"url": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "product_choice"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_recipe":
{ Args: { "lines": Json,"recipe": Json,"steps": Json }; Returns: string
                           },
"save_store":
{ Args: { "make_selected": boolean,"mode": string,"store": Json }; Returns: {
              "address": string | null,
"chain": string,
"created_at": string,
"external_store_id": string | null,
"id": string,
"is_selected": boolean,
"name": string,
"offers_attempted_at": string | null,
"offers_url": string | null,
"url": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "store"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_store_offers":
{ Args: { "items": Json,"replace_source"?: string,"store": string,"week": string }; Returns: number
                           },
"select_pantry_site":
{ Args: { "site_id": string }; Returns: {
              "created_at": string,
"id": string,
"is_selected": boolean,
"name": string,
"normalized_name": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "pantry_site"
        isOneToOne: true
        isSetofReturn: false
      } },
"select_store":
{ Args: { "store_id": string }; Returns: undefined
                           },
"set_ai_job_result":
{ Args: { "job_id": string,"job_result": Json }; Returns: boolean
                           },
"set_current_meal_plan":
{ Args: { "new_plan_id": string,"plan_name": string,"source_id"?: string }; Returns: {
              "created_at": string,
"id": string,
"is_current": boolean,
"name": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "meal_plan"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_pantry_items":
{ Args: { "items": Json,"replace_id"?: string,"site"?: string }; Returns: {
              "amount": number | null,
"created_at": string,
"id": string,
"ingredient_id": string,
"label": string | null,
"location": string,
"site_id": string,
"unit": string | null,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "pantry_item"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_pantry_photo_points":
{ Args: { "photo_id": string,"photo_points": Json }; Returns: boolean
                           },
"set_shopping_check":
{ Args: { "checked": boolean,"line_key": string,"plan_id": string }; Returns: undefined
                           },
"set_shopping_line_amount":
{ Args: { "amount": number,"base_amount"?: number,"line_key": string,"plan_id": string }; Returns: undefined
                           },
"show_shopping_line":
{ Args: { "line_key": string,"plan_id": string }; Returns: undefined
                           },
"store_lock":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"undo_dish_cooked":
{ Args: { "dish": string }; Returns: undefined
                           },
"update_recipe":
{ Args: { "expected_updated_at": string,"id": string,"lines": Json,"recipe": Json,"steps": Json }; Returns: string
                           },
"update_shopping_custom_item":
{ Args: { "item": Json }; Returns: {
              "amount": number | null,
"created_at": string,
"id": string,
"ingredient_id": string | null,
"label": string,
"meal_plan_id": string,
"unit": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "shopping_custom_item"
        isOneToOne: true
        isSetofReturn: false
      } }
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
