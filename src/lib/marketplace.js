const {
  buildItemKey,
  compareRawAmounts,
  formatTokenAmount,
  getAttributeValue,
  guessTokenSymbol,
  normalizeAddress,
  shortAddress,
} = require("./utils");

const IMMUTABLE_API_BASE = "https://api.immutable.com/v1/chains/imtbl-zkevm-mainnet";
const REQUEST_TIMEOUT_MS = 20000;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        ...(options.headers || {}),
      },
      body: options.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      if ((response.status === 429 || response.status === 503) && !options.__isRetry) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 1500;
        await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfterMs) ? retryAfterMs : 1500));

        return fetchJson(url, {
          ...options,
          __isRetry: true,
        });
      }

      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPaginatedResults(buildUrl) {
  const results = [];
  let nextCursor = null;

  do {
    const payload = await fetchJson(buildUrl(nextCursor));
    const pageResults = Array.isArray(payload.result) ? payload.result : [];
    results.push(...pageResults);
    nextCursor = payload.page?.next_cursor || null;
  } while (nextCursor);

  return results;
}

async function fetchWalletInventory(walletAddress) {
  const wallet = normalizeAddress(walletAddress);

  return fetchPaginatedResults((cursor) => {
    const url = new URL(`${IMMUTABLE_API_BASE}/accounts/${wallet}/nfts`);
    url.searchParams.set("page_size", "200");
    if (cursor) {
      url.searchParams.set("page_cursor", cursor);
    }

    return url.toString();
  });
}

async function fetchWalletActiveListings(walletAddress) {
  const wallet = normalizeAddress(walletAddress);

  return fetchPaginatedResults((cursor) => {
    const url = new URL(`${IMMUTABLE_API_BASE}/orders/listings`);
    url.searchParams.set("account_address", wallet);
    url.searchParams.set("status", "ACTIVE");
    url.searchParams.set("page_size", "200");
    if (cursor) {
      url.searchParams.set("page_cursor", cursor);
    }

    return url.toString();
  });
}

function createInventoryLookup(inventoryItems) {
  const lookup = new Map();

  for (const item of inventoryItems) {
    const contractAddress = normalizeAddress(item.contract_address);
    const tokenId = String(item.token_id || "");
    lookup.set(`${contractAddress}:${tokenId}`, item);
  }

  return lookup;
}

function mergeInventoryWithListings(inventoryItems, listings) {
  const inventoryLookup = createInventoryLookup(inventoryItems);
  const merged = [];

  for (const listing of listings) {
    const sellItem = listing.sell?.[0];
    const buyItem = listing.buy?.[0];
    if (!sellItem || !buyItem) {
      continue;
    }

    const contractAddress = normalizeAddress(sellItem.contract_address);
    const tokenId = String(sellItem.token_id || "");
    const inventoryMatch = inventoryLookup.get(`${contractAddress}:${tokenId}`);
    const attributes = inventoryMatch?.attributes || inventoryMatch?.metadata?.attributes || [];
    const productCode = getAttributeValue(attributes, "productCode");
    const name = inventoryMatch?.name || inventoryMatch?.metadata?.name || `Token #${tokenId}`;
    const imageUrl = inventoryMatch?.image || inventoryMatch?.image_url || inventoryMatch?.metadata?.image || "";

    merged.push({
      key: buildItemKey(contractAddress, productCode, buyItem.contract_address),
      orderId: listing.id,
      orderHash: listing.order_hash,
      accountAddress: normalizeAddress(listing.account_address),
      contractAddress,
      tokenId,
      productCode,
      name,
      imageUrl,
      attributes,
      collectionName: getAttributeValue(attributes, "collection") || shortAddress(contractAddress),
      buyTokenContract: normalizeAddress(buyItem.contract_address),
      buyTokenSymbol: guessTokenSymbol(buyItem.contract_address),
      buyAmountRaw: String(buyItem.amount || "0"),
      buyAmountDisplay: formatTokenAmount(String(buyItem.amount || "0")),
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
    });
  }

  return merged.filter((item) => item.productCode);
}

function groupOwnedListings(ownedListings) {
  const groups = new Map();

  for (const listing of ownedListings) {
    if (!groups.has(listing.key)) {
      groups.set(listing.key, {
        key: listing.key,
        contractAddress: listing.contractAddress,
        productCode: listing.productCode,
        name: listing.name,
        imageUrl: listing.imageUrl,
        collectionName: listing.collectionName,
        buyTokenContract: listing.buyTokenContract,
        buyTokenSymbol: listing.buyTokenSymbol,
        listings: [],
      });
    }

    groups.get(listing.key).listings.push(listing);
  }

  return [...groups.values()]
    .map((group) => {
      group.listings.sort((left, right) => compareRawAmounts(left.buyAmountRaw, right.buyAmountRaw));

      const lowestListing = group.listings[0];
      return {
        ...group,
        ownListingCount: group.listings.length,
        ownFloorPriceRaw: lowestListing.buyAmountRaw,
        ownFloorPriceDisplay: lowestListing.buyAmountDisplay,
        ownFloorOrderId: lowestListing.orderId,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function loadGroupedListings(walletAddress) {
  const [inventory, activeListings] = await Promise.all([
    fetchWalletInventory(walletAddress),
    fetchWalletActiveListings(walletAddress),
  ]);

  const merged = mergeInventoryWithListings(inventory, activeListings);
  return groupOwnedListings(merged);
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const nextItem = queue.shift();
      await worker(nextItem);
    }
  });

  await Promise.all(workers);
}

function buildMarketListing(entry) {
  const price = entry?.price_details;
  const token = price?.token;

  return {
    orderId: entry?.listing_id || null,
    accountAddress: normalizeAddress(entry?.creator),
    contractAddress: normalizeAddress(entry?.contract_address),
    tokenId: String(entry?.token_id || ""),
    buyTokenContract: normalizeAddress(token?.contract_address),
    buyTokenSymbol: token?.symbol || guessTokenSymbol(token?.contract_address),
    buyAmountRaw: String(price?.amount || "0"),
    buyAmountDisplay: formatTokenAmount(String(price?.amount || "0")),
  };
}

async function fetchMarketStack(group) {
  const url = new URL(`${IMMUTABLE_API_BASE}/search/stacks`);
  url.searchParams.set("contract_address", group.contractAddress);
  url.searchParams.set("only_if_has_active_listings", "true");
  url.searchParams.set("page_size", "6");
  url.searchParams.set("keyword", group.name);

  const payload = await fetchJson(url.toString());
  const results = Array.isArray(payload.result) ? payload.result : [];

  return results.find((entry) => {
    return (
      normalizeAddress(entry?.stack?.contract_address) === normalizeAddress(group.contractAddress) &&
      getAttributeValue(entry?.stack?.attributes || [], "productCode") === group.productCode
    );
  });
}

async function loadMarketListingsIndex(groups) {
  const index = new Map();

  await runWithConcurrency(groups, 2, async (group) => {
    const stackMatch = await fetchMarketStack(group);
    const listings = Array.isArray(stackMatch?.listings) ? stackMatch.listings : [];

    index.set(
      group.key,
      listings
        .map(buildMarketListing)
        .filter((listing) => listing.orderId && listing.buyTokenContract && listing.buyAmountRaw !== "0")
        .sort((left, right) => compareRawAmounts(left.buyAmountRaw, right.buyAmountRaw))
    );
  });

  return index;
}

function findCheaperCompetitor(group, marketListings, walletAddress) {
  const wallet = normalizeAddress(walletAddress);
  const ownFloor = BigInt(group.ownFloorPriceRaw);
  const compatibleListings = marketListings
    .filter((listing) => normalizeAddress(listing.buyTokenContract) === normalizeAddress(group.buyTokenContract))
    .sort((left, right) => compareRawAmounts(left.buyAmountRaw, right.buyAmountRaw));

  const cheaper = compatibleListings.find((listing) => {
    return listing.accountAddress !== wallet && BigInt(listing.buyAmountRaw) < ownFloor;
  });

  if (!cheaper) {
    return null;
  }

  return {
    ...cheaper,
    priceDeltaRaw: (ownFloor - BigInt(cheaper.buyAmountRaw)).toString(),
    priceDeltaDisplay: formatTokenAmount(ownFloor - BigInt(cheaper.buyAmountRaw)),
  };
}

module.exports = {
  findCheaperCompetitor,
  loadGroupedListings,
  loadMarketListingsIndex,
};
