# Coldfront — live market heat map

A public website that ranks markets by how cheap they are versus their own 52-week range.
**Cold = near a 1-year low. Hot = near a 1-year high.** Live prices come from Yahoo Finance
(free, no key). FMP is optional and used first only if you turn it on.

You do **not** need to know how to code to launch this. Follow the steps below.

---

## What's in this folder

```
coldfront/
├─ index.html        ← the website (edit the DATA list to add/remove markets)
├─ api/
│   └─ quote.js      ← the data fetcher (runs on the server, not in the browser)
├─ package.json      ← tells the host to install the Yahoo library
└─ README.md         ← this file
```

Keep the `api/` folder exactly where it is. The website calls `/api/quote` for live data.

---

## Launch it in ~5 minutes (free) — GitHub + Vercel

You'll make two free accounts: **GitHub** (stores the files) and **Vercel** (runs the site).

1. **Create a GitHub account** at github.com, then click **New repository**, name it
   `coldfront`, and create it.
2. On the repo page, click **Add file → Upload files**, then drag in **all of these files,
   keeping the `api` folder** (`index.html`, `package.json`, `README.md`, and `api/quote.js`).
   Commit.
3. Go to **vercel.com**, click **Sign Up**, and choose **Continue with GitHub**.
4. Click **Add New… → Project**, find your `coldfront` repo, click **Import**, then **Deploy**.
   Leave every setting at its default.
5. Wait ~1 minute. Vercel gives you a public URL like `https://coldfront-xxxx.vercel.app`.
   Open it — the live markets light up automatically. **Done.** 🎉

That's a real public website. Share the URL with anyone.

### Want a custom domain?
In Vercel → your project → **Settings → Domains**, add a domain you own (or buy one through
Vercel). Free `.vercel.app` URLs work forever too.

---

## (Optional) Turn on FMP priority later

Yahoo already covers everything for free. If you ever want FMP's licensed, real-time data to
take priority where it has the symbol:

1. Get a free key at **financialmodelingprep.com** (sign up → dashboard → copy API key).
2. In Vercel → your project → **Settings → Environment Variables**, add:
   - **Name:** `FMP_API_KEY`
   - **Value:** your key
3. Click **Save**, then **Deployments → … → Redeploy**.

That's the whole change. No code edits. FMP now leads; Yahoo fills the gaps. Remove the
variable to go back to Yahoo-only.

---

## How it works (the short version)

- The browser asks `/api/quote` for a list of symbols.
- `api/quote.js` fetches them from Yahoo (and FMP first, if the key is set), grabs each
  market's **price, 52-week low, and 52-week high**, and sends them back.
- The page computes each market's position: **(price − low) ÷ (high − low)** → the cold→hot
  score and color.
- Markets with no public feed (diamonds, wine, used equipment, carbon) stay **curated** —
  hand-set in the `DATA` list.

A 60-second cache in the proxy means lots of visitors won't overload the data sources.

---

## Customize it

Open `index.html` and find the `DATA = [ ... ]` list near the bottom. Each line is one market:

```js
{name:"Gold", field:"Metals", yahoo:"GC=F", fmp:"GCUSD",
 current:"~$4,500", vs:"record", tier:"peak", temp:92, signal:"avoid"},
```

- `yahoo` / `fmp` = the ticker symbols (give it a `yahoo` symbol to make it live).
- `temp` (0–100) and `tier` = the fallback snapshot used before live data loads.
- `signal` = `buy`, `neutral`, or `avoid` (your editorial call — not auto-set).
- No `yahoo`/`fmp` symbol = a curated row (collectibles, etc.).

Add a market by copying a line and changing the name + symbol. Yahoo symbols: stocks are plain
(`AAPL`), crypto use `-USD` (`BTC-USD`), commodities use `=F` (`CL=F`), indices use `^`
(`^GSPC`).

---

## Good to know

- Yahoo Finance has no official API; this uses the community `yahoo-finance2` library. Data is
  unofficial and ~15 minutes delayed — **perfectly fine** for a yearly-range heat map, not for
  live trading.
- This is for **information only**, not financial advice.
