package dev.vstars;

import com.solacesystems.jms.SolConnectionFactory;
import com.solacesystems.jms.SolJmsUtility;

import javax.jms.*;
import javax.xml.stream.*;
import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

public final class ItwsJsonConsumer {

    // TRACON precip product
    private static final int TARGET_PRODUCT_ID = 9850;

    private static int countNonZero(int[] grid) {
        int c = 0;
        for (int v : grid) if (v != 0) c++;
        return c;
    }

    public static void main(String[] args) throws Exception {
        Config cfg = Config.fromEnv();

        HttpClient http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(cfg.httpConnectTimeoutMs))
                .build();

        SolConnectionFactory cf = SolJmsUtility.createConnectionFactory();
        cf.setHost(normalizeJmsHostList(cfg.jmsUrl));
        cf.setVPN(cfg.vpn);
        cf.setUsername(cfg.username);
        cf.setPassword(cfg.password);
        cf.setConnectRetries(5);
        cf.setConnectRetriesPerHost(3);

        try (Connection conn = cf.createConnection();
             Session session = conn.createSession(false, Session.CLIENT_ACKNOWLEDGE)) {

            Queue queue = session.createQueue(cfg.queueName);
            MessageConsumer consumer = session.createConsumer(queue);

            conn.start();
            System.out.println("Connected. Consuming queue: " + cfg.queueName);
            System.out.println("Posting to: " + cfg.postUrl);

            XMLInputFactory xif = XMLInputFactory.newFactory();
            trySet(xif, XMLInputFactory.SUPPORT_DTD, false);
            trySet(xif, "javax.xml.stream.isSupportingExternalEntities", false);

            long empty = 0;
            long lastBeat = System.currentTimeMillis();

            while (true) {
                Message msg = consumer.receive(cfg.receiveTimeoutMs);
                if (msg == null) {
                    empty++;
                    long now = System.currentTimeMillis();
                    if (now - lastBeat >= cfg.heartbeatMs) {
                        System.out.println("Waiting… (" + empty + " empty polls)");
                        lastBeat = now;
                    }
                    continue;
                }

                boolean acked = false;
                try {
                    // Cheap gate: skip non-9850 messages quickly
                    if (msg.propertyExists("productID")) {
                        int pid = toInt(msg.getObjectProperty("productID"), -1);
                        if (pid != TARGET_PRODUCT_ID) {
                            msg.acknowledge();
                            acked = true;
                            continue;
                        }
                    }

                    PrecipFrame frame = parseAndDecode(msg, xif, cfg);
                    if (frame == null || frame.productId != TARGET_PRODUCT_ID || frame.grid == null) {
                        // Not our frame or malformed => ack so we don't poison-loop
                        msg.acknowledge();
                        acked = true;
                        continue;
                    }

                    // Build JSON bytes (streamed) and POST
                    byte[] json = buildJsonBytes(frame, cfg.maxCellsOut);

                    if (cfg.printJson) {
                        System.out.write(json);
                        System.out.write('\n');
                        System.out.flush();
                    }

                    postWithRetry(http, cfg.postUrl, cfg.ingestToken, json,
                            cfg.httpRequestTimeoutMs, cfg.retrySleepMs);
                        
                    int nonZero = countNonZero(frame.grid);
                    System.out.println(
                        "POST OK " + isoNow()
                        + " productId=" + frame.productId
                        + " size=" + frame.cols + "x" + frame.rows
                        + " maxLvl=" + frame.maxPrecipLevel
                        + " nonZero=" + nonZero
                        + " filled=" + frame.filledCells
                    );

                    // ACK only after successful POST
                    msg.acknowledge();
                    acked = true;

                } catch (Exception e) {
                    System.err.println("Error: " + e.getMessage());
                    // If we didn't ACK and it's a transient error, message will redeliver.
                    // For parsing errors, we already acked above to avoid poison loops.
                } finally {
                    // Safety: avoid double-acking; only ack if not already done and you explicitly want it.
                    // (Leave it off for reliability.)
                    if (!acked && cfg.ackOnException) {
                        try { msg.acknowledge(); } catch (Exception ignored) {}
                    }
                }
            }
        }
    }

    // ---------------- Parsing + streaming RLE decode ----------------

    private static PrecipFrame parseAndDecode(Message msg, XMLInputFactory xif, Config cfg) throws Exception {
        InputStream in = extractXmlStream(msg, cfg.maxXmlBytes);
        if (in == null) return null;

        XMLStreamReader r = xif.createXMLStreamReader(in);

        PrecipFrame f = new PrecipFrame();
        f.receivedAt = Instant.now().toString();

        String current = null;
        StringBuilder smallText = null;
        RleDecoder dec = null;

        while (r.hasNext()) {
            int ev = r.next();

            if (ev == XMLStreamConstants.START_ELEMENT) {
                current = r.getLocalName();

                if (!"prcp_grid_compressed".equals(current)) {
                    smallText = new StringBuilder(64);
                } else {
                    smallText = null;

                    if (f.rows > 0 && f.cols > 0 && f.grid == null) {
                        f.grid = new int[safeMul(f.rows, f.cols)];
                        dec = new RleDecoder(f.grid);
                        dec.setSpecials(f.badValue, f.noCoverage, f.attenuated, f.apDetected);
                    } else if (f.grid != null && dec == null) {
                        dec = new RleDecoder(f.grid);
                        dec.setSpecials(f.badValue, f.noCoverage, f.attenuated, f.apDetected);
                    }
                }

            } else if (ev == XMLStreamConstants.CHARACTERS || ev == XMLStreamConstants.CDATA) {
                if ("prcp_grid_compressed".equals(current)) {
                    if (dec != null) dec.feed(r.getText());
                } else if (smallText != null) {
                    if (smallText.length() < 512) smallText.append(r.getText());
                }

            } else if (ev == XMLStreamConstants.END_ELEMENT) {
                String end = r.getLocalName();

                if ("prcp_grid_compressed".equals(end)) {
                    if (dec != null) dec.finish();
                } else if (current != null && current.equals(end) && smallText != null) {
                    String v = smallText.toString().trim();
                    applyField(f, end, v);

                    if ((end.equals("prcp_nrows") || end.equals("prcp_ncols")) && f.rows > 0 && f.cols > 0 && f.grid == null) {
                        f.grid = new int[safeMul(f.rows, f.cols)];
                    }
                }

                current = null;
                smallText = null;
            }
        }

        if (f.productId != TARGET_PRODUCT_ID) return null;
        if (f.grid == null || f.rows <= 0 || f.cols <= 0) return null;

        f.filledCells = (dec == null) ? -1 : dec.filled();
        return f;
    }

    private static void applyField(PrecipFrame f, String tag, String v) {
        switch (tag) {
            case "product_msg_id" -> f.productId = parseInt(v, -1);
            case "product_msg_name" -> f.productName = v;
            case "product_header_itws_sites" -> f.site = v;
            case "product_header_airports" -> f.airport = v;

            case "prcp_TRP_latitude" -> f.trpLatMicroDeg = parseInt(v, 0);
            case "prcp_TRP_longitude" -> f.trpLonMicroDeg = parseInt(v, 0);

            case "prcp_xoffset" -> f.xOffsetM = parseInt(v, 0);
            case "prcp_yoffset" -> f.yOffsetM = parseInt(v, 0);

            case "prcp_dx" -> f.dxM = parseInt(v, 0);
            case "prcp_dy" -> f.dyM = parseInt(v, 0);

            case "prcp_rotation" -> f.rotationMilliDeg = parseInt(v, 0);

            case "prcp_nrows" -> f.rows = parseInt(v, -1);
            case "prcp_ncols" -> f.cols = parseInt(v, -1);

            case "prcp_attenuated" -> f.attenuated = parseInt(v, 7);
            case "prcp_ap_detected" -> f.apDetected = parseInt(v, 8);
            case "prcp_bad_value" -> f.badValue = parseInt(v, 9);
            case "prcp_no_coverage" -> f.noCoverage = parseInt(v, 15);

            case "prcp_grid_compression_encoding_scheme" -> f.compression = v;
            case "prcp_grid_max_precip_level" -> f.maxPrecipLevel = parseInt(v, -1);
            default -> { /* ignore */ }
        }
    }

    // ---------------- RLE decoder (streaming) ----------------

    private static final class RleDecoder {
        private final int[] out;
        private int outPos = 0;

        private int bad = 9, noCov = 15, atten = 7, ap = 8;

        private int curVal = 0;
        private int curCnt = 0;
        private boolean neg = false;
        private boolean inVal = false;
        private boolean inCnt = false;
        private boolean sawDigit = false;

        RleDecoder(int[] out) { this.out = out; }

        void setSpecials(int bad, int noCov, int atten, int ap) {
            this.bad = bad;
            this.noCov = noCov;
            this.atten = atten;
            this.ap = ap;
        }

        int filled() { return outPos; }

        void feed(String chunk) {
            if (chunk == null || chunk.isEmpty() || outPos >= out.length) return;

            final int n = chunk.length();
            for (int i = 0; i < n && outPos < out.length; i++) {
                char c = chunk.charAt(i);

                if (!inVal && !inCnt) {
                    if (isWs(c)) continue;
                    inVal = true;
                    neg = false;
                    curVal = 0;
                    curCnt = 0;
                    sawDigit = false;
                    if (c == '-') { neg = true; continue; }
                    if (isDigit(c)) { sawDigit = true; curVal = c - '0'; continue; }
                    inVal = false;
                    continue;
                }

                if (inVal) {
                    if (isDigit(c)) {
                        sawDigit = true;
                        curVal = curVal * 10 + (c - '0');
                        continue;
                    }
                    if (c == ',' && sawDigit) {
                        if (neg) curVal = -curVal;
                        inVal = false;
                        inCnt = true;
                        curCnt = 0;
                        sawDigit = false;
                        continue;
                    }
                    inVal = false;
                    continue;
                }

                if (inCnt) {
                    if (isDigit(c)) {
                        sawDigit = true;
                        curCnt = curCnt * 10 + (c - '0');
                        continue;
                    }
                    if (isWs(c) && sawDigit) {
                        emitRun(curVal, curCnt);
                        inCnt = false;
                        continue;
                    }
                }
            }
        }

        void finish() {
            if (inCnt && sawDigit && outPos < out.length) emitRun(curVal, curCnt);
            inVal = false;
            inCnt = false;
            sawDigit = false;
        }

        private void emitRun(int v, int cnt) {
            int mapped = mapLevel(v);
            int take = Math.min(cnt, out.length - outPos);
            for (int k = 0; k < take; k++) out[outPos++] = mapped;
        }

        // Keep 0..6 verbatim, map special/no-data to 0
        private int mapLevel(int v) {
            if (v == bad || v == noCov || v == atten || v == ap) return 0;
            if (v < 0 || v > 6) return 0;
            return v;
        }

        private static boolean isDigit(char c) { return c >= '0' && c <= '9'; }
        private static boolean isWs(char c) { return c == ' ' || c == '\n' || c == '\r' || c == '\t'; }
    }

    // ---------------- JSON build (streamed) ----------------

    private static byte[] buildJsonBytes(PrecipFrame f, int maxCellsOut) throws IOException {
        final double trpLatDeg = f.trpLatMicroDeg / 1_000_000.0;
        final double trpLonDeg = f.trpLonMicroDeg / 1_000_000.0;
        final double rotDeg = f.rotationMilliDeg / 1000.0;

        ByteArrayOutputStream baos = new ByteArrayOutputStream(1 << 20);
        PrintWriter w = new PrintWriter(new BufferedWriter(new OutputStreamWriter(baos, StandardCharsets.UTF_8)), false);

        w.print('{');

        jstr(w, "receivedAt", f.receivedAt); w.print(',');
        jint(w, "productId", f.productId); w.print(',');
        jstr(w, "productName", nz(f.productName)); w.print(',');
        jstr(w, "site", nz(f.site)); w.print(',');
        jstr(w, "airport", nz(f.airport)); w.print(',');

        jint(w, "rows", f.rows); w.print(',');
        jint(w, "cols", f.cols); w.print(',');

        w.print("\"trp\":{");
        jnum(w, "latDeg", trpLatDeg); w.print(',');
        jnum(w, "lonDeg", trpLonDeg);
        w.print("},");

        w.print("\"gridGeom\":{");
        jint(w, "xOffsetM", f.xOffsetM); w.print(',');
        jint(w, "yOffsetM", f.yOffsetM); w.print(',');
        jint(w, "dxM", f.dxM); w.print(',');
        jint(w, "dyM", f.dyM); w.print(',');
        jnum(w, "rotationDeg", rotDeg);
        w.print("},");

        w.print("\"special\":{");
        jint(w, "attenuated", f.attenuated); w.print(',');
        jint(w, "apDetected", f.apDetected); w.print(',');
        jint(w, "badValue", f.badValue); w.print(',');
        jint(w, "noCoverage", f.noCoverage);
        w.print("},");

        jstr(w, "compression", nz(f.compression)); w.print(',');
        jint(w, "maxPrecipLevel", f.maxPrecipLevel); w.print(',');
        jint(w, "filledCells", f.filledCells); w.print(',');

        w.print("\"layout\":\"row-major\",");
        w.print("\"cells\":[");

        int total = f.grid.length;
        int limit = (maxCellsOut > 0) ? Math.min(total, maxCellsOut) : total;

        for (int i = 0; i < limit; i++) {
            if (i > 0) w.print(',');
            w.print(f.grid[i]);
        }
        w.print(']');

        if (limit < total) {
            w.print(",\"cellsTruncated\":true");
        }

        w.print('}');
        w.flush();

        return baos.toByteArray();
    }

    private static String isoNow() {
        return Instant.now().toString();
    }

    private static void jstr(PrintWriter w, String k, String v) {
        w.print('\"'); w.print(esc(k)); w.print('\"'); w.print(':');
        w.print('\"'); w.print(esc(v)); w.print('\"');
    }
    private static void jint(PrintWriter w, String k, int v) {
        w.print('\"'); w.print(esc(k)); w.print('\"'); w.print(':'); w.print(v);
    }
    private static void jnum(PrintWriter w, String k, double v) {
        w.print('\"'); w.print(esc(k)); w.print('\"'); w.print(':');
        w.print(Double.toString(v));
    }
    private static String nz(String s) { return (s == null) ? "" : s; }

    private static String esc(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\' -> sb.append("\\\\");
                case '"' -> sb.append("\\\"");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    // ---------------- POST with retry ----------------

    private static void postWithRetry(
            HttpClient http,
            URI url,
            String token,
            byte[] json,
            int requestTimeoutMs,
            int retrySleepMs
    ) throws InterruptedException {
        while (true) {
            try {
                HttpRequest.Builder b = HttpRequest.newBuilder(url)
                        .timeout(Duration.ofMillis(requestTimeoutMs))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofByteArray(json));

                // Optional auth header
                if (token != null && !token.isBlank()) {
                    b.header("X-WX-Token", token);
                }

                HttpRequest req = b.build();
                HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
                int code = resp.statusCode();
                if (code >= 200 && code < 300) return;

                System.err.println("WX POST failed: HTTP " + code);
                System.err.println("Response: " + resp.body());
            } catch (Exception e) {
                System.err.println("WX POST error: " + e.getMessage());
            }
            Thread.sleep(Math.max(50, retrySleepMs));
        }
    }

    // ---------------- JMS payload extraction ----------------

    private static InputStream extractXmlStream(Message msg, int maxBytes) throws JMSException {
        if (msg instanceof TextMessage tm) {
            String s = tm.getText();
            if (s == null || s.isBlank()) return null;
            if (s.length() > maxBytes) s = s.substring(0, maxBytes);
            return new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8));
        }
        if (msg instanceof BytesMessage bm) {
            long len = bm.getBodyLength();
            int take = (int) Math.min(len, (long) maxBytes);
            byte[] out = new byte[take];
            bm.readBytes(out);
            return new ByteArrayInputStream(out);
        }
        return null;
    }

    private static void trySet(XMLInputFactory f, String prop, Object value) {
        try { f.setProperty(prop, value); } catch (Exception ignored) {}
    }

    private static int parseInt(String s, int def) {
        if (s == null || s.isBlank()) return def;
        try {
            int dot = s.indexOf('.');
            String t = (dot >= 0) ? s.substring(0, dot) : s;
            return Integer.parseInt(t.trim());
        } catch (Exception e) {
            return def;
        }
    }

    private static int safeMul(int a, int b) {
        long x = (long) a * (long) b;
        if (x <= 0) return 0;
        if (x > Integer.MAX_VALUE) return Integer.MAX_VALUE;
        return (int) x;
    }

    private static int toInt(Object o, int def) {
        if (o == null) return def;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(o).trim()); } catch (Exception e) { return def; }
    }

    private static String normalizeJmsHostList(String raw) {
        if (raw == null) {
            return "";
        }
        String[] parts = raw.split(",");
        StringBuilder out = new StringBuilder(raw.length());
        for (String part : parts) {
            String token = part.trim();
            if (token.isEmpty()) {
                continue;
            }

            String normalized;
            int idx = token.indexOf("://");
            if (idx > 0 && idx + 3 < token.length()) {
                String scheme = token.substring(0, idx).toLowerCase(Locale.ROOT);
                String hostPort = token.substring(idx + 3);
                while (hostPort.endsWith("/")) {
                    hostPort = hostPort.substring(0, hostPort.length() - 1);
                }

                if (scheme.equals("tcps")) {
                    normalized = "smfs://" + hostPort;
                } else if (scheme.equals("tcp")) {
                    normalized = "smf://" + hostPort;
                } else if (scheme.equals("smfs") || scheme.equals("smf")) {
                    normalized = scheme + "://" + hostPort;
                } else {
                    normalized = token;
                }
            } else {
                while (token.endsWith("/")) {
                    token = token.substring(0, token.length() - 1);
                }
                normalized = token;
            }

            if (normalized.isEmpty()) {
                continue;
            }
            if (!out.isEmpty()) {
                out.append(',');
            }
            out.append(normalized);
        }
        return out.isEmpty() ? raw.trim() : out.toString();
    }

    // ---------------- Data model ----------------

    private static final class PrecipFrame {
        String receivedAt = "";
        int productId = -1;
        String productName = "";
        String site = "";
        String airport = "";

        int trpLatMicroDeg = 0;
        int trpLonMicroDeg = 0;

        int xOffsetM = 0;
        int yOffsetM = 0;
        int dxM = 0;
        int dyM = 0;
        int rotationMilliDeg = 0;

        int rows = -1;
        int cols = -1;

        int attenuated = 7;
        int apDetected = 8;
        int badValue = 9;
        int noCoverage = 15;

        String compression = "";
        int maxPrecipLevel = -1;

        int[] grid = null;
        int filledCells = -1;
    }

    // ---------------- Config ----------------

    private static final class Config {
        final String jmsUrl, vpn, username, password, queueName;

        final int receiveTimeoutMs, heartbeatMs;
        final int maxXmlBytes;

        final URI postUrl;               // defaults to localhost:8080/api/wx/radar
        final String ingestToken;        // optional (sent as X-WX-Token)
        final boolean printJson;

        final int httpConnectTimeoutMs;
        final int httpRequestTimeoutMs;
        final int retrySleepMs;

        final boolean ackOnException;    // default false
        final int maxCellsOut;           // 0 = all

        private Config(
                String jmsUrl, String vpn, String username, String password, String queueName,
                int receiveTimeoutMs, int heartbeatMs, int maxXmlBytes,
                URI postUrl, String ingestToken, boolean printJson,
                int httpConnectTimeoutMs, int httpRequestTimeoutMs, int retrySleepMs,
                boolean ackOnException, int maxCellsOut
        ) {
            this.jmsUrl = jmsUrl;
            this.vpn = vpn;
            this.username = username;
            this.password = password;
            this.queueName = queueName;

            this.receiveTimeoutMs = receiveTimeoutMs;
            this.heartbeatMs = heartbeatMs;
            this.maxXmlBytes = maxXmlBytes;

            this.postUrl = postUrl;
            this.ingestToken = ingestToken;
            this.printJson = printJson;

            this.httpConnectTimeoutMs = httpConnectTimeoutMs;
            this.httpRequestTimeoutMs = httpRequestTimeoutMs;
            this.retrySleepMs = retrySleepMs;

            this.ackOnException = ackOnException;
            this.maxCellsOut = maxCellsOut;
        }

        static Config fromEnv() {
            String url = must("SCDS_JMS_URL_ITWS");
            String vpn = must("SCDS_VPN_ITWS");
            String user = must("SCDS_USERNAME");
            String pass = must("SCDS_PASSWORD");
            String q = must("SCDS_QUEUE_ITWS");

            int rto = parseIntOrDefault(System.getenv("ITWS_RECEIVE_TIMEOUT_MS"), 1000);
            int hb  = parseIntOrDefault(System.getenv("ITWS_HEARTBEAT_MS"), 5000);
            int max = parseIntOrDefault(System.getenv("ITWS_MAX_XML_BYTES"), 32 * 1024 * 1024);

            // Posting target (default exactly what you asked)
            String postRaw = System.getenv("WX_POST_URL");
            URI postUrl = (postRaw == null || postRaw.isBlank())
                    ? URI.create("http://localhost:8080/api/wx/radar")
                    : URI.create(postRaw.trim());

            // Optional token header
            String token = System.getenv("ITWS_INGEST_TOKEN"); // optional

            boolean printJson = parseBoolOrDefault(System.getenv("ITWS_PRINT_JSON"), false);

            int cto = parseIntOrDefault(System.getenv("HTTP_CONNECT_TIMEOUT_MS"), 1500);
            int hto = parseIntOrDefault(System.getenv("HTTP_REQUEST_TIMEOUT_MS"), 2500);
            int rs  = parseIntOrDefault(System.getenv("HTTP_RETRY_SLEEP_MS"), 200);

            boolean ackOnEx = parseBoolOrDefault(System.getenv("ITWS_ACK_ON_EXCEPTION"), false);
            int maxCellsOut = parseIntOrDefault(System.getenv("ITWS_MAX_CELLS_OUT"), 0);

            return new Config(url, vpn, user, pass, q, rto, hb, max,
                    postUrl, token, printJson, cto, hto, rs, ackOnEx, maxCellsOut);
        }

        private static int parseIntOrDefault(String s, int def) {
            if (s == null || s.isBlank()) return def;
            try { return Integer.parseInt(s.trim()); } catch (Exception e) { return def; }
        }

        private static boolean parseBoolOrDefault(String s, boolean def) {
            if (s == null || s.isBlank()) return def;
            String v = s.trim().toLowerCase(Locale.ROOT);
            return v.equals("1") || v.equals("true") || v.equals("yes") || v.equals("y");
        }

        private static String must(String k) {
            String v = System.getenv(k);
            if (v == null || v.isBlank()) throw new IllegalArgumentException("Missing env var: " + k);
            return v;
        }
    }
}
