import json
import os
import sys
import time
import urllib.request

# Prevent websocket-client from routing loopback traffic through an HTTP proxy.
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
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        url = discover_page_ws()
    print('Connecting to', url, file=sys.stderr)

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

    # Install error/console capture on page first via Runtime.evaluate
    send("Runtime.enable")
    send("Log.enable")
    send("Console.enable")

    # Inject global error / console capture
    send("Runtime.evaluate", {
        "expression": """
            if (!window.__omniclon_captured) {
                window.__omniclon_errors = [];
                window.__omniclon_logs = [];
                window.addEventListener('error', function(e) {
                    window.__omniclon_errors.push({msg: e.message, file: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack});
                });
                ['log','warn','error','info'].forEach(function(lvl) {
                    var orig = console[lvl];
                    console[lvl] = function() {
                        window.__omniclon_logs.push({level: lvl, args: Array.from(arguments).map(String)});
                        orig.apply(console, arguments);
                    };
                });
                window.__omniclon_captured = true;
            }
            'injected';
        """,
        "returnByValue": True
    })

    # Wait a moment to collect logs
    time.sleep(2)

    # Evaluate state
    rid = send("Runtime.evaluate", {
        "expression": """
            JSON.stringify({
                title: document.title,
                url: location.href,
                readyState: document.readyState,
                errors: window.__omniclon_errors || [],
                logs: window.__omniclon_logs || []
            })
        """,
        "returnByValue": True
    })

    state = None
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            raw = ws.recv()
            msg = json.loads(raw)
            if msg.get("id") == rid and "result" in msg:
                state = json.loads(msg["result"]["result"]["value"])
                break
            elif "method" in msg:
                # Print live console / exception events
                m = msg["method"]
                if m == "Runtime.exceptionThrown":
                    print("[EXCEPTION]", json.dumps(msg["params"], indent=2, default=str))
                elif m == "Runtime.consoleAPICalled":
                    print("[CONSOLE]", msg["params"].get("type"), [str(i.get("value", i.get("description", "")))[:200] for i in msg["params"].get("args", [])])
        except websocket.WebSocketTimeoutException:
            break

    if state:
        print(json.dumps(state, indent=2, default=str))
    else:
        print("No state response")

    ws.close()

if __name__ == "__main__":
    main()
