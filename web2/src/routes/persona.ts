import { Router, Request, Response } from "express";
import { getPersonaForAddress } from "../services/personaService";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { address } = req.body || {};
    
    // Added: Strict wallet address validation heuristic
    if (!address || typeof address !== "string") {
      return res.status(400).json({ error: "address is required" });
    }
    if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return res.status(400).json({ error: "invalid_evm_address_format" });
    }

    const persona = await getPersonaForAddress(address);
    return res.json(persona);
  } catch (err: any) {
    console.error("[persona] ingestion error:", err);
    return res.status(500).json({
      error: "failed_to_compute_persona",
      details: err?.message || String(err)
    });
  }
});

export default router;