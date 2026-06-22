// api/quote.js — Coldfront proxy (fixed chart endpoint)

const yahooFinance = require("yahoo-finance2").default;
try { yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]); } catch (e) {}

const cache = {};
const TTL = 60000;  // 60s cache

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  
  const { yahoo, hist, period } = req.query;

  // === CHART DATA ===
  if (hist && period) {
    const symbol = String(hist).trim();
    const key = `H:${symbol}:${period}`;
    const now = Date.now();
    
    if (cache[key] && now - cache[key].t < TTL * 5) {
      return res.status(200).json(cache[key].data || { history: [] });
    }

    try {
      // Period mapping
      const pMap = {
        "1m": "1mo", "3m": "3mo", "6m": "6mo", "1y": "1y",
        "5y": "5y", "10y": "10y", "20y": "max", "all": "max"
      };
      const yPeriod = pMap[period] || "1y";

      // Fetch historical data
      const result = await yahooFinance.historical(symbol, { period: yPeriod });
      
      if (!Array.isArray(result) || !result.length) {
        cache[key] = { t: now, data: { history: [] } };
        return res.status(200).json({ history: [] });
      }

      // Format for TradingView
      const history = result
        .map(bar => ({
          time: Math.floor(bar.date.getTime() / 1000),
          open: parseFloat((bar.open || bar.close).toFixed(2)),
          high: parseFloat((bar.high || bar.close).toFixed(2)),
          low: parseFloat((bar.low || bar.close).toFixed(2)),
          close: parseFloat(bar.close.toFixed(2))
        }))
        .sort((a, b) => a.time - b.time)
        .slice(-500);  // Limit to last 500 bars for performance

      const data = { history, symbol, period };
      cache[key] = { t: now, data };
      return res.status(200).json(data);
      
    } catch (e) {
      console.error(`Chart fetch failed for ${symbol}:`, e.message);
      return res.status(200).json({ history: [], error: e.message });
    }
  }

  // === LIVE QUOTES ===
  const yahSyms = String(yahoo || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!yahSyms.length) return res.status(200).json({ yahoo: {} });

  const key = "Q:" + yahSyms.join(",");
  const now = Date.now();

  if (cache[key] && now - cache[key].t < TTL) {
    return res.status(200).json(cache[key].data);
  }

  try {
    const quotes = await yahooFinance.quote(yahSyms);
    const map = {};
    
    (Array.isArray(quotes) ? quotes : [quotes]).forEach(q => {
      if (q && q.symbol) {
        map[q.symbol] = {
          price: q.regularMarketPrice ? parseFloat(q.regularMarketPrice) : null,
          low: q.fiftyTwoWeekLow ? parseFloat(q.fiftyTwoWeekLow) : null,
          high: q.fiftyTwoWeekHigh ? parseFloat(q.fiftyTwoWeekHigh) : null,
          prevClose: q.regularMarketPreviousClose ? parseFloat(q.regularMarketPreviousClose) : null,
          volume: q.regularMarketVolume ? parseInt(q.regularMarketVolume) : null,
          name: q.shortName || q.longName || q.symbol
        };
      }
    });

    const out = { yahoo: map };
    cache[key] = { t: now, data: out };
    return res.status(200).json(out);
    
  } catch (e) {
    console.error("Quote fetch error:", e.message);
    return res.status(200).json({ yahoo: {} });
  }
};
