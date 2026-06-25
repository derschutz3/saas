"""Captura screenshots da landing page."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.goto("http://localhost:3100/", wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(1000)
    # Screenshot da hero
    page.screenshot(path="screenshots/landing-hero.png", full_page=False)
    # Screenshot da página inteira
    page.screenshot(path="screenshots/landing-full.png", full_page=True)
    print("OK: hero + full capturados")
    browser.close()
