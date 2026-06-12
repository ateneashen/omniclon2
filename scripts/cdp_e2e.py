import json
import os
import sys
import time
import urllib.request

for k in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'no_proxy']:
    os.environ.pop(k, None)

import websocket


def discover_page_ws():
    req = urllib.request.Request('http://127.0.0.1:9222/json/list')
    with urllib.request.urlopen(req, timeout=5) as resp:
        pages = json.loads(resp.read())
    for p in pages:
        if p.get('type') == 'page':
            return p['webSocketDebuggerUrl']
    raise RuntimeError('No page target found')


def send(ws, method, params=None):
    msg = {"id": send.next_id, "method": method}
    if params:
        msg["params"] = params
    ws.send(json.dumps(msg))
    send.next_id += 1
    return send.next_id - 1
send.next_id = 1


def evaluate(ws, expression, await_promise=True, timeout=60):
    rid = send(ws, "Runtime.evaluate", {
        "expression": expression,
        "awaitPromise": await_promise,
        "returnByValue": True,
        "timeout": timeout * 1000,
    })
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            raw = ws.recv()
            msg = json.loads(raw)
            print("[CDP]", raw[:300], file=sys.stderr)
            method = msg.get("method")
            if method == "Runtime.exceptionThrown":
                print("[JS EXCEPTION]", json.dumps(msg["params"], indent=2, default=str), file=sys.stderr)
            if msg.get("id") == rid and "result" in msg:
                res = msg["result"]["result"]
                if res.get("type") == 'string':
                    return res["value"]
                return res.get("value")
            if msg.get("id") == rid and "error" in msg:
                raise RuntimeError(msg["error"])
        except websocket.WebSocketTimeoutException:
            break
    raise RuntimeError("Timeout waiting for Runtime.evaluate")


def main():
    url = discover_page_ws()
    ws = websocket.create_connection(url, timeout=15)
    ws.settimeout(60)

    send(ws, "Runtime.enable")
    time.sleep(0.5)

    ref_path = "C:/AI/OmniClon2/data/temp_ref.wav"
    tauri_api_url = "/@fs/C:/AI/OmniClon2/frontend/node_modules/@tauri-apps/api/core.js"

    print("Extracting A-B segment...", file=sys.stderr)
    exported = evaluate(ws, f"""
        (async () => {{
            const {{ invoke }} = await import('{tauri_api_url}');
            const path = await invoke('extract_segment', {{
                path: '{ref_path}',
                startTime: 0,
                endTime: 5
            }});
            return JSON.stringify({{ success: true, exportedPath: path }});
        }})()
    """, await_promise=True, timeout=30)
    print(exported)

    data = json.loads(exported)
    exported_path = data["exportedPath"].replace('\\', '\\\\')

    print("Generating cloned voice...", file=sys.stderr)
    result_json = evaluate(ws, f"""
        (async () => {{
            const {{ invoke }} = await import('{tauri_api_url}');
            const resp = await invoke('generate', {{
                payload: {{
                    reference_audio_path: '{exported_path}',
                    text: 'Hola, esta es una prueba de clonación de voz con OmniClon 2.'
                }}
            }});
            return JSON.stringify(resp);
        }})()
    """, await_promise=True, timeout=120)
    result = json.loads(result_json)
    summary = {
        'success': result.get('success'),
        'model_used': result.get('model_used'),
        'duration_seconds': result.get('duration_seconds'),
        'audio_base64_length': len(result.get('audio_base64', '')),
        'sample_rate': result.get('sample_rate'),
        'error': result.get('error'),
    }
    print(json.dumps(summary, indent=2))

    out_path = 'C:/AI/OmniClon2/scripts/cdp_e2e_result.json'
    with open(out_path, 'w') as f:
        f.write(result_json)
    print('Full result saved to', out_path)

    ws.close()


if __name__ == "__main__":
    main()
