package org.lanterned.app;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class LanternNativeUnitTest {
    @Test
    public void websocketAcceptKeyMatchesRfc6455Vector() {
        assertEquals(
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
            LanProtocol.websocketAcceptKey("dGhlIHNhbXBsZSBub25jZQ==")
        );
    }

    @Test
    public void base64RoundTripsArbitraryBytes() {
        byte[] sample = "LanternEd-Offline-MicroPack-2026".getBytes(StandardCharsets.UTF_8);
        String encoded = LanProtocol.base64Encode(sample);
        byte[] decoded = LanProtocol.base64Decode(encoded);
        assertArrayEquals(sample, decoded);
    }

    @Test
    public void frameEncodeAndReadHandlesShortAndMediumPayloads() throws Exception {
        String shortMsg = "{\"type\":\"whiteboard-sync\"}";
        byte[] shortFrame = LanProtocol.encodeFrame(0x1, shortMsg.getBytes(StandardCharsets.UTF_8));
        LanProtocol.WsFrame parsedShort = LanProtocol.readFrame(new ByteArrayInputStream(shortFrame));
        assertNotNull(parsedShort);
        assertEquals(0x1, parsedShort.opcode);
        assertEquals(shortMsg, new String(parsedShort.payload, StandardCharsets.UTF_8));

        String mediumMsg = "X".repeat(300);
        byte[] medFrame = LanProtocol.encodeFrame(0x1, mediumMsg.getBytes(StandardCharsets.UTF_8));
        LanProtocol.WsFrame parsedMed = LanProtocol.readFrame(new ByteArrayInputStream(medFrame));
        assertNotNull(parsedMed);
        assertEquals(300, parsedMed.payload.length);
        assertEquals(mediumMsg, new String(parsedMed.payload, StandardCharsets.UTF_8));
    }
}
