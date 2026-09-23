/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** "true" only for the design-review deployment. */
  readonly VITE_DESIGN_PREVIEW?: string
}
