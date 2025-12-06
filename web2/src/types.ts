export type Persona = "thrift" | "luxe" | "frequent" | "bulk";

export interface PersonaFeatures {
  tx_30d: number;
  avg_tx_usd: number;
  nft_trades_90d: number;
  stablecoin_ratio: number;
}

export interface PersonaScores {
  thrift: number;
  luxe: number;
  frequent: number;
  bulk: number;
}

export interface PersonaResponse {
  address: string;
  persona: Persona;
  features: PersonaFeatures;
  scores: PersonaScores;
}

export type EventType = "impression" | "click";

export interface AdEvent {
  id: string;
  type: EventType;
  address: string;
  persona: Persona;
  adId: string;
  publisherId: string;
  dappId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
