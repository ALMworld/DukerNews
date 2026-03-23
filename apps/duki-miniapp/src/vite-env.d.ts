/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WLD_APP_ID: string;
  readonly VITE_WLD_ACTION_ID: string;
  readonly VITE_DISTRIBUTOR_ADDRESS: string;
  readonly VITE_WORLD_CHAIN_RPC: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
