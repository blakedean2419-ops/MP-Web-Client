# MP Web Client

A responsive, read-only web client for numeric XML telemetry. Built with React, TypeScript, Vite, and Express. Desktop, tablet, and phone share the same application with layouts that adapt to their screen sizes.

The current demonstration uses your 100-element LabVIEW `Random_Number(GET)` response format. It simulates changes to those values and clearly labels them as demo data. It does **not** connect to your laptop until configured with a reachable URL.

## Windows laptop quick start

Download this repository using **Code → Download ZIP**, extract it, and follow [START-HERE-WINDOWS.txt](START-HERE-WINDOWS.txt). The included `.env.laptop.example` is preconfigured for your local LabVIEW service. Node.js 24 LTS or newer is required.

## Run

Requires **Node.js 24 or newer** and npm.

```sh
npm ci
npm run dev
```

Vite serves the browser client on port 5173 and forwards `/api` to the server on port 3001. The API binds to loopback by default. With no `XML_SERVICE_URL`, it runs a labeled demo with no historical recording. Fonts are served locally; the dashboard does not require an external font service.

```sh
npm test          # XML parser, API and real polling integration tests
npm run build    # Type checks, builds the API, builds the browser application
npm start        # Serves the production application and API together on port 3001
npm run test:e2e # Browser workflows at desktop, tablet, and phone sizes
```

Browser tests use system Chromium when available. Otherwise install a Playwright browser with `npx playwright install chromium`, or set `CHROMIUM_PATH` to your Chromium executable. Browser tests start the development servers when needed.

## Connect your laptop's LabVIEW service

When running **the MP server on the same laptop as LabVIEW**, copy `.env.example` to `.env` and set:

```dotenv
XML_SERVICE_URL=http://127.0.0.1:8001/WebService1/Random_Number(GET)
POLL_INTERVAL_MS=2000
```

Restart `npm run dev`, or rebuild and run `npm start`. The demo banner disappears only when an XML service is configured. A failed XML connection shows an error and stale values; it does not fall back to simulated data.

`127.0.0.1` always means the machine running the MP server. A cloud server cannot use that address to reach your laptop. To run MP in the cloud, provide a reachable service address through your network or an authenticated tunnel. For other devices on your local network, you can run the MP server on the laptop and use its LAN address:

```sh
npm run build
# Set HOST=0.0.0.0 in .env, then:
npm start
```

Phones and tablets connect to the laptop's LAN IP on port 3001. The MP server continues to use the loopback LabVIEW address. Each browser keeps its own temporary live trend buffer. This initial client is intended for a trusted development/local network; it does not yet include user authentication.

Optional service authentication stays on the server:

```dotenv
XML_SERVICE_AUTHORIZATION=Bearer <your-token>
```

Basic authentication can also be supplied as an Authorization header. Enter actual credentials only in local environment configuration; `.env` is ignored by Git. Never use a `VITE_` variable for credentials. TLS verification remains enabled. The adapter uses GET requests and does not write to the service. Redirects are rejected; configure the final endpoint directly.

## Your XML array

The supported LabVIEW structure is:

```xml
<Response>
  <Terminal>
    <Name>Array</Name>
    <Value>
      <DimSize>2</DimSize>
      <Name>Numeric Control</Name><Value>8.644872989293326</Value>
      <Name>Numeric Control</Name><Value>2.881289565370859</Value>
    </Value>
  </Terminal>
</Response>
```

This yields two independent tags:

| Stable ID  | Display name          | Value               |
| ---------- | --------------------- | ------------------- |
| `Array[0]` | `Numeric Control [0]` | `8.644872989293326` |
| `Array[1]` | `Numeric Control [1]` | `2.881289565370859` |

`DimSize` is metadata, not a measurement. The parser checks the declared count against the element names and values. Repeated names are safe because array indices identify the tags. **Array order must stay consistent:** changing the order changes which signal belongs to an index. Use an explicit mapping or stable upstream IDs when channel order can change. One-dimensional numeric arrays are supported; clusters and multidimensional arrays need a schema adapter.

Numbers use IEEE 754 double precision in JavaScript. The group values show three decimal places for readability; chart tooltips show up to six. Values do not gain additional precision beyond a double. Sample timestamps represent successful server polling time, not acquisition timestamps from LabVIEW.

Named XML tags also work:

```xml
<Tags>
  <Tag name="PT-101" unit="bar" min="0" max="12" warning="10">
    <Value>7.24</Value>
    <Quality>Good</Quality>
  </Tag>
</Tags>
```

Simple numeric leaves are detected with their XML paths as IDs. Auto-detection assumes numeric leaves are measurements; use mappings when XML also contains numeric metadata.

## Assign meaningful names, units and ranges

Create a JSON mapping file and set `XML_TAG_MAP` to its path. The mapping defines the selected tags; unmapped values are excluded. Array positions in paths are zero-based.

```json
[
  {
    "id": "inlet-pressure",
    "name": "Inlet pressure",
    "path": "Response.Terminal.Value.Value.0",
    "unit": "bar",
    "description": "Feed line pressure",
    "min": 0,
    "max": 10,
    "warning": 9
  },
  {
    "id": "tank-level",
    "name": "Tank level",
    "path": "Response.Terminal.Value.Value.1",
    "unit": "%",
    "min": 0,
    "max": 100
  }
]
```

```dotenv
XML_TAG_MAP=./config/tag-map.json
```

Names, units, and thresholds in this example are illustrative: configure them to match the actual instruments. Namespace prefixes and attribute keys (`@_name`) must be included in explicit paths as returned by `fast-xml-parser`. Without metadata, gauge ranges are display defaults, not known engineering limits. Demo values use a display range of 0–10.

## Live dashboard

The dark dashboard shows editable tag groups beside a shared graph with multiple traces. The initial groups (Fuel and Air, Fuel Splits, Emissions, Pulsation) contain the first detected tags as placeholders; configure membership to match your instruments. They do not imply engineering semantics for unnamed LabVIEW channels.

- Edit the dashboard, group, and graph titles directly in their headings.
- Use a group's **+** button to search and add/remove tags or delete the group. **Add group** creates another panel.
- Click a group value to add that signal to the shared graph. **Add Trace / Configure Traces** lets you search all tags, add/remove traces, choose colors, and toggle visibility. Legend checkboxes also toggle visibility.
- Set a rolling time window (60–3,600 seconds), browser refresh rate, automatic/manual Y axis, and relative/clock time. These affect the display only; the server polling interval remains `POLL_INTERVAL_MS`.
- Titles, groups and trace preferences save automatically per browser. Chart settings apply to the current session.

The client contains no acquisition start/stop controls, recording controls, history viewer, or CSV export. It only reads the service. **No measurement data is written to disk.** The server keeps the latest snapshot in memory; each open browser retains at most one hour or 7,200 live snapshots for its chart. Reloading clears the trend buffer. Existing data folders from older versions are left untouched and are not read by this version.

A shared amplitude axis overlays raw values in their original units; use compatible units or interpret mixed-unit traces carefully. Bad-quality measurements are displayed as unavailable and create gaps in their traces. Failed polling displays a stale-data warning without introducing simulated readings. Sample timestamps represent successful server polling time, not LabVIEW acquisition timestamps.

The API polls serially with a configurable delay after each request, a 10-second timeout and a 2 MB XML response limit. DTD/entity declarations, duplicate IDs, mismatched array dimensions and nonfinite measurements are rejected.

## API

- `GET /api/health` — API availability, mode, XML connection state and last successful poll. Check `connected` separately from HTTP status.
- `GET /api/snapshot` — current tags, full-precision values, quality and service status.

Historical endpoints are not available. The production application is served by the same Express server. For a separately hosted frontend, configure `CLIENT_ORIGIN` and an appropriate API proxy.
