// api/quote.js — Coldfront data proxy (runs on the server, keys stay secret)
//
// Default: fetches everything from Yahoo Finance (free, broad, no key).
// Optional: if you set an FMP_API_KEY env var, FMP is fetched too and the
//           frontend prefers it (real-time, licensed) wherever it has the symbol.
//
// Frontend calls:  /api/quote?fmp=GCUSD,BTCUSD&yahoo=GC=F,BTC-USD
// Returns:         { fmp:{SYM:{price,low,high,name}}, yahoo:{SYM:{...}} }

const yahooFinance = require("yahoo-finance2").default;
try { yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]); } catch (e) {}

const TTL_MS = 60 * 1000;          // 60s shared cache so traffic doesn't hammer the sources
const cache = {};

module.exports = async (req, res) => {
  const fmpSyms   = splitSyms(req.query.fmp);
  const yahooSyms = splitSyms(req.query.yahoo);
  const cacheKey  = "F:" + fmpSyms.join(",") + "|Y:" + yahooSyms.join(",");

  const now = Date.now();
  if (cache[cacheKey] && now - cache[cacheKey].t < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json(cache[cacheKey].data);
  }

  const out = { fmp: {}, yahoo: {} };

  // ---- FMP (optional, priority) ----
  const KEY = process.env.FMP_API_KEY;
  if (KEY && fmpSyms.length) {
    try {
      const path = fmpSyms.map(encodeURIComponent).join(",");
      const r = await fetch(`https://financialmodelingprep.com/api/v3/quote/${path}?apikey=${KEY}`);
      if (r.ok) {
        const arr = await r.json();
        (Array.isArray(arr) ? arr : []).forEach(x => {
          if (x && x.symbol) out.fmp[x.symbol] = {
            price: num(x.price), low: num(x.yearLow), high: num(x.yearHigh),
            name: x.name || x.symbol
          };
        });
      }
    } catch (e) { /* ignore — Yahoo will cover it */ }
  }

  // ---- Yahoo (default breadth) ----
  if (yahooSyms.length) out.yahoo = await yahooQuotes(yahooSyms);

  cache[cacheKey] = { t: now, data: out };
  res.setHeader("X-Cache", "MISS");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json(out);
};

// Try one batch call; if it fails, fetch each symbol individually so one bad ticker
// can't blank the whole board.
async function yahooQuotes(symbols) {
  const map = {};
  try {
    const q = await yahooFinance.quote(symbols);
    (Array.isArray(q) ? q : [q]).forEach(x => { if (x && x.symbol) map[x.symbol] = normY(x); });
    if (Object.keys(map).length) return map;
  } catch (e) { /* fall through */ }
  await Promise.allSettled(symbols.map(async s => {
    try { const x = await yahooFinance.quote(s); if (x && x.symbol) map[x.symbol] = normY(x); }
    catch (e) {}
  }));
  return map;
}

function normY(x) {
  return {
    price: num(x.regularMarketPrice),
    low:   num(x.fiftyTwoWeekLow),
    high:  num(x.fiftyTwoWeekHigh),
    name:  x.shortName || x.longName || x.symbol
  };
}
function splitSyms(v) { return String(v || "").split(",").map(s => s.trim()).filter(Boolean); }
function num(v) { const n = Number(v); return isFinite(n) ? n : null; }
