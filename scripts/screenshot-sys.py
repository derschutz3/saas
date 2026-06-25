"""Captura screenshots do sistema."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.goto("http://localhost:3100/login", wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(1000)
    page.screenshot(path="screenshots/login-max.png", full_page=True)
    
    # Login
    page.get_by_text("MASTER ADMIN").click()
    page.wait_for_timeout(2000)
    page.screenshot(path="screenshots/dashboard-max.png", full_page=True)
    print("OK: login + dashboard capturados")
    browser.close()
