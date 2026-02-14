package dev.vstars;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.solacesystems.jms.SolConnectionFactory;
import com.solacesystems.jms.SolJmsUtility;

import javax.jms.*;
import javax.jms.Queue;
import javax.xml.stream.*;
import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

public final class TaisJsonConsumer {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // tags we try to extract (namespace-agnostic)
    private static final Set<String> WANTED_TAGS = Set.of(
            "acid",          // callsign
            "acAddress",     // ICAO 24-bit address
            "trackNum",      // STARS track number

            "assignedBeaconCode",
            "reportedBeaconCode",

            "flightRules",
            "rawFlightRules",

            "departureAirport",
            "destinationAirport"
    );

    public static void main(String[] args) throws Exception {
        Config cfg = Config.fromEnv();

        // HTTP client for posting to your Next endpoint (created once)
        final HttpClient http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(cfg.httpConnectTimeoutMs))
                .build();

        // Solace JMS ConnectionFactory programmatically
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

            XMLInputFactory xif = XMLInputFactory.newFactory();
            trySet(xif, XMLInputFactory.SUPPORT_DTD, false);
            trySet(xif, "javax.xml.stream.isSupportingExternalEntities", false);

            while (true) {
                Message msg = consumer.receive(1000);
                if (msg == null) continue;

                byte[] xmlBytes = extractPayloadBytes(msg, cfg.maxBytes);
                if (xmlBytes == null || xmlBytes.length == 0) {
                    msg.acknowledge();
                    continue;
                }

                Map<String, String> fields = parseMinimalFields(xif, new ByteArrayInputStream(xmlBytes));

                ObjectNode out = MAPPER.createObjectNode();
                out.put("receivedAt", Instant.now().toString());

                putIfPresent(out, "callsign", fields.get("acid"));
                putIfPresent(out, "icao24", fields.get("acAddress"));
                putIfPresent(out, "trackNum", fields.get("trackNum"));
                putIfPresent(out, "beaconCode", firstNonNull(fields, "assignedBeaconCode", "reportedBeaconCode"));

                putIfPresent(out, "flightRules", fields.get("flightRules"));
                putIfPresent(out, "rawFlightRules", fields.get("rawFlightRules"));
                out.put("rulesLabel", normalizeRules(fields.get("flightRules"), fields.get("rawFlightRules")));

                // Serialize once (then optionally print + post)
                final String json = MAPPER.writeValueAsString(out);

                if (cfg.printJson) {
                    System.out.println(json);
                }

                if (cfg.postUrl != null) {
                    // Retry POST until success, then ACK.
                    // This prevents message loss if your Next server is down.
                    postWithRetry(http, cfg.postUrl, cfg.ingestToken, json, cfg.httpRequestTimeoutMs, cfg.retrySleepMs);
                }

                msg.acknowledge();
            }
        }
    }

    private static void postWithRetry(
            HttpClient http,
            URI url,
            String token,
            String json,
            int requestTimeoutMs,
            int retrySleepMs
    ) throws InterruptedException {
        final byte[] body = json.getBytes(StandardCharsets.UTF_8);

        while (true) {
            try {
                HttpRequest req = HttpRequest.newBuilder(url)
                        .timeout(Duration.ofMillis(requestTimeoutMs))
                        .header("Content-Type", "application/json")
                        .header("X-TAIS-Token", token)
                        .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                        .build();

                HttpResponse<Void> resp = http.send(req, HttpResponse.BodyHandlers.discarding());
                int code = resp.statusCode();
                if ((code >= 200 && code < 300) || code == 204) return;

                System.err.println("POST failed: HTTP " + code);
            } catch (Exception e) {
                System.err.println("POST error: " + e.getMessage());
            }

            Thread.sleep(retrySleepMs);
        }
    }

    private static String normalizeRules(String flightRules, String rawFlightRules) {
        if (flightRules != null) {
            String v = flightRules.trim().toUpperCase(Locale.ROOT);
            if (v.equals("I") || v.equals("IFR")) return "IFR";
            if (v.equals("V") || v.equals("VFR")) return "VFR";
            if (v.equals("D") || v.equals("DVFR")) return "DVFR";
        }
        if (rawFlightRules != null) {
            String v = rawFlightRules.trim().toUpperCase(Locale.ROOT);
            if (v.equals("E")) return "IFR";
            if (v.equals("V")) return "VFR";
            if (v.equals("P")) return "VFR-ON-TOP";
        }
        return "UNKNOWN";
    }

    private static void putIfPresent(ObjectNode n, String key, String val) {
        if (val != null && !val.isBlank()) n.put(key, val);
    }

    private static String firstNonNull(Map<String, String> m, String... keys) {
        for (String k : keys) {
            String v = m.get(k);
            if (v != null && !v.isBlank()) return v;
        }
        return null;
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

    private static void trySet(XMLInputFactory f, String prop, Object value) {
        try { f.setProperty(prop, value); } catch (Exception ignored) {}
    }

    private static byte[] extractPayloadBytes(Message msg, int maxBytes) throws JMSException {
        if (msg instanceof BytesMessage bm) {
            long len = bm.getBodyLength();
            if (len <= 0) return new byte[0];
            if (len > maxBytes) {
                System.err.println("Dropping oversized BytesMessage: " + len + " bytes");
                return new byte[0];
            }
            byte[] out = new byte[(int) len];
            bm.readBytes(out);
            return out;
        }
        if (msg instanceof TextMessage tm) {
            String s = tm.getText();
            if (s == null) return new byte[0];
            byte[] out = s.getBytes(StandardCharsets.UTF_8);
            if (out.length > maxBytes) {
                System.err.println("Dropping oversized TextMessage: " + out.length + " bytes");
                return new byte[0];
            }
            return out;
        }
        return null;
    }

    private static Map<String, String> parseMinimalFields(XMLInputFactory xif, InputStream in)
            throws XMLStreamException {
        Map<String, String> out = new HashMap<>(16);
        XMLStreamReader r = xif.createXMLStreamReader(in);

        String currentKey = null;
        StringBuilder text = null;

        while (r.hasNext()) {
            int ev = r.next();

            if (ev == XMLStreamConstants.START_ELEMENT) {
                String local = localName(r);
                if (WANTED_TAGS.contains(local)) {
                    currentKey = local;
                    text = new StringBuilder(64);
                } else {
                    currentKey = null;
                    text = null;
                }
            } else if (ev == XMLStreamConstants.CHARACTERS || ev == XMLStreamConstants.CDATA) {
                if (text != null) text.append(r.getText());
            } else if (ev == XMLStreamConstants.END_ELEMENT) {
                String local = localName(r);
                if (currentKey != null && currentKey.equals(local) && text != null) {
                    String v = text.toString().trim();
                    if (!v.isEmpty()) out.put(currentKey, v);
                }
                currentKey = null;
                text = null;
            }
        }
        return out;
    }

    private static String localName(XMLStreamReader r) {
        String ln = r.getLocalName();
        if (ln != null && !ln.isBlank()) return ln;
        String n = r.getName() != null ? r.getName().toString() : null;
        if (n == null) return "";
        int idx = n.indexOf(':');
        return (idx >= 0 && idx + 1 < n.length()) ? n.substring(idx + 1) : n;
    }

    private static final class Config {
        final String jmsUrl;
        final String vpn;
        final String username;
        final String password;
        final String queueName;
        final int maxBytes;

        final URI postUrl;               // optional
        final String ingestToken;        // required if postUrl set
        final boolean printJson;

        final int httpConnectTimeoutMs;
        final int httpRequestTimeoutMs;
        final int retrySleepMs;

        private Config(
                String jmsUrl, String vpn, String username, String password, String queueName, int maxBytes,
                URI postUrl, String ingestToken, boolean printJson,
                int httpConnectTimeoutMs, int httpRequestTimeoutMs, int retrySleepMs
        ) {
            this.jmsUrl = jmsUrl;
            this.vpn = vpn;
            this.username = username;
            this.password = password;
            this.queueName = queueName;
            this.maxBytes = maxBytes;
            this.postUrl = postUrl;
            this.ingestToken = ingestToken;
            this.printJson = printJson;
            this.httpConnectTimeoutMs = httpConnectTimeoutMs;
            this.httpRequestTimeoutMs = httpRequestTimeoutMs;
            this.retrySleepMs = retrySleepMs;
        }

        static Config fromEnv() {
            String url = must("SCDS_JMS_URL_TAIS");
            String vpn = must("SCDS_VPN_TAIS");
            String user = must("SCDS_USERNAME");
            String pass = must("SCDS_PASSWORD");
            String q = must("SCDS_QUEUE_TAIS");
            int max = parseIntOrDefault(System.getenv("TAIS_MAX_BYTES"), 10 * 1024 * 1024);

            // Optional posting
            String post = System.getenv("FLIGHTRULES_POST_URL");
            URI postUrl = (post == null || post.isBlank()) ? null : URI.create(post.trim());

            // If posting, require token
            String token = System.getenv("TAIS_INGEST_TOKEN");
            if (postUrl != null && (token == null || token.isBlank())) {
                throw new IllegalArgumentException("FLIGHTRULES_POST_URL is set but TAIS_INGEST_TOKEN is missing");
            }

            boolean print = parseBoolOrDefault(System.getenv("PRINT_JSON"), true);

            int cto = parseIntOrDefault(System.getenv("HTTP_CONNECT_TIMEOUT_MS"), 1500);
            int rto = parseIntOrDefault(System.getenv("HTTP_REQUEST_TIMEOUT_MS"), 1500);
            int rs  = parseIntOrDefault(System.getenv("HTTP_RETRY_SLEEP_MS"), 200);

            return new Config(url, vpn, user, pass, q, max, postUrl, token, print, cto, rto, rs);
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
