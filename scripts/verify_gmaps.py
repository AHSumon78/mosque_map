import sys
import json
import math
import re

def haversine_meters(lat1, lon1, lat2, lon2):
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def verify(lat, lng, max_radius=20.0):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"success": False, "error": "Playwright not installed"}

    closest_dist = None
    closest_name = None
    found_match = False

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
            context = browser.new_context(locale='en-US')
            page = context.new_page()

            # Block heavy media, images, fonts, stylesheets for maximum speed
            page.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "stylesheet", "font", "media"] else route.continue_())

            url = f"https://www.google.com/maps/search/mosque/@{lat},{lng},19z"
            page.goto(url, timeout=9000, wait_until="domcontentloaded")
            page.wait_for_timeout(2200)

            links = page.locator("a").all()
            for link in links:
                href = link.get_attribute("href") or ""
                if "/maps/place/" in href:
                    m = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', href)
                    if m:
                        p_lat = float(m.group(1))
                        p_lng = float(m.group(2))
                        dist = haversine_meters(lat, lng, p_lat, p_lng)
                        name = link.get_attribute("aria-label") or "Mosque"
                        if closest_dist is None or dist < closest_dist:
                            closest_dist = dist
                            closest_name = name
                        if dist <= max_radius:
                            found_match = True

            browser.close()
            return {
                "success": True,
                "verified": found_match,
                "closest_name": closest_name,
                "distance_meters": round(closest_dist, 1) if closest_dist is not None else None
            }
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Missing lat/lng"}))
        sys.exit(1)

    lat_arg = float(sys.argv[1])
    lng_arg = float(sys.argv[2])
    radius_arg = float(sys.argv[3]) if len(sys.argv) > 3 else 20.0
    result = verify(lat_arg, lng_arg, radius_arg)
    print(json.dumps(result, ensure_ascii=False))
