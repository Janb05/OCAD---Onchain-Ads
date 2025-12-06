/**
 * dAd Space SDK (wired to:
 *  - Sepolia Transaction contract
 *  - Web2 backend: /persona (Dune-powered) + /events
 *  - LocalStorage persona → adIds mapping
 *
 * Requires:
 *  <script src="https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js"></script>
 *  <script src="sdk.js"></script>
 */

(function (global) {
  "use strict";

  if (typeof window === "undefined") {
    throw new Error("[dAdSpace SDK] Must run in browser.");
  }

  if (typeof window.ethers === "undefined") {
    console.warn(
      "[dAdSpace SDK] ethers.js missing. Add CDN BEFORE loading SDK:\n" +
        '<script src="https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js"></script>'
    );
  }

  // -------------------------
  // Internal config + state
  // -------------------------
  let _config = {
    contractAddress: null,
    abi: null,
    slotSelector: "#dad-ad-slot",

    // This will be filled from localStorage (dadspace_adIds) + overrides from init()
    adIdsByPersona: {},

    personaEndpoint: null, // e.g. http://localhost:4000/persona
    analyticsEndpoint: null, // e.g. http://localhost:4000/events

    network: "sepolia",
    dappId: "sample-dapp", // used in /events payload
  };

  let _contract = null;
  let _wallet = null;
  let _persona = null;
  let _personaDetail = null; // full PersonaResponse from backend

  const PERSONAS = ["thrift", "luxe", "frequent", "bulk"];

  // -------------------------
  // DOM helpers
  // -------------------------
  function qs(sel) {
    return document.querySelector(sel);
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function el(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "style") Object.assign(element.style, v);
      else if (k === "className") element.className = v;
      else element.setAttribute(k, v);
    });
    if (!Array.isArray(children)) children = [children];
    children.forEach((c) => {
      if (typeof c === "string")
        element.appendChild(document.createTextNode(c));
      else if (c) element.appendChild(c);
    });
    return element;
  }

  // -------------------------
  // LocalStorage helpers
  // -------------------------
  function loadAdIdsFromLocalStorage() {
    try {
      const raw = localStorage.getItem("dadspace_adIds");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          _config.adIdsByPersona = {
            ..._config.adIdsByPersona,
            ...parsed,
          };
        }
      }
    } catch (e) {
      console.warn(
        "[dAdSpace SDK] Failed to read dadspace_adIds from localStorage:",
        e
      );
    }
  }

  // -------------------------
  // Wallet + Contract
  // -------------------------
  async function connectWalletIfNeeded() {
    if (_wallet && _contract) return;

    if (!window.ethereum) {
      throw new Error("Install MetaMask or a compatible wallet.");
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    _wallet = accounts[0];

    const signer = provider.getSigner();
    _contract = new ethers.Contract(
      _config.contractAddress,
      _config.abi,
      signer
    );
  }

  // -------------------------
  // Persona (backend → Dune)
  // -------------------------
  async function resolvePersona(address) {
    if (!_config.personaEndpoint) {
      console.warn(
        "[dAdSpace SDK] personaEndpoint not configured. Using fallback 'thrift'."
      );
      _persona = "thrift";
      _personaDetail = {
        address,
        persona: "thrift",
        features: {
          tx_30d: 0,
          avg_tx_usd: 0,
          nft_trades_90d: 0,
          stablecoin_ratio: 0.5,
        },
        scores: {
          thrift: 1,
          luxe: 0,
          frequent: 0,
          bulk: 0,
        },
      };
      return _persona;
    }

    try {
      const res = await fetch(_config.personaEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      if (!res.ok) {
        throw new Error("Persona endpoint returned " + res.status);
      }

      const data = await res.json();
      // Expected shape: PersonaResponse { address, persona, features, scores }
      const persona = data.persona;

      if (!persona || !PERSONAS.includes(persona)) {
        console.warn(
          "[dAdSpace SDK] Invalid persona from backend. Using 'thrift'. Data:",
          data
        );
        _persona = "thrift";
      } else {
        _persona = persona;
      }
      _personaDetail = data;
      return _persona;
    } catch (err) {
      console.warn(
        "[dAdSpace SDK] Persona backend failed, using 'thrift':",
        err
      );
      _persona = "thrift";
      _personaDetail = null;
      return _persona;
    }
  }

  // -------------------------
  // Fetch ad data from smart contract
  // -------------------------
  function pickAdIdForPersona(persona) {
    const list = _config.adIdsByPersona[persona];
    if (!list || !Array.isArray(list) || list.length === 0) return null;
    // pick last or random; here random to demo rotation
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }

  async function fetchAdForPersona(persona) {
    if (!_contract) {
      throw new Error("Contract not initialized.");
    }

    const adId = pickAdIdForPersona(persona);
    if (!adId) {
      throw new Error(`No ad configured for persona '${persona}'.`);
    }

    const ad = await _contract.transactions(adId);

    if (!ad || !ad.adId || ad.adId.length === 0) {
      throw new Error(`Ad '${adId}' does not exist on-chain.`);
    }

    if (!ad.status) {
      throw new Error(`Ad '${adId}' is inactive.`);
    }

    // ad is a struct: (adId, spendLimit, imageUrl, imageSize, cta, desc, status, clickTag, publisherId)
    return {
      adId: ad.adId,
      spendLimit: ad.spendLimit,
      imageUrl: ad.imageUrl,
      imageSize: ad.imageSize,
      cta: ad.cta,
      desc: ad.desc,
      status: ad.status,
      clickTag: ad.clickTag,
      publisherId: ad.publisherId,
    };
  }

  // -------------------------
  // Analytics (/events)
  // -------------------------
  async function track(eventType, adData, metadata) {
    if (!_config.analyticsEndpoint) return;

    try {
      const body = {
        type: eventType, // "impression" | "click"
        address: _wallet, // viewer wallet
        persona: _persona || "thrift", // resolved persona
        adId: adData.adId,
        publisherId: adData.publisherId,
        dappId: _config.dappId || "sample-dapp",
        metadata: metadata || {},
      };

      await fetch(_config.analyticsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.warn("[dAdSpace SDK] Analytics failed", e);
    }
  }

  // -------------------------
  // Render Ad Slot
  // -------------------------
  async function renderSlot(selectorOverride) {
    const selector = selectorOverride || _config.slotSelector;
    const container = qs(selector);

    if (!container) {
      throw new Error("[dAdSpace SDK] Invalid ad slot selector: " + selector);
    }

    clear(container);
    container.style.minHeight = "150px";
    container.appendChild(
      el(
        "div",
        { style: { color: "#aaa", padding: "10px", fontSize: "12px" } },
        "Loading ad…"
      )
    );

    try {
      // 1) Ensure wallet + contract
      await connectWalletIfNeeded();

      // 2) Persona resolution via web2 backend (Dune-backed)
      const persona = await resolvePersona(_wallet);

      // 3) Fetch ad from contract based on persona
      const ad = await fetchAdForPersona(persona);

      // 4) Render UI card
      clear(container);

      const card = el(
        "div",
        {
          style: {
            border: "1px solid #333",
            borderRadius: "14px",
            overflow: "hidden",
            background: "#0d1117",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          },
        },
        [
          // header
          el(
            "div",
            {
              style: {
                padding: "6px 10px",
                fontSize: "12px",
                color: "#9ca3af",
                borderBottom: "1px solid #222",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              },
            },
            [
              "Sponsored · dAd Space",
              el(
                "span",
                {
                  style: {
                    background: "#111827",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontSize: "11px",
                  },
                },
                `Persona: ${persona}`
              ),
            ]
          ),

          // image
          ad.imageUrl
            ? el("img", {
                src: ad.imageUrl,
                style: {
                  width: "100%",
                  maxHeight: "260px",
                  objectFit: "cover",
                  display: "block",
                },
              })
            : null,

          // body
          el("div", { style: { padding: "10px" } }, [
            el(
              "div",
              {
                style: {
                  fontSize: "14px",
                  marginBottom: "6px",
                  color: "#fff",
                  lineHeight: 1.3,
                },
              },
              ad.desc || ""
            ),
            el(
              "button",
              {
                style: {
                  background: "#ec4899",
                  color: "white",
                  padding: "8px 14px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                },
                onclick: () => {
                  // click tracking
                  track("click", ad, { clickTag: ad.clickTag });
                  if (ad.clickTag) {
                    window.open(ad.clickTag, "_blank", "noopener,noreferrer");
                  }
                },
              },
              ad.cta || "Visit"
            ),
          ]),
        ]
      );

      container.appendChild(card);

      // 5) Send impression automatically
      track("impression", ad, { imageSize: ad.imageSize });
    } catch (err) {
      console.error("[dAdSpace SDK] renderSlot error:", err);
      clear(container);
      container.appendChild(
        el(
          "div",
          { style: { color: "red", padding: "10px", fontSize: "12px" } },
          "Ad failed: " + (err.message || String(err))
        )
      );
    }
  }

  // -------------------------
  // PUBLIC API
  // -------------------------
  global.DadSpace = {
    /**
     * Initialize SDK:
     *  DadSpace.init({
     *    contractAddress,
     *    abi,
     *    slotSelector: "#dad-ad-slot",
     *    personaEndpoint: "http://localhost:4000/persona",
     *    analyticsEndpoint: "http://localhost:4000/events",
     *    network: "sepolia",
     *    dappId: "sample-dapp"
     *  })
     */
    init(config) {
      if (!config || typeof config !== "object") {
        throw new Error("[dAdSpace SDK] init() requires a config object");
      }

      Object.assign(_config, config || {});

      if (!_config.contractAddress || !_config.abi) {
        console.warn(
          "[dAdSpace SDK] contractAddress or abi missing in init()."
        );
      }

      // load persona → adIds mapping from localStorage
      loadAdIdsFromLocalStorage();
    },

    /**
     * Render an ad into the slot (optional selector override)
     */
    renderSlot,

    /**
     * Inspect current SDK state (for debugging)
     */
    getState() {
      return {
        wallet: _wallet,
        persona: _persona,
        personaDetail: _personaDetail,
        config: _config,
      };
    },
  };
})(window);
