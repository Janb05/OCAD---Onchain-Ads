export type Persona = "thrift" | "luxe" | "frequent" | "bulk";

export interface PersonaFeatures {
  readonly tx_30d: number;
  readonly avg_tx_usd: number;
  readonly nft_trades_90d: number;
  readonly stablecoin_ratio: number;
}

export interface PersonaScores {
  readonly thrift: number;
  readonly luxe: number;
  readonly frequent: number;
  readonly bulk: number;
}

export interface PersonaResponse {
  readonly address: string;
  readonly persona: Persona;
  readonly features: PersonaFeatures;
  readonly scores: PersonaScores;
}

export type EventType = "impression" | "click";

export interface AdEvent {
  readonly id: string;
  readonly type: EventType;
  readonly address: string;
  readonly persona: Persona;
  readonly adId: string;
  readonly publisherId: string;
  readonly dappId: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}