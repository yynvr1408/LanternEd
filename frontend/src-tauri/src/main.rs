// Prevents additional console window on Windows in release (only applied on Windows target)
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Command;
use tokio::sync::{broadcast, watch, Mutex, RwLock};

const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeResult {
    pub transcript: String,
    pub duration_seconds: u32,
    pub language: String,
    pub confidence: f32,
    pub is_stub: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanServerSession {
    pub class_id: String,
    pub title: String,
    pub local_ip: String,
    pub port: u16,
    pub ws_url: String,
    pub http_url: String,
    pub connected_students: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanServerStats {
    pub is_running: bool,
    pub class_id: Option<String>,
    pub local_ip: Option<String>,
    pub port: Option<u16>,
    pub ws_url: Option<String>,
    pub http_url: Option<String>,
    pub connected_students: usize,
    pub cached_pack_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceMetrics {
    pub os_name: String,
    pub arch: String,
    pub cpu_cores: usize,
    pub has_gpu_acceleration: bool,
    pub is_battery_saving: bool,
}

#[derive(Clone)]
struct CachedLanPack {
    content_type: String,
    sha256: String,
    bytes: Vec<u8>,
}

struct ActiveLanServer {
    class_id: String,
    title: String,
    local_ip: String,
    port: u16,
    shutdown_tx: watch::Sender<bool>,
    broadcast_tx: broadcast::Sender<String>,
    connected: Arc<AtomicUsize>,
    packs: Arc<RwLock<HashMap<String, CachedLanPack>>>,
}

#[derive(Default)]
struct LanHubState {
    active: Option<ActiveLanServer>,
}

fn detect_local_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

fn sha1_digest(input: &[u8]) -> [u8; 20] {
    let mut data = input.to_vec();
    let bit_len = (input.len() as u64).wrapping_mul(8);
    data.push(0x80);
    while (data.len() % 64) != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());

    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    for chunk in data.chunks_exact(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let [mut a, mut b, mut c, mut d, mut e] = h;
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDCu32),
                _ => (b ^ c ^ d, 0xCA62C1D6u32),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }

    let mut out = [0u8; 20];
    for (idx, word) in h.iter().enumerate() {
        out[idx * 4..idx * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(((bytes.len() + 2) / 3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3F) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3F) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn websocket_accept_key(client_key: &str) -> String {
    let combined = format!("{}{}", client_key.trim(), WS_GUID);
    base64_encode(&sha1_digest(combined.as_bytes()))
}

async fn send_ws_frame(stream: &mut TcpStream, opcode: u8, payload: &[u8]) -> std::io::Result<()> {
    let mut header = Vec::with_capacity(10);
    header.push(0x80 | (opcode & 0x0F));
    if payload.len() < 126 {
        header.push(payload.len() as u8);
    } else if payload.len() <= u16::MAX as usize {
        header.push(126);
        header.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    } else {
        header.push(127);
        header.extend_from_slice(&(payload.len() as u64).to_be_bytes());
    }
    stream.write_all(&header).await?;
    stream.write_all(payload).await?;
    stream.flush().await
}

async fn read_ws_frame(stream: &mut TcpStream) -> std::io::Result<Option<(u8, Vec<u8>)>> {
    let mut head = [0u8; 2];
    if stream.read_exact(&mut head).await.is_err() {
        return Ok(None);
    }
    let opcode = head[0] & 0x0F;
    let masked = (head[1] & 0x80) != 0;
    let mut len = (head[1] & 0x7F) as u64;
    if len == 126 {
        let mut ext = [0u8; 2];
        stream.read_exact(&mut ext).await?;
        len = u16::from_be_bytes(ext) as u64;
    } else if len == 127 {
        let mut ext = [0u8; 8];
        stream.read_exact(&mut ext).await?;
        len = u64::from_be_bytes(ext);
    }
    if len > 1_048_576 {
        return Ok(None);
    }
    let mask_key = if masked {
        let mut mk = [0u8; 4];
        stream.read_exact(&mut mk).await?;
        Some(mk)
    } else {
        None
    };
    let mut payload = vec![0u8; len as usize];
    if !payload.is_empty() {
        stream.read_exact(&mut payload).await?;
        if let Some(mk) = mask_key {
            for (i, byte) in payload.iter_mut().enumerate() {
                *byte ^= mk[i % 4];
            }
        }
    }
    Ok(Some((opcode, payload)))
}

async fn handle_client(
    mut stream: TcpStream,
    class_id: String,
    title: String,
    broadcast_tx: broadcast::Sender<String>,
    connected: Arc<AtomicUsize>,
    packs: Arc<RwLock<HashMap<String, CachedLanPack>>>,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let mut buf = Vec::with_capacity(4096);
    let mut tmp = [0u8; 2048];
    let header_end = loop {
        if *shutdown_rx.borrow() {
            return;
        }
        match stream.read(&mut tmp).await {
            Ok(0) | Err(_) => return,
            Ok(n) => {
                buf.extend_from_slice(&tmp[..n]);
                if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                    break pos;
                }
                if buf.len() > 16_384 {
                    return;
                }
            }
        }
    };

    let raw_req = String::from_utf8_lossy(&buf[..header_end]);
    let mut lines = raw_req.lines();
    let req_line = lines.next().unwrap_or("");
    let path = req_line.split_whitespace().nth(1).unwrap_or("/");

    let mut ws_key: Option<String> = None;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("sec-websocket-key") {
                ws_key = Some(v.trim().to_string());
            }
        }
    }

    if let Some(key) = ws_key {
        let accept = websocket_accept_key(&key);
        let handshake = format!(
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
            accept
        );
        if stream.write_all(handshake.as_bytes()).await.is_err() {
            return;
        }

        connected.fetch_add(1, Ordering::Relaxed);
        let mut rx = broadcast_tx.subscribe();
        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    let _ = send_ws_frame(&mut stream, 0x8, &[]).await;
                    break;
                }
                msg = rx.recv() => {
                    match msg {
                        Ok(text) => {
                            if send_ws_frame(&mut stream, 0x1, text.as_bytes()).await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
                frame = read_ws_frame(&mut stream) => {
                    match frame {
                        Ok(Some((0x1, payload))) => {
                            if let Ok(text) = String::from_utf8(payload) {
                                let _ = broadcast_tx.send(text);
                            }
                        }
                        Ok(Some((0x9, payload))) => {
                            let _ = send_ws_frame(&mut stream, 0xA, &payload).await;
                        }
                        _ => break,
                    }
                }
            }
        }
        connected.fetch_sub(1, Ordering::Relaxed);
        return;
    }

    // Plain HTTP pack & status endpoints for campus Wi-Fi peer distribution
    if let Some(pack_id) = path.strip_prefix("/packs/") {
        let map = packs.read().await;
        if let Some(pack) = map.get(pack_id) {
            let hdr = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nX-LanternEd-Sha256: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
                pack.content_type,
                pack.bytes.len(),
                pack.sha256
            );
            let _ = stream.write_all(hdr.as_bytes()).await;
            let _ = stream.write_all(&pack.bytes).await;
            return;
        }
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return;
    }

    let pack_ids: Vec<String> = packs.read().await.keys().cloned().collect();
    let body = serde_json::json!({
        "classId": class_id,
        "title": title,
        "connectedStudents": connected.load(Ordering::Relaxed),
        "packs": pack_ids,
    })
    .to_string();
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes()).await;
}

fn resolve_whisper_command() -> Option<String> {
    if let Ok(cmd) = std::env::var("LANTERNED_WHISPER_CMD") {
        let trimmed = cmd.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("whisper-cli"));
            candidates.push(dir.join("whisper-cli.exe"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        candidates.push(std::path::PathBuf::from("/opt/homebrew/bin/whisper-cli"));
        candidates.push(std::path::PathBuf::from("/usr/local/bin/whisper-cli"));
        candidates.push(std::path::PathBuf::from("/opt/homebrew/bin/whisper-cpp"));
    }
    #[cfg(target_os = "windows")]
    {
        candidates.push(std::path::PathBuf::from("C:\\Program Files\\whisper.cpp\\whisper-cli.exe"));
    }

    for cand in candidates {
        if cand.is_file() {
            return Some(cand.to_string_lossy().to_string());
        }
    }
    None
}

#[tauri::command]
async fn local_transcribe_audio(
    recording_id: String,
    audio_bytes: Vec<u8>,
) -> Result<TranscribeResult, String> {
    let byte_count = audio_bytes.len();
    let estimated_duration = ((byte_count / (16 * 1024)) as u32).max(15);

    if let (Some(cmd), Ok(model)) = (
        resolve_whisper_command(),
        std::env::var("LANTERNED_WHISPER_MODEL"),
    ) {
        if !model.trim().is_empty() {
            let tmp_path = std::env::temp_dir().join(format!("lanterned_{}.wav", recording_id));
            if tokio::fs::write(&tmp_path, &audio_bytes).await.is_ok() {
                let tmp_str = tmp_path.to_string_lossy().to_string();
                let output = Command::new(cmd.trim())
                    .args(["-m", model.trim(), "-f", &tmp_str, "--no-timestamps"])
                    .output()
                    .await;
                let _ = tokio::fs::remove_file(&tmp_path).await;
                if let Ok(out) = output {
                    if out.status.success() {
                        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
                        if !text.is_empty() {
                            return Ok(TranscribeResult {
                                transcript: text,
                                duration_seconds: estimated_duration,
                                language: "en".to_string(),
                                confidence: 0.96,
                                is_stub: false,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(TranscribeResult {
        transcript: format!(
            "Local Whisper CLI not configured for recording {}. Configure LANTERNED_WHISPER_CMD (or Homebrew whisper-cli) and LANTERNED_WHISPER_MODEL for offline inference.",
            recording_id
        ),
        duration_seconds: estimated_duration,
        language: "en".to_string(),
        confidence: 0.0,
        is_stub: true,
    })
}

#[tauri::command]
async fn start_lan_classroom_server(
    state: tauri::State<'_, Arc<Mutex<LanHubState>>>,
    class_id: String,
    title: String,
    port: u16,
) -> Result<LanServerSession, String> {
    let mut guard = state.lock().await;
    if let Some(prev) = guard.active.take() {
        let _ = prev.shutdown_tx.send(true);
    }

    let listener = match TcpListener::bind(("0.0.0.0", port)).await {
        Ok(l) => l,
        Err(_) => TcpListener::bind(("0.0.0.0", 0))
            .await
            .map_err(|e| format!("Failed to bind LAN server socket: {}", e))?,
    };
    let bound_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let local_ip = detect_local_ip();
    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
    let (broadcast_tx, _) = broadcast::channel::<String>(256);
    let connected = Arc::new(AtomicUsize::new(0));
    let packs = Arc::new(RwLock::new(HashMap::new()));

    let cid = class_id.clone();
    let ctitle = title.clone();
    let btx = broadcast_tx.clone();
    let conn_ref = connected.clone();
    let packs_ref = packs.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => break,
                accepted = listener.accept() => {
                    match accepted {
                        Ok((stream, _)) => {
                            tokio::spawn(handle_client(
                                stream,
                                cid.clone(),
                                ctitle.clone(),
                                btx.clone(),
                                conn_ref.clone(),
                                packs_ref.clone(),
                                shutdown_rx.clone(),
                            ));
                        }
                        Err(_) => break,
                    }
                }
            }
        }
    });

    guard.active = Some(ActiveLanServer {
        class_id: class_id.clone(),
        title,
        local_ip: local_ip.clone(),
        port: bound_port,
        shutdown_tx,
        broadcast_tx,
        connected: connected.clone(),
        packs,
    });

    Ok(LanServerSession {
        class_id,
        title: guard.active.as_ref().map(|a| a.title.clone()).unwrap_or_default(),
        local_ip: local_ip.clone(),
        port: bound_port,
        ws_url: format!("ws://{}:{}/lan-room", local_ip, bound_port),
        http_url: format!("http://{}:{}", local_ip, bound_port),
        connected_students: connected.load(Ordering::Relaxed),
    })
}

#[tauri::command]
async fn stop_lan_classroom_server(
    state: tauri::State<'_, Arc<Mutex<LanHubState>>>,
    class_id: String,
) -> Result<(), String> {
    let mut guard = state.lock().await;
    if let Some(prev) = guard.active.as_ref() {
        if prev.class_id == class_id || class_id.is_empty() {
            if let Some(stopped) = guard.active.take() {
                let _ = stopped.shutdown_tx.send(true);
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn broadcast_lan_message(
    state: tauri::State<'_, Arc<Mutex<LanHubState>>>,
    message: String,
) -> Result<usize, String> {
    let guard = state.lock().await;
    if let Some(srv) = guard.active.as_ref() {
        Ok(srv.broadcast_tx.send(message).unwrap_or(0))
    } else {
        Ok(0)
    }
}

#[tauri::command]
async fn register_lan_pack(
    state: tauri::State<'_, Arc<Mutex<LanHubState>>>,
    pack_id: String,
    content_type: String,
    sha256: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let guard = state.lock().await;
    let srv = guard
        .active
        .as_ref()
        .ok_or_else(|| "LAN classroom server is not running".to_string())?;
    let mut map = srv.packs.write().await;
    map.insert(
        pack_id.clone(),
        CachedLanPack {
            content_type,
            sha256,
            bytes,
        },
    );
    Ok(format!("http://{}:{}/packs/{}", srv.local_ip, srv.port, pack_id))
}

#[tauri::command]
async fn get_lan_server_stats(
    state: tauri::State<'_, Arc<Mutex<LanHubState>>>,
) -> Result<LanServerStats, String> {
    let guard = state.lock().await;
    if let Some(srv) = guard.active.as_ref() {
        let pack_count = srv.packs.read().await.len();
        Ok(LanServerStats {
            is_running: true,
            class_id: Some(srv.class_id.clone()),
            local_ip: Some(srv.local_ip.clone()),
            port: Some(srv.port),
            ws_url: Some(format!("ws://{}:{}/lan-room", srv.local_ip, srv.port)),
            http_url: Some(format!("http://{}:{}", srv.local_ip, srv.port)),
            connected_students: srv.connected.load(Ordering::Relaxed),
            cached_pack_count: pack_count,
        })
    } else {
        Ok(LanServerStats {
            is_running: false,
            class_id: None,
            local_ip: None,
            port: None,
            ws_url: None,
            http_url: None,
            connected_students: 0,
            cached_pack_count: 0,
        })
    }
}

#[tauri::command]
fn get_device_metrics() -> DeviceMetrics {
    let has_gpu_accel = cfg!(target_os = "macos") && std::env::consts::ARCH == "aarch64";
    DeviceMetrics {
        os_name: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_cores: num_cpus::get_physical(),
        has_gpu_acceleration: has_gpu_accel,
        is_battery_saving: false,
    }
}

mod num_cpus {
    pub fn get_physical() -> usize {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_accept_matches_rfc6455_vector() {
        // Canonical RFC 6455 Section 1.3 test vector
        assert_eq!(
            websocket_accept_key("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        );
    }

    #[test]
    fn device_metrics_reports_valid_host_info() {
        let m = get_device_metrics();
        assert!(!m.os_name.is_empty());
        assert!(!m.arch.is_empty());
        assert!(m.cpu_cores >= 1);
    }

    #[test]
    fn local_ip_returns_non_empty_addr() {
        let ip = detect_local_ip();
        assert!(!ip.is_empty());
    }
}

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(LanHubState::default())))
        .invoke_handler(tauri::generate_handler![
            local_transcribe_audio,
            start_lan_classroom_server,
            stop_lan_classroom_server,
            broadcast_lan_message,
            register_lan_pack,
            get_lan_server_stats,
            get_device_metrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running LanternEd desktop application");
}
