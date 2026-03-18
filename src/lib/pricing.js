const REQUEST_TIMEOUT_MS = 15000;
const COINBASE_SPOT_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";

async function fetchEthUsdPrice() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(COINBASE_SPOT_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${COINBASE_SPOT_URL}`);
    }

    const payload = await response.json();
    const amount = Number(payload?.data?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("ETH/USD spot inválido.");
    }

    return {
      source: "Coinbase spot",
      pair: "ETH/USD",
      amount,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function formatUsd(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 2 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

function rawAmountToDecimal(rawAmount, decimals = 18) {
  const value = typeof rawAmount === "bigint" ? rawAmount : BigInt(String(rawAmount || "0"));
  const precision = 10n ** BigInt(decimals);
  const whole = value / precision;
  const fraction = value % precision;
  return Number(whole) + Number(fraction) / Number(precision);
}

function isEthLikeSymbol(symbol) {
  return ["ETH", "WETH"].includes(String(symbol || "").toUpperCase());
}

function enrichItemWithUsdValues(item, ethUsdPrice) {
  if (!ethUsdPrice || !isEthLikeSymbol(item.buyTokenSymbol)) {
    return {
      ...item,
      ownFloorUsd: null,
      ownFloorUsdDisplay: "-",
      cheaperCompetitor: item.cheaperCompetitor
        ? {
            ...item.cheaperCompetitor,
            buyAmountUsd: null,
            buyAmountUsdDisplay: "-",
            priceDeltaUsd: null,
            priceDeltaUsdDisplay: "-",
          }
        : null,
    };
  }

  const ownFloorUsd = rawAmountToDecimal(item.ownFloorPriceRaw) * ethUsdPrice.amount;
  const cheaperCompetitor = item.cheaperCompetitor
    ? {
        ...item.cheaperCompetitor,
        buyAmountUsd: rawAmountToDecimal(item.cheaperCompetitor.buyAmountRaw) * ethUsdPrice.amount,
        buyAmountUsdDisplay: formatUsd(rawAmountToDecimal(item.cheaperCompetitor.buyAmountRaw) * ethUsdPrice.amount),
        priceDeltaUsd: rawAmountToDecimal(item.cheaperCompetitor.priceDeltaRaw) * ethUsdPrice.amount,
        priceDeltaUsdDisplay: formatUsd(rawAmountToDecimal(item.cheaperCompetitor.priceDeltaRaw) * ethUsdPrice.amount),
      }
    : null;

  return {
    ...item,
    ownFloorUsd,
    ownFloorUsdDisplay: formatUsd(ownFloorUsd),
    cheaperCompetitor,
  };
}

module.exports = {
  enrichItemWithUsdValues,
  fetchEthUsdPrice,
  formatUsd,
};
