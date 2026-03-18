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

function SideIcon({ active = false, children }) {
  return <button className={`side-icon ${active ? "is-active" : ""}`}>{children}</button>;
}

function SummaryCard({ label, value, accent = false }) {
  return (
    <article className={`summary-card ${accent ? "is-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AssetCard({ item, interactiveApi, onToggle, pendingKey }) {
  const hasUndercut = Boolean(item.cheaperCompetitor);
  const monitorLabel = pendingKey === item.key ? "Salvando" : item.enabled ? "Monitorando" : "Ativar";
  const footerText = hasUndercut
    ? `Concorrente ${formatAddress(item.cheaperCompetitor.accountAddress)}`
    : "Sem concorrente abaixo";

  return (
    <article className={`asset-card ${hasUndercut ? "is-alert" : ""}`}>
      <div className="asset-card__head">
        <span className="asset-tag">{formatCollectionName(item.collectionName)}</span>
        {hasUndercut ? <span className="asset-alert">Undercut detectado</span> : null}
      </div>

      <div className="asset-card__body">
        <div className="asset-thumb">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span>{item.name?.slice(0, 1) || "?"}</span>}
        </div>

        <div className="asset-price-stack">
          <p className="asset-price">{item.ownFloorUsdDisplay || "—"}</p>
          <p className={`asset-market ${hasUndercut ? "is-negative" : ""}`}>
            {hasUndercut ? `${item.cheaperCompetitor.priceDeltaUsdDisplay} abaixo` : "Liderando"}
          </p>
          <p className="asset-market-note">Mercado: {hasUndercut ? item.cheaperCompetitor.buyAmountUsdDisplay : "Sem undercut"}</p>
        </div>
      </div>

      <div className="asset-card__footer">
        <div>
          <h3>{item.name}</h3>
          <p>{footerText}</p>
        </div>

        {interactiveApi ? (
          <button
            type="button"
            className={`asset-action ${item.enabled ? "is-active" : ""}`}
            onClick={() => onToggle(item)}
            disabled={pendingKey === item.key}
          >
            {monitorLabel}
          </button>
        ) : (
          <span className={`asset-action ${item.enabled ? "is-active" : ""}`}>{item.enabled ? "Monitorando" : "Pausado"}</span>
        )}
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
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar__rail" />
          <div className="sidebar__actions">
            <SideIcon active>
              <span className="icon-grid" />
            </SideIcon>
            <SideIcon>
              <span className="icon-wallet" />
            </SideIcon>
            <SideIcon>
              <span className="icon-clock" />
            </SideIcon>
            <SideIcon>
              <span className="icon-gear" />
            </SideIcon>
          </div>
        </aside>

        <main className="content">
          <header className="header">
            <div>
              <span className="header__kicker">Management panel</span>
              <h1>Trade Monitor</h1>
            </div>

            <div className="header__right">
              <div className="live-pill">
                <span className="live-dot" />
                <span>Auto-sync</span>
              </div>

              {interactiveApi ? (
                <div className="header__actions">
                  <button type="button" onClick={handleRefresh}>
                    Atualizar
                  </button>
                  <button type="button" onClick={handleTelegramTest}>
                    Telegram
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <section className="top-grid">
            <div className="title-block">
              <span>LISTING WATCH</span>
              <h2>Seu monitor de preço, limpo e direto.</h2>
            </div>

            <div className="summary-grid">
              <SummaryCard label="Em risco" value={dashboard?.undercutItems ?? 0} accent />
              <SummaryCard label="Monitorados" value={dashboard?.enabledItems ?? 0} />
              <SummaryCard label="ETH/USD" value={dashboard?.pricing?.ethUsdDisplay || "—"} />
              <SummaryCard label="Atualizado" value={formatDate(dashboard?.lastRefreshAt)} />
            </div>
          </section>

          {message ? <div className={`flash flash--${message.type}`}>{message.text}</div> : null}

          <section className="assets-section">
            <div className="section-head">
              <div>
                <span>Assets</span>
                <h3>Itens monitorados</h3>
              </div>

              <div className="section-meta">
                <span>Carteira</span>
                <strong>{formatAddress(dashboard?.walletAddress)}</strong>
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
                <div className="empty-card">Nenhum item apareceu ainda. Assim que os dados carregarem, os cards entram aqui.</div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
