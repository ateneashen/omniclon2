import base64
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


def main():
    if len(sys.argv) > 1 and sys.argv[1].startswith('ws://'):
        url = sys.argv[1]
        out_path = sys.argv[2] if len(sys.argv) > 2 else 'C:/AI/OmniClon2/screenshots/omniclon2.png'
    elif len(sys.argv) > 1:
        url = discover_page_ws()
        out_path = sys.argv[1]
    else:
        url = discover_page_ws()
        out_path = 'C:/AI/OmniClon2/screenshots/omniclon2.png'

    ws = websocket.create_connection(url, timeout=15)
    ws.settimeout(15)
    next_id = 1

    def send(method, params=None):
        nonlocal next_id
        msg = {"id": next_id, "method": method}
        if params:
            msg["params"] = params
        ws.send(json.dumps(msg))
        next_id += 1
        return next_id - 1

    send("Page.enable")
    # Wait briefly for any pending rendering
    time.sleep(1.5)
    rid = send("Page.captureScreenshot", {"format": "png", "fromSurface": True})

    data = None
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            raw = ws.recv()
            msg = json.loads(raw)
            if msg.get("id") == rid and "result" in msg:
                data = msg["result"]["data"]
                break
        except websocket.WebSocketTimeoutException:
            break

    ws.close()

    if not data:
        print("No screenshot data")
        sys.exit(1)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'wb') as f:
        f.write(base64.b64decode(data))
    print(out_path)


if __name__ == "__main__":
    main()
