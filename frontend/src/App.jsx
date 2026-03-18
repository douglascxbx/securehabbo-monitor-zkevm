import { useEffect, useMemo, useState } from "react";

function fetchJson(url, options) {
  return fetch(url, options).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Erro inesperado.");
    }

    return payload;
  });
}

function formatAddress(value) {
  if (!value || value.length < 16) {
    return value || "-";
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatDate(value) {
  if (!value) {
    return "Ainda carregando";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCollectionName(value) {
  const labels = {
    clothes: "Vestuário",
    furniture: "Móveis",
    addons: "Extras",
  };

  return labels[String(value || "").toLowerCase()] || "Coleção";
}

function sortItems(items) {
  return [...items].sort((left, right) => {
    const leftRisk = left.cheaperCompetitor ? left.cheaperCompetitor.priceDeltaUsd || 0 : -1;
    const rightRisk = right.cheaperCompetitor ? right.cheaperCompetitor.priceDeltaUsd || 0 : -1;

    if (rightRisk !== leftRisk) {
      return rightRisk - leftRisk;
    }

    if (Number(right.enabled) !== Number(left.enabled)) {
      return Number(right.enabled) - Number(left.enabled);
    }

    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function getSpotlightItem(items) {
  const sorted = sortItems(items);
  return sorted.find((item) => item.cheaperCompetitor) || sorted[0] || null;
}

function MetricCard({ label, value, detail }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function AssetCard({ item, interactiveApi, onToggle, pendingKey }) {
  const hasUndercut = Boolean(item.cheaperCompetitor);
  const marketPrice = hasUndercut ? item.cheaperCompetitor.buyAmountUsdDisplay : "Sem undercut";
  const deltaText = hasUndercut
    ? `${item.cheaperCompetitor.priceDeltaUsdDisplay} abaixo`
    : "Você ainda segura o menor preço";
  const marketNote = hasUndercut
    ? `Concorrente em ${formatAddress(item.cheaperCompetitor.accountAddress)}`
    : "Mercado alinhado ao seu anúncio";

  return (
    <article className={`asset-card ${hasUndercut ? "is-alert" : ""}`}>
      <div className="asset-card__top">
        <div className="asset-card__identity">
          <div className="asset-thumb">
            {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span>{item.name?.slice(0, 1) || "?"}</span>}
          </div>

          <div className="asset-copy">
            <p className="asset-name">{item.name}</p>
            <div className="asset-subline">
              <span>{formatCollectionName(item.collectionName)}</span>
              <span>{item.enabled ? "Ativo" : "Pausado"}</span>
            </div>
          </div>
        </div>

        {interactiveApi ? (
          <button
            type="button"
            className={`monitor-chip ${item.enabled ? "is-on" : ""}`}
            onClick={() => onToggle(item)}
            disabled={pendingKey === item.key}
          >
            {pendingKey === item.key ? "Salvando" : item.enabled ? "Monitorando" : "Ativar"}
          </button>
        ) : (
          <span className={`monitor-chip ${item.enabled ? "is-on" : ""}`}>{item.enabled ? "Monitorando" : "Pausado"}</span>
        )}
      </div>

      <div className="price-strip">
        <div className="price-block">
          <span>Seu preço</span>
          <strong>{item.ownFloorUsdDisplay || "—"}</strong>
        </div>
        <div className="price-block">
          <span>Mercado</span>
          <strong>{marketPrice}</strong>
        </div>
      </div>

      <div className="asset-card__foot">
        <div>
          <p className={`asset-delta ${hasUndercut ? "asset-delta--alert" : ""}`}>{deltaText}</p>
          <p className="asset-note">{marketNote}</p>
        </div>
        <div className="asset-counts">
          <span>{item.ownListingCount} seu(s)</span>
          <span>{item.marketListingCount || 0} mercado</span>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [interactiveApi, setInteractiveApi] = useState(false);
  const [message, setMessage] = useState(null);
  const [pendingKey, setPendingKey] = useState("");

  const items = useMemo(() => sortItems(dashboard?.items || []), [dashboard]);
  const spotlightItem = useMemo(() => getSpotlightItem(items), [items]);

  useEffect(() => {
    let timeoutId;
    if (message) {
      timeoutId = window.setTimeout(() => setMessage(null), 4000);
    }

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    async function detectApi() {
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        setInteractiveApi(response.ok);
      } catch {
        setInteractiveApi(false);
      }
    }

    detectApi().catch(() => {});
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      const dashboardUrl = new URL("./dashboard-data.json", window.location.href);
      dashboardUrl.searchParams.set("ts", Date.now());
      const payload = await fetchJson(dashboardUrl.toString());
      setDashboard(payload);
    }

    loadDashboard().catch((error) => setMessage({ type: "error", text: error.message }));
    const intervalId = window.setInterval(() => {
      loadDashboard().catch(() => {});
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function reloadDashboard() {
    const dashboardUrl = new URL("./dashboard-data.json", window.location.href);
    dashboardUrl.searchParams.set("ts", Date.now());
    const payload = await fetchJson(dashboardUrl.toString());
    setDashboard(payload);
  }

  async function handleRefresh() {
    try {
      await fetchJson("/api/refresh", { method: "POST" });
      await reloadDashboard();
      setMessage({ type: "success", text: "Atualizado." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  }

  async function handleTelegramTest() {
    try {
      await fetchJson("/api/test-telegram", { method: "POST" });
      setMessage({ type: "success", text: "Teste enviado." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  }

  async function handleToggle(item) {
    setPendingKey(item.key);

    try {
      await fetchJson("/api/monitors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: item.key,
          enabled: !item.enabled,
        }),
      });

      await reloadDashboard();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setPendingKey("");
    }
  }

  return (
    <div className="screen">
      <div className="shell">
        <header className="app-header">
          <div className="app-title">
            <span>Project</span>
            <h1>LISTING WATCH</h1>
          </div>
          <div className="live-pill">
            <span className="live-dot" />
            <span>LIVE</span>
          </div>
        </header>

        <section className="overview-grid">
          <div className="overview-copy">
            <p className="eyebrow">Immutable zkEVM</p>
            <h2>Seu painel de undercut, agora com layout de desktop de verdade.</h2>
            <p className="overview-text">
              Mantive a estética preta com verde-lima da referência, mas transformei isso num dashboard responsivo:
              organizado no PC e ajustado no celular sem parecer uma tela mobile esticada.
            </p>

            <div className="metrics-row">
              <MetricCard label="Em risco" value={dashboard?.undercutItems ?? 0} detail="Itens abaixo do seu preço" />
              <MetricCard label="Monitorados" value={dashboard?.enabledItems ?? 0} detail="Itens com alerta ativo" />
              <MetricCard label="ETH/USD" value={dashboard?.pricing?.ethUsdDisplay || "—"} detail="Cotação atual" />
            </div>

            <div className="meta-row">
              <div>
                <span>Carteira</span>
                <strong>{formatAddress(dashboard?.walletAddress)}</strong>
              </div>
              <div>
                <span>Atualizado</span>
                <strong>{formatDate(dashboard?.lastRefreshAt)}</strong>
              </div>
            </div>

            {interactiveApi ? (
              <div className="action-row">
                <button type="button" onClick={handleRefresh}>
                  Atualizar
                </button>
                <button type="button" onClick={handleTelegramTest}>
                  Testar Telegram
                </button>
              </div>
            ) : null}
          </div>

          <aside className="spotlight-card">
            <p className="eyebrow">Spotlight</p>
            <h3>{spotlightItem?.name || "Carregando item"}</h3>
            <p className="spotlight-price">
              {spotlightItem?.cheaperCompetitor?.buyAmountUsdDisplay || spotlightItem?.ownFloorUsdDisplay || "—"}
            </p>
            <p className={`spotlight-delta ${spotlightItem?.cheaperCompetitor ? "is-alert" : ""}`}>
              {spotlightItem?.cheaperCompetitor
                ? `${spotlightItem.cheaperCompetitor.priceDeltaUsdDisplay} abaixo do seu preço`
                : "Nenhum concorrente abaixo deste item"}
            </p>

            <div className="spotlight-media">
              {spotlightItem?.imageUrl ? (
                <img src={spotlightItem.imageUrl} alt={spotlightItem.name} />
              ) : (
                <div className="spotlight-fallback">NFT</div>
              )}
            </div>
          </aside>
        </section>

        <section className="assets-section">
          <div className="assets-head">
            <div>
              <h3>Assets</h3>
              <p>{dashboard ? `${dashboard.totalItems} itens na carteira` : "Carregando itens"}</p>
            </div>
            <div className="assets-meta">
              <span>Baseado na referência visual</span>
              <strong>Adaptado para desktop e mobile</strong>
            </div>
          </div>

          {message ? <div className={`flash flash--${message.type}`}>{message.text}</div> : null}

          <div className="asset-grid">
            {items.length ? (
              items.map((item) => (
                <AssetCard
                  key={item.key}
                  item={item}
                  interactiveApi={interactiveApi}
                  onToggle={handleToggle}
                  pendingKey={pendingKey}
                />
              ))
            ) : (
              <div className="empty-card">Nenhum item apareceu ainda. Estou lendo o dashboard, então isso não deve ficar vazio depois do carregamento.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
