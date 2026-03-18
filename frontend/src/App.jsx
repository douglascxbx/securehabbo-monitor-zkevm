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

function formatUpdatedAtParts(value, now = Date.now()) {
  if (!value) {
    return {
      date: "Aguardando",
      time: "sincronização",
    };
  }

  const date = new Date(value);
  const diffMs = Math.max(0, now - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  let relativeText = "agora";
  if (diffMinutes === 1) {
    relativeText = "há 1 min";
  } else if (diffMinutes > 1 && diffMinutes < 60) {
    relativeText = `há ${diffMinutes} min`;
  } else if (diffMinutes >= 60) {
    const diffHours = Math.floor(diffMinutes / 60);
    relativeText = diffHours === 1 ? "há 1 hora" : `há ${diffHours} horas`;
  }

  return {
    date: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date),
    time: `${new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)} · ${relativeText}`,
  };
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

  return items.filter((item) => item.enabled).length;
}

function filterItems(items, filter) {
  if (filter === "risk") {
    return items.filter((item) => item.cheaperCompetitor);
  }

  if (filter === "enabled") {
    return items.filter((item) => item.enabled);
  }

  return items;
}

function isDashboardPayload(payload) {
  return Boolean(payload && Array.isArray(payload.items));
}

function withUpdatedItem(currentDashboard, targetKey, updater) {
  if (!isDashboardPayload(currentDashboard)) {
    return currentDashboard;
  }

  const items = currentDashboard.items.map((item) => (item.key === targetKey ? updater(item) : item));
  const enabledItems = items.filter((item) => item.enabled).length;
  const undercutItems = items.filter((item) => item.cheaperCompetitor).length;

  return {
    ...currentDashboard,
    items,
    totalItems: items.length,
    enabledItems,
    undercutItems,
    healthyItems: items.length - undercutItems,
  };
}

function getPriceTrend(history) {
  const points = Array.isArray(history) ? history.filter((entry) => Number.isFinite(Number(entry?.amount))) : [];
  if (points.length < 2) {
    return {
      direction: "flat",
      deltaPct: null,
      points,
    };
  }

  const first = Number(points[0].amount);
  const last = Number(points[points.length - 1].amount);
  const deltaPct = first > 0 ? ((last - first) / first) * 100 : 0;
  const direction = deltaPct > 0.02 ? "up" : deltaPct < -0.02 ? "down" : "flat";

  return {
    direction,
    deltaPct,
    points,
  };
}

function Sparkline({ points, direction }) {
  if (!points.length) {
    return <div className="sparkline sparkline--empty" />;
  }

  const amounts = points.map((entry) => Number(entry.amount));
  if (amounts.length === 1) {
    return (
      <svg className={`sparkline sparkline--${direction}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" strokeWidth="2.5" points="0,14 100,14" />
      </svg>
    );
  }

  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const range = max - min || 1;
  const polyline = amounts
    .map((amount, index) => {
      const x = (index / Math.max(1, amounts.length - 1)) * 100;
      const y = 28 - ((amount - min) / range) * 28;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className={`sparkline sparkline--${direction}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" strokeWidth="2.5" points={polyline} />
    </svg>
  );
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

function PriceMetricCard({ pricing }) {
  const trend = getPriceTrend(pricing?.history);

  let note = "Sem histórico recente";
  if (trend.deltaPct !== null) {
    const absolutePct = Math.abs(trend.deltaPct).toFixed(2);
    if (trend.direction === "up") {
      note = `Alta recente · +${absolutePct}%`;
    } else if (trend.direction === "down") {
      note = `Queda recente · -${absolutePct}%`;
    } else {
      note = "Faixa lateral recente";
    }
  }

  return (
    <article className="metric-card metric-card--price is-compact">
      <span className="eyebrow">ETH / USD</span>
      <div className="metric-price-row">
        <div>
          <strong>{pricing?.ethUsdDisplay || "-"}</strong>
          <p>{note}</p>
        </div>

        <Sparkline points={trend.points} direction={trend.direction} />
      </div>
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
  const isPending = pendingKey === item.key;
  const actionLabel = isPending ? "Salvando..." : item.enabled ? "Desativar" : "Ativar";
  const marketText = hasUndercut ? `Mercado em ${formatUsd(item.cheaperCompetitor.buyAmountUsd)}` : "Sem undercut no momento";
  const marketNote = hasUndercut
    ? `${formatUsd(item.cheaperCompetitor.priceDeltaUsd)} abaixo`
    : `${item.marketListingCount} listings no mercado`;

  return (
    <article className={`asset-card ${hasUndercut ? "is-alert" : ""} ${item.enabled ? "" : "is-paused"}`}>
      <div className="asset-card__top">
        <div className="asset-card__title-wrap">
          <span className="asset-tag">{formatCollectionName(item.collectionName)}</span>
          <h3>{item.name}</h3>
        </div>

        {hasUndercut ? <span className="asset-state is-alert">Em risco</span> : null}
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
            <p className={hasUndercut ? "is-alert" : ""}>{marketNote}</p>
          </div>
        </div>
      </div>

      <div className="asset-card__footer">
        <div className="asset-meta">
          <p>{marketText}</p>
          <span>{hasUndercut ? `Concorrente ${formatAddress(item.cheaperCompetitor.accountAddress)}` : "Nenhum anúncio abaixo do seu"}</span>
        </div>

        <button
          type="button"
          className={`asset-action ${item.enabled ? "is-active" : ""}`}
          onClick={() => onToggle(item)}
          disabled={!interactiveApi || isPending}
          title={!interactiveApi ? "Esse controle só funciona no painel local." : undefined}
        >
          {interactiveApi ? actionLabel : item.enabled ? "Monitorando" : "Local only"}
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [interactiveApi, setInteractiveApi] = useState(false);
  const [message, setMessage] = useState(null);
  const [pendingKey, setPendingKey] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [clockNow, setClockNow] = useState(Date.now());

  const items = useMemo(() => sortItems(dashboard?.items || []), [dashboard]);
  const filteredItems = useMemo(() => filterItems(items, filter), [filter, items]);
  const updatedAt = useMemo(() => formatUpdatedAtParts(dashboard?.lastRefreshAt, clockNow), [clockNow, dashboard]);

  useEffect(() => {
    let timeoutId;

    if (message) {
      timeoutId = window.setTimeout(() => setMessage(null), 3200);
    }

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNow(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const hasApi = await detectInteractiveApi();
      if (cancelled) {
        return;
      }

      setInteractiveApi(hasApi);

      const payload = await loadDashboardPayload(hasApi);
      if (!cancelled && isDashboardPayload(payload)) {
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
          if (!cancelled && isDashboardPayload(payload)) {
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
    if (!isDashboardPayload(payload)) {
      throw new Error("O painel retornou dados incompletos.");
    }

    setDashboard(payload);
    return payload;
  }

  async function handleRefresh() {
    setIsRefreshing(true);

    try {
      if (interactiveApi) {
        await fetchJson("/api/refresh", { method: "POST" });
        await reloadDashboard(true);
      } else {
        await reloadDashboard(false);
      }

      setMessage({ type: "success", text: "Painel atualizado." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleToggle(item) {
    const previousDashboard = dashboard;
    setPendingKey(item.key);
    setDashboard((current) =>
      withUpdatedItem(current, item.key, (currentItem) => ({
        ...currentItem,
        enabled: !currentItem.enabled,
      }))
    );

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

      if (isDashboardPayload(payload.dashboard)) {
        setDashboard(payload.dashboard);
      } else {
        await reloadDashboard(true);
      }

      setMessage({
        type: "success",
        text: item.enabled ? "Monitoramento desativado." : "Monitoramento ativado.",
      });
    } catch (error) {
      setDashboard(previousDashboard);
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
              <button type="button" onClick={handleRefresh} disabled={isRefreshing}>
                {isRefreshing ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </header>

        <section className="metrics-grid">
          <MetricCard label="Em risco" value={dashboard?.undercutItems ?? 0} note="Itens com anúncio abaixo do seu" accent />
          <MetricCard label="Monitorados" value={dashboard?.enabledItems ?? 0} note="Alertas ativos agora" />
          <PriceMetricCard pricing={dashboard?.pricing} />
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
