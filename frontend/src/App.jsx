import { useEffect, useMemo, useState } from "react";

function getJsonContentType(response) {
  return response.headers.get("content-type") || "";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const contentType = getJsonContentType(response);

  if (!contentType.includes("application/json")) {
    throw new Error("Resposta inesperada do servidor.");
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Erro inesperado.");
  }

  return payload;
}

async function detectInteractiveApi() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    return response.ok && getJsonContentType(response).includes("application/json");
  } catch {
    return false;
  }
}

async function loadDashboardPayload(preferApi) {
  const timestamp = Date.now();

  if (preferApi) {
    try {
      return await fetchJson(`/api/dashboard?ts=${timestamp}`);
    } catch {
      // Fallback para a versão estática publicada.
    }
  }

  const dashboardUrl = new URL("./dashboard-data.json", window.location.href);
  dashboardUrl.searchParams.set("ts", timestamp);
  return fetchJson(dashboardUrl.toString());
}

function formatAddress(value) {
  if (!value || value.length < 16) {
    return value || "-";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatUpdatedAtParts(value) {
  if (!value) {
    return {
      date: "Aguardando",
      time: "sincronização",
    };
  }

  const date = new Date(value);

  return {
    date: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function formatUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  const amount = Number(value);
  const fractionDigits = amount >= 1 ? 2 : 4;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
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
    const leftRisk = Number(left.cheaperCompetitor?.priceDeltaUsd || 0);
    const rightRisk = Number(right.cheaperCompetitor?.priceDeltaUsd || 0);

    if (rightRisk !== leftRisk) {
      return rightRisk - leftRisk;
    }

    if (Number(right.enabled) !== Number(left.enabled)) {
      return Number(right.enabled) - Number(left.enabled);
    }

    return String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
  });
}

function getFilterCount(items, filter) {
  if (filter === "all") {
    return items.length;
  }

  if (filter === "risk") {
    return items.filter((item) => item.cheaperCompetitor).length;
  }

  if (filter === "enabled") {
    return items.filter((item) => item.enabled).length;
  }

  return items.filter((item) => !item.cheaperCompetitor).length;
}

function filterItems(items, filter) {
  if (filter === "risk") {
    return items.filter((item) => item.cheaperCompetitor);
  }

  if (filter === "enabled") {
    return items.filter((item) => item.enabled);
  }

  if (filter === "healthy") {
    return items.filter((item) => !item.cheaperCompetitor);
  }

  return items;
}

function MetricCard({ label, value, note, accent = false, compact = false }) {
  return (
    <article className={`metric-card ${accent ? "is-accent" : ""} ${compact ? "is-compact" : ""}`}>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {note ? <p>{note}</p> : null}
    </article>
  );
}

function FilterChip({ active, children, count, onClick }) {
  return (
    <button type="button" className={`filter-chip ${active ? "is-active" : ""}`} onClick={onClick}>
      <span>{children}</span>
      <strong>{count}</strong>
    </button>
  );
}

function AssetCard({ item, interactiveApi, pendingKey, onToggle }) {
  const hasUndercut = Boolean(item.cheaperCompetitor);
  const actionLabel = pendingKey === item.key ? "Salvando..." : item.enabled ? "Monitorando" : "Ativar alerta";
  const undercutText = hasUndercut
    ? `${formatUsd(item.cheaperCompetitor.priceDeltaUsd)} abaixo`
    : "Nenhum anúncio abaixo do seu";
  const marketText = hasUndercut
    ? `Mercado em ${formatUsd(item.cheaperCompetitor.buyAmountUsd)}`
    : "Você está na frente neste item";

  return (
    <article className={`asset-card ${hasUndercut ? "is-alert" : "is-safe"} ${item.enabled ? "" : "is-paused"}`}>
      <div className="asset-card__top">
        <div className="asset-card__title-wrap">
          <span className="asset-tag">{formatCollectionName(item.collectionName)}</span>
          <h3>{item.name}</h3>
        </div>

        <span className={`asset-state ${hasUndercut ? "is-alert" : "is-safe"}`}>
          {hasUndercut ? "Em risco" : "Liderando"}
        </span>
      </div>

      <div className="asset-card__body">
        <div className="asset-thumb">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : <span>{item.name?.slice(0, 1) || "?"}</span>}
        </div>

        <div className="asset-price-grid">
          <div className="price-block">
            <span className="eyebrow">Seu preço</span>
            <strong>{formatUsd(item.ownFloorUsd)}</strong>
            <p>{item.ownFloorPriceDisplay} {item.buyTokenSymbol}</p>
          </div>

          <div className="price-block">
            <span className="eyebrow">Mercado</span>
            <strong>{hasUndercut ? formatUsd(item.cheaperCompetitor.buyAmountUsd) : formatUsd(item.ownFloorUsd)}</strong>
            <p className={hasUndercut ? "is-alert" : ""}>{undercutText}</p>
          </div>
        </div>
      </div>

      <div className="asset-card__footer">
        <div className="asset-meta">
          <p>{marketText}</p>
          <span>
            {hasUndercut ? `Concorrente ${formatAddress(item.cheaperCompetitor.accountAddress)}` : `${item.marketListingCount} listings no mercado`}
          </span>
        </div>

        {interactiveApi ? (
          <button
            type="button"
            className={`asset-action ${item.enabled ? "is-active" : ""}`}
            onClick={() => onToggle(item)}
            disabled={pendingKey === item.key}
          >
            {actionLabel}
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
  const [filter, setFilter] = useState("all");

  const items = useMemo(() => sortItems(dashboard?.items || []), [dashboard]);
  const filteredItems = useMemo(() => filterItems(items, filter), [filter, items]);
  const updatedAt = useMemo(() => formatUpdatedAtParts(dashboard?.lastRefreshAt), [dashboard]);

  useEffect(() => {
    let timeoutId;

    if (message) {
      timeoutId = window.setTimeout(() => setMessage(null), 3200);
    }

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const hasApi = await detectInteractiveApi();
      if (cancelled) {
        return;
      }

      setInteractiveApi(hasApi);

      const payload = await loadDashboardPayload(hasApi);
      if (!cancelled) {
        setDashboard(payload);
      }
    }

    bootstrap().catch((error) => {
      if (!cancelled) {
        setMessage({ type: "error", text: error.message });
      }
    });

    const intervalId = window.setInterval(() => {
      loadDashboardPayload(interactiveApi)
        .then((payload) => {
          if (!cancelled) {
            setDashboard(payload);
          }
        })
        .catch(() => {});
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [interactiveApi]);

  async function reloadDashboard(preferApi = interactiveApi) {
    const payload = await loadDashboardPayload(preferApi);
    setDashboard(payload);
    return payload;
  }

  async function handleRefresh() {
    try {
      if (interactiveApi) {
        const payload = await fetchJson("/api/refresh", { method: "POST" });
        setDashboard(payload.status || payload.dashboard || dashboard);
      } else {
        await reloadDashboard(false);
      }

      setMessage({ type: "success", text: "Painel atualizado." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  }

  async function handleTelegramTest() {
    try {
      await fetchJson("/api/test-telegram", { method: "POST" });
      setMessage({ type: "success", text: "Teste enviado no Telegram." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  }

  async function handleToggle(item) {
    setPendingKey(item.key);

    try {
      const payload = await fetchJson("/api/monitors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: item.key,
          enabled: !item.enabled,
        }),
      });

      if (payload.dashboard) {
        setDashboard(payload.dashboard);
      } else {
        await reloadDashboard(true);
      }

      setMessage({
        type: "success",
        text: item.enabled ? "Monitoramento pausado." : "Monitoramento ativado.",
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setPendingKey("");
    }
  }

  return (
    <div className="screen">
      <div className="dashboard-shell">
        <header className="hero-panel panel">
          <div className="hero-panel__copy">
            <span className="eyebrow">Management Panel</span>
            <h1>Trade Monitor</h1>
            <p>Listings da sua carteira na Immutable zkEVM, com foco nos itens que realmente precisam de ajuste.</p>
          </div>

          <div className="hero-panel__tools">
            <div className="status-pill">
              <span className="status-pill__dot" />
              <span>Auto-sync</span>
            </div>

            <div className="hero-panel__actions">
              <button type="button" onClick={handleRefresh}>
                Atualizar
              </button>
              {interactiveApi ? (
                <button type="button" onClick={handleTelegramTest}>
                  Telegram
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <section className="metrics-grid">
          <MetricCard label="Em risco" value={dashboard?.undercutItems ?? 0} note="Itens com anúncio abaixo do seu" accent />
          <MetricCard label="Monitorados" value={dashboard?.enabledItems ?? 0} note="Alertas ativos agora" />
          <MetricCard label="Liderando" value={dashboard?.healthyItems ?? 0} note="Sem undercut neste momento" />
          <MetricCard label="ETH / USD" value={dashboard?.pricing?.ethUsdDisplay || "-"} note="Cotação spot" compact />
          <MetricCard label="Atualizado" value={updatedAt.date} note={updatedAt.time} compact />
        </section>

        {message ? <div className={`flash flash--${message.type} panel`}>{message.text}</div> : null}

        <section className="inventory-panel panel">
          <div className="inventory-panel__header">
            <div>
              <span className="eyebrow">Assets</span>
              <h2>Itens monitorados</h2>
            </div>

            <div className="inventory-panel__meta">
              <span className="eyebrow">Carteira</span>
              <strong>{formatAddress(dashboard?.walletAddress)}</strong>
            </div>
          </div>

          <div className="inventory-toolbar">
            <div className="filter-row">
              <FilterChip active={filter === "all"} count={getFilterCount(items, "all")} onClick={() => setFilter("all")}>
                Todos
              </FilterChip>
              <FilterChip active={filter === "risk"} count={getFilterCount(items, "risk")} onClick={() => setFilter("risk")}>
                Em risco
              </FilterChip>
              <FilterChip active={filter === "enabled"} count={getFilterCount(items, "enabled")} onClick={() => setFilter("enabled")}>
                Ativos
              </FilterChip>
              <FilterChip active={filter === "healthy"} count={getFilterCount(items, "healthy")} onClick={() => setFilter("healthy")}>
                Liderando
              </FilterChip>
            </div>

            <p className="inventory-caption">
              {filteredItems.length ? `${filteredItems.length} item(ns) exibidos` : "Nenhum item neste filtro"}
            </p>
          </div>

          <div className="asset-grid">
            {filteredItems.length ? (
              filteredItems.map((item) => (
                <AssetCard
                  key={item.key}
                  item={item}
                  interactiveApi={interactiveApi}
                  pendingKey={pendingKey}
                  onToggle={handleToggle}
                />
              ))
            ) : (
              <div className="empty-card">
                Nenhum item apareceu aqui ainda. Assim que os dados forem carregados ou o filtro mudar, os cards voltam a aparecer.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
