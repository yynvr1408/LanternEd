package org.lanterned.app;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;

/**
 * Dependency-free RFC-6455 WebSocket & Base64 helpers shared by Android runtime and JVM unit tests.
 */
final class LanProtocol {
    private static final String WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final char[] B64_ALPHABET =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();

    private LanProtocol() {}

    static String base64Encode(byte[] bytes) {
        StringBuilder sb = new StringBuilder(((bytes.length + 2) / 3) * 4);
        for (int i = 0; i < bytes.length; i += 3) {
            int b0 = bytes[i] & 0xFF;
            int b1 = (i + 1 < bytes.length) ? (bytes[i + 1] & 0xFF) : 0;
            int b2 = (i + 2 < bytes.length) ? (bytes[i + 2] & 0xFF) : 0;
            int triple = (b0 << 16) | (b1 << 8) | b2;
            sb.append(B64_ALPHABET[(triple >> 18) & 0x3F]);
            sb.append(B64_ALPHABET[(triple >> 12) & 0x3F]);
            sb.append((i + 1 < bytes.length) ? B64_ALPHABET[(triple >> 6) & 0x3F] : '=');
            sb.append((i + 2 < bytes.length) ? B64_ALPHABET[triple & 0x3F] : '=');
        }
        return sb.toString();
    }

    static byte[] base64Decode(String input) {
        String cleaned = input == null ? "" : input.replaceAll("\\s+", "");
        if (cleaned.isEmpty()) {
            return new byte[0];
        }
        int pad = 0;
        if (cleaned.endsWith("==")) pad = 2;
        else if (cleaned.endsWith("=")) pad = 1;

        int outLen = (cleaned.length() * 3) / 4 - pad;
        byte[] out = new byte[Math.max(0, outLen)];
        int idx = 0;
        for (int i = 0; i < cleaned.length(); i += 4) {
            int c0 = b64Val(cleaned.charAt(i));
            int c1 = (i + 1 < cleaned.length()) ? b64Val(cleaned.charAt(i + 1)) : 0;
            int c2 = (i + 2 < cleaned.length()) ? b64Val(cleaned.charAt(i + 2)) : 0;
            int c3 = (i + 3 < cleaned.length()) ? b64Val(cleaned.charAt(i + 3)) : 0;
            int triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
            if (idx < out.length) out[idx++] = (byte) ((triple >> 16) & 0xFF);
            if (idx < out.length) out[idx++] = (byte) ((triple >> 8) & 0xFF);
            if (idx < out.length) out[idx++] = (byte) (triple & 0xFF);
        }
        return out;
    }

    private static int b64Val(char c) {
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= 'a' && c <= 'z') return c - 'a' + 26;
        if (c >= '0' && c <= '9') return c - '0' + 52;
        if (c == '+') return 62;
        if (c == '/') return 63;
        return 0;
    }

    static String websocketAcceptKey(String clientKey) {
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            byte[] digest = sha1.digest((clientKey.trim() + WS_GUID).getBytes(StandardCharsets.UTF_8));
            return base64Encode(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-1 unavailable", e);
        }
    }

    static byte[] encodeFrame(int opcode, byte[] payload) {
        int len = payload.length;
        int headerLen = len < 126 ? 2 : (len <= 65535 ? 4 : 10);
        byte[] frame = new byte[headerLen + len];
        frame[0] = (byte) (0x80 | (opcode & 0x0F));
        if (len < 126) {
            frame[1] = (byte) len;
        } else if (len <= 65535) {
            frame[1] = 126;
            frame[2] = (byte) ((len >> 8) & 0xFF);
            frame[3] = (byte) (len & 0xFF);
        } else {
            frame[1] = 127;
            long l = len;
            for (int i = 0; i < 8; i++) {
                frame[2 + i] = (byte) ((l >> (56 - i * 8)) & 0xFF);
            }
        }
        System.arraycopy(payload, 0, frame, headerLen, len);
        return frame;
    }

    static final class WsFrame {
        final int opcode;
        final byte[] payload;

        WsFrame(int opcode, byte[] payload) {
            this.opcode = opcode;
            this.payload = payload;
        }
    }

    static WsFrame readFrame(InputStream in) throws IOException {
        int b0 = in.read();
        if (b0 < 0) return null;
        int b1 = in.read();
        if (b1 < 0) return null;

        int opcode = b0 & 0x0F;
        boolean masked = (b1 & 0x80) != 0;
        long len = b1 & 0x7F;
        if (len == 126) {
            byte[] ext = readExact(in, 2);
            len = ((ext[0] & 0xFF) << 8) | (ext[1] & 0xFF);
        } else if (len == 127) {
            byte[] ext = readExact(in, 8);
            len = 0;
            for (int i = 0; i < 8; i++) {
                len = (len << 8) | (ext[i] & 0xFF);
            }
        }
        if (len < 0 || len > 1_048_576) {
            return null;
        }
        byte[] maskKey = masked ? readExact(in, 4) : null;
        byte[] payload = readExact(in, (int) len);
        if (maskKey != null) {
            for (int i = 0; i < payload.length; i++) {
                payload[i] ^= maskKey[i % 4];
            }
        }
        return new WsFrame(opcode, payload);
    }

    private static byte[] readExact(InputStream in, int count) throws IOException {
        byte[] buf = new byte[count];
        int off = 0;
        while (off < count) {
            int n = in.read(buf, off, count - off);
            if (n < 0) {
                throw new EOFException("Unexpected end of stream");
            }
            off += n;
        }
        return Arrays.copyOf(buf, off);
    }
}
