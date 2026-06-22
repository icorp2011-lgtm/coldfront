// api/quote.js — Coldfront data proxy
// Handles: live quotes, historical data for charts, watchlist

const yahooFinance = require("yahoo-finance2").default;
try { yahooFinance.suppressNotices(["yahooSurvey"]); } catch (e) {}

const TTL_MS = 60 * 1000;
const cache = {};

module.exports = async (req, res) => {
  const { yahoo, hist, period } = req.query;

  // Fetch historical data for charts
  if (hist && period) {
    const symbol = String(hist).trim();
    const p = period === "5y" ? "5y" : period === "all" ? "max" : "1y";
    const cacheKey = `H:${symbol}:${p}`;
    const now = Date.now();
    
    if (cache[cacheKey] && now - cache[cacheKey].t < TTL_MS) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json(cache[cacheKey].data);
    }

    try {
      const data = await yahooFinance.chart(symbol, { period: p, interval: "1d" });
      const history = (data.quotes || []).map(q => ({
        time: Math.floor(q.date.getTime() / 1000),
        close: q.close,
        high: q.high,
        low: q.low,
        open: q.open,
      })).filter(q => q.close && q.close > 0);
      
      const result = { history };
      cache[cacheKey] = { t: now, data: result };
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json(result);
    } catch (e) {
      return res.status(502).json({ error: "Could not fetch history" });
    }
  }

  // Fetch live quotes
  const yahSyms = String(yahoo || "").split(",").map(s => s.trim()).filter(Boolean);
  const cacheKey = "Q:" + yahSyms.join(",");
  const now = Date.now();

  if (cache[cacheKey] && now - cache[cacheKey].t < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json(cache[cacheKey].data);
  }

  const out = { yahoo: {} };
  if (yahSyms.length) out.yahoo = await yahooQuotes(yahSyms);

  cache[cacheKey] = { t: now, data: out };
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json(out);
};

async function yahooQuotes(symbols) {
  const map = {};
  try {
    const q = await yahooFinance.quote(symbols);
    (Array.isArray(q) ? q : [q]).forEach(x => { if (x && x.symbol) map[x.symbol] = normY(x); });
    if (Object.keys(map).length) return map;
  } catch (e) { }
  
  await Promise.allSettled(symbols.map(async s => {
    try { 
      const x = await yahooFinance.quote(s); 
      if (x && x.symbol) map[x.symbol] = normY(x); 
    } catch (e) { }
  }));
  return map;
}

function normY(x) {
  return {
    price: Number(x.regularMarketPrice) || null,
    low: Number(x.fiftyTwoWeekLow) || null,
    high: Number(x.fiftyTwoWeekHigh) || null,
    prevClose: Number(x.regularMarketPreviousClose) || null,
    volume: Number(x.regularMarketVolume) || null,
    name: x.shortName || x.longName || x.symbol
  };
}
