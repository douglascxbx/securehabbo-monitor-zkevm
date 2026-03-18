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

function SummaryCard({ label, value, tone = "default" }) {
  return (
    <article className={`summary-card summary-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AssetCard({ item, interactiveApi, onToggle, pendingKey }) {
  const hasUndercut = Boolean(item.cheaperCompetitor);
  const marketPrice = hasUndercut ? item.cheaperCompetitor.buyAmountUsdDisplay : "Sem undercut";
  const statusText = hasUndercut ? "Abaixo do seu preço" : "Você ainda lidera";
  const footText = hasUndercut
    ? `Concorrente em ${formatAddress(item.cheaperCompetitor.accountAddress)}`
    : "Sem concorrente mais barato";

  return (
    <article className={`asset-card ${hasUndercut ? "is-alert" : ""}`}>
      <div className="asset-card__top">
        <div className="asset-card__identity">
          <div className="asset-thumb">
            {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span>{item.name?.slice(0, 1) || "?"}</span>}
          </div>

          <div className="asset-copy">
            <div className="asset-copy__topline">
              <span className="asset-collection">{formatCollectionName(item.collectionName)}</span>
              <span className={`asset-status ${hasUndercut ? "is-alert" : ""}`}>{statusText}</span>
            </div>
            <h3>{item.name}</h3>
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

      <div className="asset-prices">
        <div className="price-panel">
          <span>Seu preço</span>
          <strong>{item.ownFloorUsdDisplay || "—"}</strong>
        </div>
        <div className="price-panel">
          <span>Mercado</span>
          <strong>{marketPrice}</strong>
        </div>
        <div className="price-panel">
          <span>Diferença</span>
          <strong>{hasUndercut ? item.cheaperCompetitor.priceDeltaUsdDisplay : "$0.00"}</strong>
        </div>
      </div>

      <div className="asset-foot">
        <p>{footText}</p>
        <div className="asset-meta">
          <span>{item.ownListingCount} seu(s)</span>
          <span>{item.marketListingCount || 0} no mercado</span>
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
          <div className="brand">
            <span className="brand__kicker">Project</span>
            <h1>LISTING WATCH</h1>
          </div>

          <div className="topbar">
            <div className="live-pill">
              <span className="live-dot" />
              <span>LIVE</span>
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
        </header>

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="hero-copy__kicker">Immutable zkEVM</span>
            <h2>Seus itens organizados para desktop, com leitura rápida e sem excesso.</h2>
            <p>
              Preço em dólar, foco no que foi undercutado e uma grade limpa para você bater o olho e entender tudo em
              segundos.
            </p>
          </div>

          <div className="hero-meta">
            <div>
              <span>Carteira</span>
              <strong>{formatAddress(dashboard?.walletAddress)}</strong>
            </div>
            <div>
              <span>Atualizado</span>
              <strong>{formatDate(dashboard?.lastRefreshAt)}</strong>
            </div>
            <div>
              <span>ETH/USD</span>
              <strong>{dashboard?.pricing?.ethUsdDisplay || "—"}</strong>
            </div>
          </div>
        </section>

        <section className="summary-grid">
          <SummaryCard label="Em risco" value={dashboard?.undercutItems ?? 0} tone="alert" />
          <SummaryCard label="Monitorados" value={dashboard?.enabledItems ?? 0} />
          <SummaryCard label="Seguros" value={dashboard?.healthyItems ?? 0} />
          <SummaryCard label="Total" value={dashboard?.totalItems ?? 0} />
        </section>

        {message ? <div className={`flash flash--${message.type}`}>{message.text}</div> : null}

        <section className="assets-section">
          <div className="section-head">
            <div>
              <span>Assets</span>
              <h3>Itens monitorados</h3>
            </div>
          </div>

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
              <div className="empty-card">Nenhum item apareceu ainda. Assim que os dados carregarem, a grade volta aqui.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
