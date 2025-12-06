import axios from "axios";
import {
  Persona,
  PersonaFeatures,
  PersonaResponse,
  PersonaScores
} from "../types";

const PERSONAS: Persona[] = ["thrift", "luxe", "frequent", "bulk"];

const DUNE_API_KEY = process.env.DUNE_API_KEY;
const DUNE_QUERY_ID = process.env.DUNE_QUERY_ID;

function classifyPersona(features: PersonaFeatures): {
  persona: Persona;
  scores: PersonaScores;
} {
  const { tx_30d, avg_tx_usd, nft_trades_90d, stablecoin_ratio } = features;

  let thriftScore = 0;
  let luxeScore = 0;
  let frequentScore = 0;
  let bulkScore = 0;

  thriftScore += stablecoin_ratio * 0.7;
  if (avg_tx_usd < 30) thriftScore += 0.3;
  if (avg_tx_usd > 150) luxeScore += 0.4;
  if (nft_trades_90d > 3) luxeScore += 0.3;
  if (tx_30d > 40) frequentScore += 0.6;
  if (avg_tx_usd > 60 && tx_30d < 12) bulkScore += 0.5;

  const raw: any = { thrift: thriftScore, luxe: luxeScore, frequent: frequentScore, bulk: bulkScore };
  const minScore = 0.05;
  let sum = 0;
  for (const k of PERSONAS) {
    raw[k] = (raw[k] || 0) + minScore;
    sum += raw[k];
  }

  const scores: PersonaScores = {
    thrift: raw.thrift / sum,
    luxe: raw.luxe / sum,
    frequent: raw.frequent / sum,
    bulk: raw.bulk / sum
  };

  let best: Persona = "thrift";
  let bestVal = -1;
  for (const p of PERSONAS) {
    const v = scores[p];
    if (v > bestVal) {
      bestVal = v;
      best = p;
    }
  }

  return { persona: best, scores };
}

function mockFeatures(address: string): PersonaFeatures {
  const hex = address.toLowerCase().replace("0x", "").slice(0, 8) || "0";
  const base = parseInt(hex, 16) || 1;

  return {
    tx_30d: (base % 60) + 5,
    avg_tx_usd: (base % 200) + 5,
    nft_trades_90d: base % 8,
    stablecoin_ratio: ((base % 80) + 10) / 100
  };
}

async function fetchFeaturesFromDune(address: string): Promise<PersonaFeatures> {
  if (!DUNE_API_KEY || !DUNE_QUERY_ID) {
    return mockFeatures(address);
  }

  const url = `https://api.dune.com/api/v1/query/${DUNE_QUERY_ID}/execute`;

  const res = await axios.post(
    url,
    { query_parameters: { address } },
    {
      headers: {
        "X-Dune-Api-Key": DUNE_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  const row = res.data?.result?.rows?.[0];
  if (!row) return mockFeatures(address);

  const features: PersonaFeatures = {
    tx_30d: Number(row.tx_30d ?? 0),
    avg_tx_usd: Number(row.avg_tx_usd ?? 0),
    nft_trades_90d: Number(row.nft_trades_90d ?? 0),
    stablecoin_ratio: Number(row.stablecoin_ratio ?? 0.5)
  };

  return features;
}

export async function getPersonaForAddress(address: string): Promise<PersonaResponse> {
  const features = await fetchFeaturesFromDune(address);
  const { persona, scores } = classifyPersona(features);
  return {
    address,
    persona,
    features,
    scores
  };
}
