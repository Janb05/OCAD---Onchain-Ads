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

  // Enforce rigid browser engine validation parameters
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
  const _config = {
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
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function el(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    
    // Abstract property processing block entries
    const attributeEntries = Object.entries(attrs);
    attributeEntries.forEach(([key, val]) => {
      if (key === "style") {
        Object.assign(element.style, val);
      } else if (key === "className") {
        element.className = val;
      } else {
        element.setAttribute(key, val);
      }
    });

    const childNodes = Array.isArray(children) ? children : [children];
    childNodes.forEach((child) => {
      if (typeof child === "string") {
        element.appendChild(document.createTextNode(child));
      } else if (child) {
        element.appendChild(child);
      }
    });
    
    return element;
  }

  // -------------------------
  // LocalStorage helpers
  // -------------------------
  function loadAdIdsFromLocalStorage() {
    try {
      const rawData = localStorage.getItem("dadspace_adIds");
      if (rawData) {
        const parsedData = JSON.parse(rawData);
        if (parsedData && typeof parsedData === "object") {
          _config.adIdsByPersona = Object.assign({}, _config.adIdsByPersona, parsedData);
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
    if (_wallet && _contract) {
      return;
    }

    if (!window.ethereum) {
      throw new Error("Install MetaMask or a compatible wallet.");
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const userAccounts = await provider.send("eth_requestAccounts", []);
    _wallet = userAccounts[0];

    const providerSigner = provider.getSigner();
    _contract = new ethers.Contract(
      _config.contractAddress,
      _config.abi,
      providerSigner
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
        address: address,
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
      const serverResponse = await fetch(_config.personaEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address }),
      });

      if (!serverResponse.ok) {
        throw new Error("Persona endpoint returned " + serverResponse.status);
      }

      const parsedJson = await serverResponse.json();
      const resolvedTargetPersona = parsedJson.persona;

      if (!resolvedTargetPersona || !PERSONAS.includes(resolvedTargetPersona)) {
        console.warn(
          "[dAdSpace SDK] Invalid persona from backend. Using 'thrift'. Data:",
          parsedJson
        );
        _persona = "thrift";
      } else {
        _persona = resolvedTargetPersona;
      }
      _personaDetail = parsedJson;
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
    const contextList = _config.adIdsByPersona[persona];
    if (!contextList || !Array.isArray(contextList) || contextList.length === 0) {
      return null;
    }
    const targetIndex = Math.floor(Math.random() * contextList.length);
    return contextList[targetIndex];
  }

  async function fetchAdForPersona(persona) {
    if (!_contract) {
      throw new Error("Contract not initialized.");
    }

    const assignedAdId = pickAdIdForPersona(persona);
    if (!assignedAdId) {
      throw new Error(`No ad configured for persona '${persona}'.`);
    }

    const blockchainAdRecord = await _contract.transactions(assignedAdId);

    if (!blockchainAdRecord || !blockchainAdRecord.adId || blockchainAdRecord.adId.length === 0) {
      throw new Error(`Ad '${assignedAdId}' does not exist on-chain.`);
    }

    if (!blockchainAdRecord.status) {
      throw new Error(`Ad '${assignedAdId}' is inactive.`);
    }

    return {
      adId: blockchainAdRecord.adId,
      spendLimit: blockchainAdRecord.spendLimit,
      imageUrl: blockchainAdRecord.imageUrl,
      imageSize: blockchainAdRecord.imageSize,
      cta: blockchainAdRecord.cta,
      desc: blockchainAdRecord.desc,
      status: blockchainAdRecord.status,
      clickTag: blockchainAdRecord.clickTag,
      publisherId: blockchainAdRecord.publisherId,
    };
  }

  // -------------------------
  // Analytics (/events)
  // -------------------------
  async function track(eventType, adData, metadata) {
    if (!_config.analyticsEndpoint) {
      return;
    }

    try {
      const transmissionPayload = {
        type: eventType,
        address: _wallet,
        persona: _persona || "thrift",
        adId: adData.adId,
        publisherId: adData.publisherId,
        dappId: _config.dappId || "sample-dapp",
        metadata: metadata || {},
      };

      await fetch(_config.analyticsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transmissionPayload),
      });
    } catch (e) {
      console.warn("[dAdSpace SDK] Analytics failed", e);
    }
  }

  // -------------------------
  // Render Ad Slot
  // -------------------------
  async function renderSlot(selectorOverride) {
    const targetSelector = selectorOverride || _config.slotSelector;
    const renderContainer = qs(targetSelector);

    if (!renderContainer) {
      throw new Error("[dAdSpace SDK] Invalid ad slot selector: " + targetSelector);
    }

    clear(renderContainer);
    renderContainer.style.minHeight = "150px";
    renderContainer.appendChild(
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
      const resolvedIdentityPersona = await resolvePersona(_wallet);

      // 3) Fetch ad from contract based on persona
      const onChainAdMetadata = await fetchAdForPersona(resolvedIdentityPersona);

      // 4) Render UI card
      clear(renderContainer);

      const computedCardNode = el(
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
                `Persona: ${resolvedIdentityPersona}`
              ),
            ]
          ),

          // image
          onChainAdMetadata.imageUrl
            ? el("img", {
                src: onChainAdMetadata.imageUrl,
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
              onChainAdMetadata.desc || ""
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
                  track("click", onChainAdMetadata, { clickTag: onChainAdMetadata.clickTag });
                  if (onChainAdMetadata.clickTag) {
                    window.open(onChainAdMetadata.clickTag, "_blank", "noopener,noreferrer");
                  }
                },
              },
              onChainAdMetadata.cta || "Visit"
            ),
          ]),
        ]
      );

      renderContainer.appendChild(computedCardNode);

      // 5) Send impression automatically
      track("impression", onChainAdMetadata, { imageSize: onChainAdMetadata.imageSize });
    } catch (err) {
      console.error("[dAdSpace SDK] renderSlot error:", err);
      clear(renderContainer);
      renderContainer.appendChild(
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

      loadAdIdsFromLocalStorage();
    },

    renderSlot: renderSlot,

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