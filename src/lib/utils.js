function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function getAttributeValue(attributes, traitType) {
  if (!Array.isArray(attributes)) {
    return "";
  }

  const match = attributes.find((entry) => {
    return normalizeAddress(entry?.trait_type) === normalizeAddress(traitType);
  });

  return match ? String(match.value ?? "") : "";
}

function buildItemKey(contractAddress, productCode, buyTokenContract) {
  return [
    normalizeAddress(contractAddress),
    String(productCode || "").trim().toLowerCase(),
    normalizeAddress(buyTokenContract || "native"),
  ].join(":");
}

function formatTokenAmount(rawAmount, decimals = 18, maxDecimals = 6) {
  const value = typeof rawAmount === "bigint" ? rawAmount : BigInt(String(rawAmount || "0"));
  if (value === 0n) {
    return "0";
  }

  const precision = 10n ** BigInt(decimals);
  const whole = value / precision;
  const fraction = value % precision;
  const paddedFraction = fraction.toString().padStart(decimals, "0");
  const slicedFraction = paddedFraction.slice(0, maxDecimals);
  const trimmedFraction = slicedFraction.replace(/0+$/, "");

  if (!trimmedFraction && whole === 0n) {
    return `<0.${"0".repeat(Math.max(maxDecimals - 1, 0))}1`;
  }

  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

function shortAddress(address) {
  const normalized = String(address || "");
  if (normalized.length <= 12) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function guessTokenSymbol(contractAddress) {
  const normalized = normalizeAddress(contractAddress);
  const knownSymbols = {
    "0x0000000000000000000000000000000000000000": "ETH",
    "0x6de8acc0d406837030ce4dd28e7c08c5a96a30d2": "IMX",
    "0x52a6c53869ce09a731cd772f245b97a4401d3348": "WETH",
  };

  return knownSymbols[normalized] || shortAddress(normalized || "ERC20");
}

function compareRawAmounts(left, right) {
  const leftValue = typeof left === "bigint" ? left : BigInt(String(left || "0"));
  const rightValue = typeof right === "bigint" ? right : BigInt(String(right || "0"));

  if (leftValue < rightValue) {
    return -1;
  }

  if (leftValue > rightValue) {
    return 1;
  }

  return 0;
}

module.exports = {
  buildItemKey,
  compareRawAmounts,
  formatTokenAmount,
  getAttributeValue,
  guessTokenSymbol,
  normalizeAddress,
  shortAddress,
};
