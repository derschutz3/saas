"""Test seed-sales-data with explicit cookie header."""
import json
import urllib.request
import urllib.error

# Login and capture cookie
login_data = json.dumps({"email": "admin@demo.com", "password": "admin123"}).encode()
req = urllib.request.Request("http://localhost:3103/api/v1/auth/login", data=login_data, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=10)
cookies = resp.getheader("Set-Cookie")
print(f"Set-Cookie: {cookies[:80]}...")

# Extract erp_session value
import re
m = re.search(r'erp_session=([^;]+)', cookies)
session_token = m.group(1) if m else None
print(f"Token: {session_token[:30]}...")

# Try seed-agent (control)
print("\n--- Test seed-agent (control) ---")
data = json.dumps({}).encode()
req2 = urllib.request.Request("http://localhost:3103/api/v1/dev/seed-agent", data=data, headers={"Content-Type": "application/json", "Cookie": f"erp_session={session_token}"})
try:
  resp2 = urllib.request.urlopen(req2, timeout=10)
  print(f"Status: {resp2.status}")
  print(f"Body: {resp2.read().decode()[:200]}")
except urllib.error.HTTPError as e:
  print(f"Status: {e.code}")
  print(f"Body: {e.read().decode()[:300]}")

# Try seed-sales-data
print("\n--- Test seed-sales-data ---")
data = json.dumps({"days": 5}).encode()
req3 = urllib.request.Request("http://localhost:3103/api/v1/dev/seed-sales-data", data=data, headers={"Content-Type": "application/json", "Cookie": f"erp_session={session_token}"})
try:
  resp3 = urllib.request.urlopen(req3, timeout=60)
  print(f"Status: {resp3.status}")
  print(f"Body: {resp3.read().decode()[:200]}")
except urllib.error.HTTPError as e:
  print(f"Status: {e.code}")
  print(f"Body: {e.read().decode()[:300]}")
