import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { AdEvent, EventType } from "../types";

const router = Router();

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");

let events: AdEvent[] = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadEvents() {
  ensureDataDir();
  if (!fs.existsSync(EVENTS_FILE)) {
    events = [];
    return;
  }
  const raw = fs.readFileSync(EVENTS_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      events = parsed;
    }
  } catch {
    events = [];
  }
}

function saveEvents() {
  ensureDataDir();
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), "utf-8");
}

loadEvents();

router.post("/", (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const type: EventType = body.type;
    const required = ["type", "address", "persona", "adId", "publisherId", "dappId"];

    for (const key of required) {
      if (!body[key]) {
        return res.status(400).json({ error: `missing_field_${key}` });
      }
    }
    if (type !== "impression" && type !== "click") {
      return res.status(400).json({ error: "invalid_type" });
    }

    const evt: AdEvent = {
      id: randomUUID(),
      type,
      address: String(body.address),
      persona: String(body.persona) as any,
      adId: String(body.adId),
      publisherId: String(body.publisherId),
      dappId: String(body.dappId),
      timestamp: new Date().toISOString(),
      metadata: body.metadata || {}
    };

    events.push(evt);
    saveEvents();

    return res.json({ ok: true, id: evt.id });
  } catch (err: any) {
    console.error("[events] post error", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

router.get("/stats/:adId", (req: Request, res: Response) => {
  const adId = req.params.adId;
  const adEvents = events.filter((e) => e.adId === adId);

  const impressions = adEvents.filter((e) => e.type === "impression").length;
  const clicks = adEvents.filter((e) => e.type === "click").length;
  const ctr = impressions > 0 ? clicks / impressions : 0;

  return res.json({
    adId,
    impressions,
    clicks,
    ctr,
    sampleEvents: adEvents.slice(-10)
  });
});

router.get("/all", (_req: Request, res: Response) => {
  return res.json(events);
});

export default router;
