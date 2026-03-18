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
const SECUREHABBO_TURBO_BASE = "https://turbo.securehabbo.com";
const REQUEST_TIMEOUT_MS = 20000;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  const defaultHeaders = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: "https://securehabbo.com/",
    Origin: "https://securehabbo.com",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  };

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
      body: options.body,
      signal: controller.signal,
    });

    if (!response.ok) {
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

async function fetchMarketListingsByProduct(group) {
  const url = new URL(`${SECUREHABBO_TURBO_BASE}/market/listings-zkevm`);
  url.searchParams.set("sell_item_contract_address", group.contractAddress);
  url.searchParams.set("search", group.productCode);

  const payload = await fetchJson(url.toString());
  const listings = Array.isArray(payload?.data?.result) ? payload.data.result : [];

  return listings.map((listing) => {
    const buyItem = listing.buy?.[0];
    const tokenAttributes = listing.token_data?.metadata?.attributes || [];
    return {
      orderId: listing.id,
      accountAddress: normalizeAddress(listing.account_address),
      contractAddress: normalizeAddress(listing.sell?.[0]?.contract_address),
      tokenId: String(listing.sell?.[0]?.token_id || ""),
      productCode: getAttributeValue(tokenAttributes, "productCode"),
      name: listing.token_data?.metadata?.name || group.name,
      imageUrl: listing.token_data?.image_url || listing.token_data?.metadata?.image || group.imageUrl,
      buyTokenContract: normalizeAddress(buyItem?.contract_address),
      buyTokenSymbol: guessTokenSymbol(buyItem?.contract_address),
      buyAmountRaw: String(buyItem?.amount || "0"),
      buyAmountDisplay: formatTokenAmount(String(buyItem?.amount || "0")),
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
    };
  });
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

async function loadGroupedListings(walletAddress) {
  const [inventory, activeListings] = await Promise.all([
    fetchWalletInventory(walletAddress),
    fetchWalletActiveListings(walletAddress),
  ]);

  const merged = mergeInventoryWithListings(inventory, activeListings);
  return groupOwnedListings(merged);
}

module.exports = {
  fetchMarketListingsByProduct,
  findCheaperCompetitor,
  loadGroupedListings,
};
