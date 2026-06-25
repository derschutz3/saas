"""Debug login no front."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context().new_page()
    
    msgs = []
    page.on("console", lambda m: msgs.append(f"{m.type}: {m.text}"))
    page.on("requestfailed", lambda r: msgs.append(f"FAIL: {r.url} {r.failure}"))
    page.on("response", lambda r: msgs.append(f"RES {r.status} {r.url}") if "auth" in r.url else None)
    
    page.goto("http://localhost:3100/login", wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(1000)
    
    # Preencher credenciais via input nativo
    page.fill("input[type='email']", "admin@demo.com")
    page.fill("input[type='password']", "admin123")
    
    # Clicar AUTENTICAR
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    print("URL FINAL:", page.url)
    print("\n--- MESSAGES ---")
    for m in msgs[:30]:
        print(m)
    page.screenshot(path="screenshots/login-debug.png", full_page=True)
    browser.close()
