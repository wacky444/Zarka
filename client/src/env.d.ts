/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_NAKAMA_HOST: string
    readonly VITE_NAKAMA_PORT: string
    readonly VITE_NAKAMA_SERVER_KEY: string
    readonly VITE_NAKAMA_SSL: string
    readonly ROUND_TIME_OFFSET_MINUTES: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
