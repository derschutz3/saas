"""Test all report endpoints."""
import json
import urllib.request
import urllib.error
import http.cookiejar
from datetime import datetime, timedelta, timezone

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# Login
login_data = json.dumps({"email": "admin@demo.com", "password": "admin123"}).encode()
req = urllib.request.Request("http://localhost:3103/api/v1/auth/login", data=login_data, headers={"Content-Type": "application/json"})
opener.open(req, timeout=10)

now = datetime.now(timezone.utc)
from_dt = (now - timedelta(days=30)).isoformat().replace("+00:00", "Z")
to_dt = now.isoformat().replace("+00:00", "Z")
print(f"Período: {from_dt} → {to_dt}")

def call(path, extra_params=None):
    params = {"from": from_dt, "to": to_dt}
    if extra_params:
      params.update(extra_params)
    qs = urllib.parse.urlencode(params)
    url = f"http://localhost:3103/api/v1/reports{path}?{qs}"
    r = urllib.request.Request(url)
    try:
      resp = opener.open(r, timeout=30)
      return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
      return {"error": e.code, "body": e.read().decode()[:300]}

import urllib.parse

print("\n=== OVERVIEW ===")
ov = call("/sales/overview")
print(f"  Total: R$ {ov.get('kpis', {}).get('totalRevenueCents', 0) / 100:.2f}")
print(f"  Orders: {ov.get('kpis', {}).get('totalOrders', 0)}")
print(f"  Ticket: R$ {ov.get('kpis', {}).get('avgTicketCents', 0) / 100:.2f}")
print(f"  Customers: {ov.get('kpis', {}).get('uniqueCustomers', 0)}")
print(f"  Growth: {ov.get('growth', {}).get('revenuePct', 0):.1f}%")

print("\n=== TIMESERIES (day) ===")
ts = call("/sales/timeseries", {"granularity": "day"})
if "series" in ts:
  print(f"  Pontos: {len(ts['series'])}")
  non_zero = [s for s in ts["series"] if s.get("revenueCents", 0) > 0]
  print(f"  Com vendas: {len(non_zero)}")
  for s in non_zero[:5]:
    print(f"    {s['date']}: R$ {s['revenueCents'] / 100:.2f} ({s['orders']} pedidos)")

print("\n=== TOP PRODUTOS (revenue) ===")
tp = call("/sales/products", {"limit": 5})
for p in tp.get("items", []):
  print(f"  {p['productName'][:30]:30} | qty={p['quantitySold']:3} | R$ {p['revenueCents'] / 100:8.2f}")

print("\n=== CANAIS ===")
ch = call("/sales/channels")
for c in ch.get("items", []):
  print(f"  {c['channel']:15} | {c['orders']:3} pedidos | R$ {c['revenueCents'] / 100:8.2f} | {c['percentage']:.1f}%")

print("\n=== TOP CLIENTES ===")
tc = call("/sales/customers", {"limit": 5})
for c in tc.get("items", []):
  print(f"  {(c.get('customerName') or 'Anonimo')[:30]:30} | {c['orders']:3} pedidos | R$ {c['revenueCents'] / 100:8.2f}")

print("\n=== EXPORT CSV (primeiras 5 linhas) ===")
url = f"http://localhost:3103/api/v1/reports/sales/export?from={from_dt}&to={to_dt}&format=csv"
r = urllib.request.Request(url)
resp = opener.open(r, timeout=30)
csv_content = resp.read().decode()
for line in csv_content.split("\n")[:5]:
  print(f"  {line[:120]}")
print(f"  Total linhas: {len(csv_content.split(chr(10)))}")
