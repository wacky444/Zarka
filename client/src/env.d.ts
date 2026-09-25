/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_NAKAMA_HOST: string
    readonly VITE_NAKAMA_PORT: string
    readonly VITE_NAKAMA_SERVER_KEY: string
    readonly VITE_NAKAMA_SSL: string
    readonly VITE_GOOGLE_CLIENT_ID: string
    readonly VITE_ADMIN_API_URL?: string
    readonly VITE_ROUND_TIME_OFFSET_MINUTES: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
