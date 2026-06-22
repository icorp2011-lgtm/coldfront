// api/quote.js — Coldfront proxy with working chart data

const yahooFinance = require("yahoo-finance2").default;
try { yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]); } catch (e) {}

const TTL_MS = 60 * 1000;
const cache = {};

module.exports = async (req, res) => {
  const { yahoo, hist, period } = req.query;

  // Historical data for charts
  if (hist && period) {
    const symbol = String(hist).trim();
    const cacheKey = `H:${symbol}:${period}`;
    const now = Date.now();
    
    if (cache[cacheKey] && now - cache[cacheKey].t < TTL_MS * 5) {  // 5min cache for history
      res.setHeader("X-Cache", "HIT");
      return res.status(200).json(cache[cacheKey].data);
    }

    try {
      // Map periods to Yahoo interval and range
      const periodMap = {
        "1m": { period: "1mo", interval: "1d" },
        "3m": { period: "3mo", interval: "1d" },
        "6m": { period: "6mo", interval: "1d" },
        "1y": { period: "1y", interval: "1d" },
        "5y": { period: "5y", interval: "1wk" },
        "10y": { period: "10y", interval: "1mo" },
        "20y": { period: "max", interval: "1mo" },
        "all": { period: "max", interval: "1mo" }
      };
      
      const p = periodMap[period] || { period: "1y", interval: "1d" };
      
      // Fetch chart data
      const data = await yahooFinance.chart(symbol, { period: p.period, interval: p.interval });
      
      // Convert to TradingView format
      const quotes = data.quotes || [];
      const history = quotes
        .filter(q => q.date && q.close && q.close > 0)
        .map(q => ({
          time: Math.floor(q.date.getTime() / 1000),  // Unix timestamp
          close: parseFloat(q.close.toFixed(2)),
          open: parseFloat((q.open || q.close).toFixed(2)),
          high: parseFloat((q.high || q.close).toFixed(2)),
          low: parseFloat((q.low || q.close).toFixed(2)),
        }))
        .sort((a, b) => a.time - b.time);  // Ensure chronological order
      
      const result = { history, symbol, period };
      if (history.length) {
        cache[cacheKey] = { t: now, data: result };
      }
      
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).json(result);
    } catch (e) {
      console.error("Chart error:", e.message);
      return res.status(502).json({ error: "Could not fetch chart", history: [] });
    }
  }

  // Live quotes
  const yahSyms = String(yahoo || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!yahSyms.length) return res.status(400).json({ yahoo: {} });
  
  const cacheKey = "Q:" + yahSyms.join(",");
  const now = Date.now();

  if (cache[cacheKey] && now - cache[cacheKey].t < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(cache[cacheKey].data);
  }

  const out = { yahoo: {} };
  out.yahoo = await yahooQuotes(yahSyms);

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
  } catch (e) { console.error("Quote batch error:", e.message); }
  
  // Fallback: fetch individually
  await Promise.allSettled(symbols.map(async s => {
    try { 
      const x = await yahooFinance.quote(s); 
      if (x && x.symbol) map[x.symbol] = normY(x); 
    } catch (e) { console.error(`Quote ${s} failed:`, e.message); }
  }));
  return map;
}

function normY(x) {
  return {
    price: x.regularMarketPrice ? parseFloat(x.regularMarketPrice) : null,
    low: x.fiftyTwoWeekLow ? parseFloat(x.fiftyTwoWeekLow) : null,
    high: x.fiftyTwoWeekHigh ? parseFloat(x.fiftyTwoWeekHigh) : null,
    prevClose: x.regularMarketPreviousClose ? parseFloat(x.regularMarketPreviousClose) : null,
    volume: x.regularMarketVolume ? parseInt(x.regularMarketVolume) : null,
    name: x.shortName || x.longName || x.symbol
  };
}
