import { Router, Request, Response } from "express";
import { getPersonaForAddress } from "../services/personaService";

const router = Router();

/**
 * POST /persona
 * Body: { address: "0x..." }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { address } = req.body || {};
    if (!address || typeof address !== "string") {
      return res.status(400).json({ error: "address is required" });
    }

    const persona = await getPersonaForAddress(address);
    return res.json(persona);
  } catch (err: any) {
    console.error("[persona] error", err);
    return res.status(500).json({
      error: "failed_to_compute_persona",
      details: err?.message || String(err)
    });
  }
});

export default router;
