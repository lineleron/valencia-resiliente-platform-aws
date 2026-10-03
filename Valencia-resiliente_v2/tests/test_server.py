import http.client
import json
import re
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

import server as server_module
from server import Store, VTServer, evaluate_escalation, load_escalation_policy


class ConnectedDemoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        data = Path(cls.temporary.name)
        cls.store = Store(data / "vt01.db", data / "secret.key")
        cls.store.create_bootstrap_admin("principal", "Responsable de guardia", "SecurePassword123")
        cls.server = VTServer(("127.0.0.1", 0), cls.store, Path(__file__).parents[1] / "public")
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.temporary.cleanup()

    def request(self, method, path, payload=None, *, cookie=None, csrf=None, case_token=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {}
        body = None
        if payload is not None:
            body = json.dumps(payload)
            headers["Content-Type"] = "application/json"
        if cookie:
            headers["Cookie"] = cookie
        if csrf:
            headers["X-CSRF-Token"] = csrf
        if case_token:
            headers["X-Case-Token"] = case_token
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        response_headers = dict(response.getheaders())
        result = json.loads(raw.decode("utf-8")) if raw and "application/json" in response_headers.get("Content-Type", "") else raw
        connection.close()
        return response.status, result, response_headers

    def request_binary(self, method, path, payload, *, content_type, media_token=None, cookie=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Content-Type": content_type, "Content-Length": str(len(payload))}
        if media_token:
            headers["X-Media-Token"] = media_token
        if cookie:
            headers["Cookie"] = cookie
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        response_headers = dict(response.getheaders())
        result = json.loads(raw.decode("utf-8")) if raw and "application/json" in response_headers.get("Content-Type", "") else raw
        connection.close()
        return response.status, result, response_headers

    @staticmethod
    def cookie_from(headers):
        return headers["Set-Cookie"].split(";", 1)[0]

    def test_admin_dashboard_heatmap_feed_contract(self):
        first, _ = self.store.create_incident({
            "clientRequestId": "heatmap-fire-origin-001",
            "type": "fire",
            "zone": "CAMPANAR",
            "latitude": 39.4898,
            "longitude": -0.4021,
            "accuracyM": 8,
            "triageAnswers": {"danger": True, "knowsAction": False, "needsHelp": False},
            "automaticTriage": True,
            "triageTrace": {
                "alertId": "ALERT-DEMO-VALENCIA-02", "alertVersion": 1,
                "zoneId": "campanar", "responseId": "CK-HEATMAP-001",
            },
        }, trusted_triage=True)
        second, _ = self.store.create_incident({
            "clientRequestId": "heatmap-fire-latest-001",
            "type": "fire",
            "zone": "BENIMACLET",
            "latitude": 39.4975,
            "longitude": -0.3697,
            "accuracyM": 11,
            "triageAnswers": {"danger": True, "knowsAction": False, "needsHelp": False},
            "automaticTriage": True,
            "triageTrace": {
                "alertId": "ALERT-DEMO-VALENCIA-02", "alertVersion": 1,
                "zoneId": "benimaclet", "responseId": "CK-HEATMAP-002",
            },
        }, trusted_triage=True)
        fallback, _ = self.store.create_incident({
            "clientRequestId": "heatmap-flood-zone-001",
            "type": "rain",
            "zone": "POBLATS MARITIMS",
            "note": "Texto ciudadano que el feed no debe copiar",
        })
        hidden, _ = self.store.create_incident({
            "clientRequestId": "heatmap-no-location-001",
            "type": "other",
            "zone": "Ubicación todavía desconocida",
        })
        unclassified_exact, _ = self.store.create_incident({
            "clientRequestId": "heatmap-private-zone-001",
            "type": "other",
            "zone": "Carrer particular 12, puerta 4",
            "latitude": 39.4701,
            "longitude": -0.3761,
            "accuracyM": 15,
        })
        with self.store.connect() as db:
            db.execute(
                "UPDATE incidents SET created_at=?,updated_at=? WHERE public_id=?",
                ("2026-09-25T09:00:00Z", "2026-09-25T09:00:00Z", first["id"]),
            )
            db.execute(
                "UPDATE incidents SET created_at=?,updated_at=? WHERE public_id=?",
                ("2026-09-25T10:00:00Z", "2026-09-25T10:00:00Z", second["id"]),
            )

        status, _, headers = self.request(
            "POST", "/api/auth/login",
            {"username": "principal", "password": "SecurePassword123"},
        )
        self.assertEqual(status, 200)
        status, dashboard, _ = self.request(
            "GET", "/api/admin/dashboard", cookie=self.cookie_from(headers)
        )
        self.assertEqual(status, 200)

        feed = dashboard["heatmapFeed"]
        self.assertEqual(feed["schemaVersion"], 1)
        self.assertEqual(feed["generatedAt"], dashboard["serverTime"])
        self.assertEqual(feed["refreshAfterSeconds"], 5)
        self.assertEqual(feed["totals"]["points"], len(feed["points"]))
        self.assertEqual(set(feed["totals"]["byType"]), {"flood", "fire", "other"})

        by_source = {point["sourceId"]: point for point in feed["points"] if point["sourceKind"] == "incident"}
        exact = by_source[first["id"]]
        self.assertEqual((exact["type"], exact["reportedType"]), ("fire", "fire"))
        self.assertEqual((exact["severity"], exact["priority"], exact["intensity"]), ("high", "high", 0.75))
        self.assertEqual(exact["location"], {
            "latitude": 39.4898, "longitude": -0.4021, "precision": "exact",
            "accuracyM": 8.0, "zoneId": "campanar", "zoneCode": "CAMPANAR",
        })
        self.assertEqual(exact["observedAt"], "2026-09-25T09:00:00Z")

        zone_point = by_source[fallback["id"]]
        self.assertEqual((zone_point["type"], zone_point["reportedType"]), ("flood", "rain"))
        self.assertEqual(zone_point["location"]["precision"], "zone")
        self.assertEqual(zone_point["location"]["zoneId"], "poblats-maritims")
        self.assertAlmostEqual(zone_point["location"]["latitude"], 39.4688)
        self.assertAlmostEqual(zone_point["location"]["longitude"], -0.3318)
        self.assertNotIn(hidden["id"], by_source)
        private_zone_point = by_source[unclassified_exact["id"]]
        self.assertEqual(private_zone_point["location"]["precision"], "exact")
        self.assertIsNone(private_zone_point["location"]["zoneId"])
        self.assertIsNone(private_zone_point["location"]["zoneCode"])
        self.assertNotIn("Carrer particular", json.dumps(feed, ensure_ascii=False))

        safe_keys = {
            "id", "sourceKind", "sourceId", "emergencyId", "type", "reportedType",
            "severity", "priority", "intensity", "location", "observedAt", "updatedAt",
            "status", "sampleSize", "sequence", "isOrigin",
        }
        self.assertEqual(set(exact), safe_keys)
        self.assertNotIn("summary", exact)
        self.assertNotIn("clientRequestId", exact)

        fire_series = next(
            item for item in feed["series"]
            if item["emergencyId"] == "ALERT-DEMO-VALENCIA-02"
        )
        self.assertEqual(fire_series["originPointId"], "incident:" + first["id"])
        self.assertFalse(fire_series["originEstimated"])
        self.assertEqual(fire_series["originBasis"], "incident_report")
        self.assertEqual(fire_series["latestPointId"], "incident:" + second["id"])
        self.assertEqual(fire_series["reportCount"], 2)
        self.assertTrue(fire_series["propagation"]["estimated"])
        self.assertEqual(fire_series["propagation"]["basis"], "incident_reports")
        self.assertGreaterEqual(fire_series["propagation"]["directionDegrees"], 0)
        self.assertLess(fire_series["propagation"]["directionDegrees"], 360)
        self.assertGreater(fire_series["propagation"]["speedKmh"], 0)

        official = next(point for point in feed["points"] if point["sourceKind"] == "official_alert")
        self.assertIn(official["type"], {"flood", "fire", "other"})
        self.assertIn(official["severity"], {"low", "medium", "high", "critical"})
        self.assertEqual(official["location"]["precision"], "zone")
        official_only_series = next(
            item for item in feed["series"]
            if item["emergencyId"] == "ALERT-DEMO-VALENCIA-01"
        )
        self.assertTrue(official_only_series["originEstimated"])
        self.assertEqual(official_only_series["originBasis"], "official_zone_estimate")
        self.assertFalse(official_only_series["propagation"]["estimated"])

    def test_auth_roles_sync_and_idempotency(self):
        status, body, _ = self.request("GET", "/api/admin/dashboard")
        self.assertEqual((status, body["error"]), (401, "authentication_required"))

        status, body, _ = self.request("POST", "/api/auth/login", {"username": "principal", "password": "incorrecta"})
        self.assertEqual((status, body["error"]), (401, "invalid_credentials"))

        status, body, headers = self.request("POST", "/api/auth/login", {"username": "principal", "password": "SecurePassword123"})
        self.assertEqual(status, 200)
        super_cookie = self.cookie_from(headers)
        super_csrf = body["admin"]["csrfToken"]
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", headers["Set-Cookie"])

        status, body, _ = self.request("POST", "/api/admins", {
            "username": "operador1", "displayName": "Operador Uno", "role": "Operator"
        }, cookie=super_cookie, csrf=super_csrf)
        self.assertEqual(status, 201)
        temporary_password = body["admin"]["temporaryPassword"]
        self.assertTrue(body["admin"]["mustChangePassword"])

        status, body, headers = self.request("POST", "/api/auth/login", {"username": "operador1", "password": temporary_password})
        self.assertEqual(status, 200)
        operator_cookie = self.cookie_from(headers)
        operator_csrf = body["admin"]["csrfToken"]
        self.assertTrue(body["admin"]["mustChangePassword"])

        status, body, _ = self.request("GET", "/api/admin/dashboard", cookie=operator_cookie)
        self.assertEqual((status, body["error"]), (403, "password_change_required"))
        status, body, _ = self.request("POST", "/api/auth/change-password", {
            "currentPassword": temporary_password, "newPassword": "AnotherSecure456"
        }, cookie=operator_cookie)
        self.assertEqual((status, body["error"]), (403, "csrf_invalid"))
        status, body, _ = self.request("POST", "/api/auth/change-password", {
            "currentPassword": temporary_password, "newPassword": "AnotherSecure456"
        }, cookie=operator_cookie, csrf=operator_csrf)
        self.assertEqual(status, 200)

        status, body, _ = self.request("GET", "/api/auth/session", cookie=operator_cookie)
        self.assertEqual(status, 200)
        self.assertFalse(body["admin"]["mustChangePassword"])
        operator_csrf = body["admin"]["csrfToken"]
        status, body, _ = self.request("POST", "/api/admins", {
            "username": "intruso", "displayName": "No permitido", "role": "Operator"
        }, cookie=operator_cookie, csrf=operator_csrf)
        self.assertEqual((status, body["error"]), (403, "superadmin_required"))

        incident_payload = {
            "clientRequestId": "incident-integration-001",
            "type": "dana",
            "note": "Agua entrando en la vivienda",
            "zone": "POBLATS MARITIMS",
            "latitude": 39.4702,
            "longitude": -0.3768,
            "accuracyM": 12,
            "people": 2,
            "need": "Evacuación asistida",
            "citizenState": "trapped",
            "silent": False,
            "hasPhoto": True,
        }
        status, body, _ = self.request("POST", "/api/public/incidents", incident_payload)
        self.assertEqual(status, 201)
        incident = body["incident"]
        case_id, case_token = incident["id"], incident["accessToken"]
        self.assertRegex(case_id, r"^VT-\d{6}$")
        self.assertEqual(incident["photoCount"], 0, "A legacy hasPhoto flag must not count as real evidence")

        status, duplicate, _ = self.request("POST", "/api/public/incidents", incident_payload)
        self.assertEqual(status, 200)
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(duplicate["incident"]["id"], case_id)
        self.assertEqual(duplicate["incident"]["accessToken"], case_token)

        status, dashboard, _ = self.request("GET", "/api/admin/dashboard", cookie=operator_cookie)
        self.assertEqual(status, 200)
        self.assertIn(case_id, [item["id"] for item in dashboard["incidents"]])

        status, changed, _ = self.request("PATCH", "/api/admin/incidents/" + case_id, {
            "version": incident["version"],
            "status": "accepted",
            "priority": "high",
            "assignee": "Operador Uno",
            "instruction": "Suba a una planta elevada y espere instrucciones.",
            "delivery": "Enviado",
        }, cookie=operator_cookie, csrf=operator_csrf)
        self.assertEqual(status, 200)
        self.assertEqual(changed["incident"]["version"], incident["version"] + 1)

        status, citizen_case, _ = self.request("GET", "/api/public/incidents/" + case_id, case_token=case_token)
        self.assertEqual(status, 200)
        self.assertEqual(citizen_case["incident"]["status"], "accepted")
        self.assertIn("planta elevada", citizen_case["incident"]["instruction"])
        status, body, _ = self.request("GET", "/api/public/incidents/" + case_id, case_token="wrong")
        self.assertEqual((status, body["error"]), (404, "case_not_found"))

        status, body, _ = self.request("POST", "/api/public/checkins", {
            "clientRequestId": "checkin-integration-001",
            "alertId": "ALERT-DEMO-VALENCIA-01",
            "zone": "POBLATS MARITIMS",
            "applicable": True,
            "received": True,
            "understood": True,
            "canAct": False,
            "needsHelp": True,
            "reasons": ["mobility", "dependents"],
            "people": 2,
            "precision": "zone",
        })
        self.assertEqual(status, 201)
        status, dashboard, _ = self.request("GET", "/api/admin/dashboard", cookie=operator_cookie)
        aggregate = next(item for item in dashboard["checkinAggregates"] if item["zone"] == "POBLATS MARITIMS")
        self.assertEqual(aggregate["cannotAct"], 1)
        self.assertEqual(aggregate["peopleNeedingHelp"], 2)
        self.assertTrue(dashboard["publicAlerts"])
        self.assertTrue(dashboard["zoneCriticalities"])

        status, zones, _ = self.request("GET", "/api/public/zones")
        self.assertEqual(status, 200)
        self.assertIn("poblats-maritims", [item["id"] for item in zones["zones"]])
        status, alerts, _ = self.request("GET", "/api/public/alerts?zoneId=poblats-maritims&scope=local")
        self.assertEqual(status, 200)
        self.assertEqual(alerts["alerts"][0]["severity"], "critical")

        status, invalid_checkin, _ = self.request("POST", "/api/public/checkins", {
            "clientRequestId": "checkin-invalid-zone-001", "alertId": "ALERT-DEMO-VALENCIA-01",
            "zoneId": "zona-inexistente", "applicable": True, "received": True,
        })
        self.assertEqual((status, invalid_checkin["error"]), (400, "checkin_rejected"))

        png = b"\x89PNG\r\n\x1a\n" + b"demo-image-payload"
        status, intent, _ = self.request("POST", "/api/public/incidents/" + case_id + "/media-intents", {
            "kind": "image", "contentType": "image/png", "fileName": "situacion.png",
            "sizeBytes": len(png), "consent": True,
        }, case_token=case_token)
        self.assertEqual(status, 201)
        media_intent = intent["media"]
        status, uploaded, _ = self.request_binary(
            "PUT", media_intent["uploadUrl"], png, content_type="image/png", media_token=media_intent["uploadToken"]
        )
        self.assertEqual(status, 200)
        self.assertEqual(uploaded["media"]["analysis"]["mode"], "simulated")
        self.assertEqual(uploaded["media"]["sha256"], __import__("hashlib").sha256(png).hexdigest())

        status, dashboard, _ = self.request("GET", "/api/admin/dashboard", cookie=operator_cookie)
        media_item = next(item for item in dashboard["media"] if item["id"] == uploaded["media"]["id"])
        uploaded_incident = next(item for item in dashboard["incidents"] if item["id"] == case_id)
        self.assertEqual(uploaded_incident["photoCount"], 1)
        self.assertIn("/api/admin/media/", media_item["contentUrl"])
        status, reviewed, _ = self.request("PATCH", "/api/admin/media/" + media_item["id"] + "/review", {
            "humanStatus": "confirmed", "operatorPriority": "critical", "reason": "",
        }, cookie=operator_cookie, csrf=operator_csrf)
        self.assertEqual(status, 200)
        self.assertEqual(reviewed["media"]["analysis"]["humanStatus"], "confirmed")

        status, _, _ = self.request("GET", "/operador")
        self.assertEqual(status, 200)
        status, _, _ = self.request("GET", "/ciudadano")
        self.assertEqual(status, 200)

    def test_frontend_map_branding_and_shared_theme_assets(self):
        status, operator_raw, operator_headers = self.request("GET", "/operador")
        self.assertEqual(status, 200)
        operator_html = operator_raw.decode("utf-8")

        status, citizen_raw, _ = self.request("GET", "/ciudadano")
        self.assertEqual(status, 200)
        citizen_html = citizen_raw.decode("utf-8")

        # Both entry points use the same visual system while retaining a
        # recognisable favicon for their respective audience.
        self.assertIn('href="/assets/app-theme.css"', operator_html)
        self.assertIn('href="/assets/app-theme.css"', citizen_html)
        self.assertIn('href="/assets/favicon-control.svg"', operator_html)
        self.assertIn('href="/assets/favicon-citizen.svg"', citizen_html)

        for asset_path, expected_type in (
            ("/assets/app-theme.css", "text/css"),
            ("/assets/citizen-v2.css", "text/css"),
            ("/assets/operator-v2.css", "text/css"),
            ("/assets/favicon-control.svg", "image/svg+xml"),
            ("/assets/favicon-citizen.svg", "image/svg+xml"),
        ):
            asset_status, asset_body, asset_headers = self.request("GET", asset_path)
            self.assertEqual(asset_status, 200, asset_path)
            self.assertTrue(asset_body, asset_path)
            self.assertTrue(asset_headers["Content-Type"].startswith(expected_type), asset_path)

        _, theme_raw, _ = self.request("GET", "/assets/app-theme.css")
        theme_css = theme_raw.decode("utf-8").lower()
        for color in ("#f3f5f5", "#172126", "#0b6b70", "#a70f24", "#856000"):
            self.assertIn(color, theme_css)
        self.assertIn("#vt-dashboard", theme_css)
        self.assertIn("#vt-citizen-preview", theme_css)

        # Leaflet is served locally so the application logic does not depend on
        # a third-party JavaScript CDN. Only the map imagery is remote.
        self.assertIn('href="/assets/leaflet/leaflet.css"', operator_html)
        self.assertIn('src="/assets/leaflet/leaflet.js"', operator_html)
        for asset_path, expected_type in (
            ("/assets/leaflet/leaflet.css", "text/css"),
            ("/assets/leaflet/leaflet.js", "application/javascript"),
        ):
            asset_status, asset_body, asset_headers = self.request("GET", asset_path)
            self.assertEqual(asset_status, 200, asset_path)
            self.assertTrue(asset_body, asset_path)
            self.assertTrue(asset_headers["Content-Type"].startswith(expected_type), asset_path)

        # Keep the interactive map and custom incident markers wired into the
        # operator page, including visible provider attribution.
        self.assertIn('id="v-street-map"', operator_html)
        self.assertIn("L.map(", operator_html)
        self.assertIn("L.divIcon(", operator_html)
        self.assertIn("tile.openstreetmap.org", operator_html)
        self.assertIn("OpenStreetMap", operator_html)

        csp = operator_headers["Content-Security-Policy"]
        self.assertIn("img-src 'self' data: blob: https://tile.openstreetmap.org", csp)

    def test_configurable_voice_triage_and_automatic_incident(self):
        policy = load_escalation_policy()
        self.assertEqual(policy["version"], 1)
        self.assertEqual([item["id"] for item in policy["questions"]], ["danger", "knowsAction", "needsHelp"])
        expected = {
            (True, False, False): ("high", True, True),
            (True, False, True): ("critical", True, True),
            (True, True, False): ("pending", False, False),
            (True, True, True): ("high", True, False),
            (False, False, False): ("pending", False, False),
            (False, False, True): ("pending", False, False),
            (False, True, False): ("pending", False, False),
            (False, True, True): ("high", True, False),
        }
        for answers, outcome in expected.items():
            decision = evaluate_escalation({"danger": answers[0], "knowsAction": answers[1], "needsHelp": answers[2]})
            self.assertEqual((decision["priority"], decision["createIncident"], decision["offerEmergencyCall"]), outcome)

        status, policy_body, _ = self.request("GET", "/api/public/escalation-policy")
        self.assertEqual(status, 200)
        self.assertEqual(policy_body["policy"]["callMode"], "one_tap")

        base = {
            "alertId": "ALERT-DEMO-VALENCIA-01", "alertVersion": 2,
            "policyVersion": 999,
            "zoneId": "poblats-maritims", "applicable": True, "received": True,
            "understood": False, "canAct": False, "danger": True,
            "knowsAction": False, "reasons": [], "people": 1, "precision": "zone",
        }
        high_payload = dict(base, clientRequestId="voice-triage-high-001", needsHelp=False, priority="critical")
        status, high, _ = self.request("POST", "/api/public/checkins", high_payload)
        self.assertEqual(status, 201)
        self.assertEqual(high["escalation"]["priority"], "high")
        self.assertTrue(high["escalation"]["offerEmergencyCall"])
        self.assertEqual(high["incident"]["priority"], "high")
        self.assertTrue(high["incident"]["triage"]["automatic"])
        self.assertEqual(high["incident"]["triage"]["alertId"], base["alertId"])
        self.assertEqual(high["incident"]["triage"]["alertVersion"], base["alertVersion"])
        self.assertEqual(high["incident"]["triage"]["zoneId"], base["zoneId"])
        self.assertEqual(high["incident"]["triage"]["responseId"], high["response"]["id"])
        self.assertEqual(high["incident"]["triage"]["policyVersion"], policy["version"])
        self.assertEqual(high["incident"]["triage"]["ruleId"], "high-danger-no-guidance")
        self.assertTrue(high["incident"]["triage"]["policyVersionMismatch"])
        high_id = high["incident"]["id"]

        status, duplicate, _ = self.request("POST", "/api/public/checkins", high_payload)
        self.assertEqual(status, 200)
        self.assertEqual(duplicate["incident"]["id"], high_id)

        critical_payload = dict(base, clientRequestId="voice-triage-critical-001", needsHelp=True)
        status, critical, _ = self.request("POST", "/api/public/checkins", critical_payload)
        self.assertEqual(status, 201)
        self.assertEqual(critical["incident"]["priority"], "critical")

        normal_payload = dict(
            base, clientRequestId="voice-triage-normal-001", danger=False,
            knowsAction=True, understood=True, canAct=True, needsHelp=False, priority="critical",
        )
        status, normal, _ = self.request("POST", "/api/public/checkins", normal_payload)
        self.assertEqual(status, 201)
        self.assertFalse(normal["escalation"]["offerEmergencyCall"])
        self.assertIsNone(normal["incident"])

    def test_public_incident_cannot_spoof_automatic_triage(self):
        status, body, _ = self.request("POST", "/api/public/incidents", {
            "clientRequestId": "spoofed-public-triage-001",
            "type": "fire", "zone": "CAMPANAR", "priority": "critical",
            "automaticTriage": True,
            "triageAnswers": {"danger": True, "knowsAction": False, "needsHelp": True},
        })
        self.assertEqual(status, 201)
        self.assertEqual(body["incident"]["priority"], "pending")
        self.assertEqual(body["incident"]["triage"], {})
        original = body["incident"]

        status, duplicate, _ = self.request("POST", "/api/public/incidents", {
            "clientRequestId": "spoofed-public-triage-001",
            "type": "dana", "zone": "POBLATS MARITIMS", "note": "contenido cambiado",
        })
        self.assertEqual(status, 200)
        self.assertEqual(duplicate["incident"]["id"], original["id"])
        self.assertEqual(duplicate["incident"]["type"], original["type"])
        self.assertEqual(duplicate["incident"]["zone"], original["zone"])
        self.assertEqual(duplicate["incident"]["summary"], original["summary"])

    def test_checkin_uses_persisted_applicability_and_is_immutable(self):
        client_id = "immutable-checkin-001"
        first = {
            "clientRequestId": client_id,
            "alertId": "ALERT-DEMO-VALENCIA-01", "alertVersion": 2,
            "policyVersion": 999, "zoneId": "poblats-maritims",
            "applicable": False, "received": True,
            "danger": True, "knowsAction": False, "needsHelp": True,
        }
        status, original, _ = self.request("POST", "/api/public/checkins", first)
        self.assertEqual(status, 201)
        self.assertFalse(original["response"]["applicable"])
        self.assertFalse(original["response"]["received"])
        self.assertIsNone(original["response"]["danger"])
        self.assertIsNone(original["response"]["knowsAction"])
        self.assertIsNone(original["response"]["needsHelp"])
        self.assertEqual(original["escalation"]["answers"], {})
        self.assertIsNone(original["incident"])
        self.assertTrue(original["escalation"]["policyVersionMismatch"])

        changed = dict(first, applicable=True, received=True, policyVersion=1)
        status, duplicate, _ = self.request("POST", "/api/public/checkins", changed)
        self.assertEqual(status, 200)
        self.assertEqual(duplicate["response"]["id"], original["response"]["id"])
        self.assertFalse(duplicate["response"]["applicable"])
        self.assertFalse(duplicate["response"]["received"])
        self.assertEqual(duplicate["response"]["clientPolicyVersion"], 999)
        self.assertEqual(duplicate["escalation"]["answers"], {})
        self.assertIsNone(duplicate["incident"])

    def test_idempotency_is_race_safe(self):
        incident_payload = {
            "clientRequestId": "concurrent-incident-001", "type": "rain",
            "zone": "QUATRE CARRERES", "note": "Solicitud concurrente",
        }
        barrier = threading.Barrier(8)

        def create_once(_):
            barrier.wait()
            return self.store.create_incident(incident_payload)

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(create_once, range(8)))
        self.assertEqual(sum(1 for _, created in results if created), 1)
        self.assertEqual(len({incident["id"] for incident, _ in results}), 1)
        with self.store.connect() as db:
            count = db.execute(
                "SELECT count(*) FROM incidents WHERE client_request_id=?",
                (incident_payload["clientRequestId"],),
            ).fetchone()[0]
        self.assertEqual(count, 1)

        checkin_payload = {
            "clientRequestId": "concurrent-checkin-001",
            "alertId": "ALERT-DEMO-VALENCIA-01", "alertVersion": 2,
            "zoneId": "poblats-maritims", "applicable": True, "received": True,
            "danger": False, "knowsAction": True, "needsHelp": False,
        }
        barrier = threading.Barrier(8)

        def checkin_once(_):
            barrier.wait()
            return self.store.upsert_checkin(checkin_payload)

        with ThreadPoolExecutor(max_workers=8) as executor:
            responses = list(executor.map(checkin_once, range(8)))
        self.assertEqual(sum(1 for _, created in responses if created), 1)
        self.assertEqual(len({response["id"] for response, _ in responses}), 1)
        with self.store.connect() as db:
            count = db.execute(
                "SELECT count(*) FROM alert_responses WHERE client_request_id=?",
                (checkin_payload["clientRequestId"],),
            ).fetchone()[0]
        self.assertEqual(count, 1)

    def test_invalid_policy_structure_fails_closed(self):
        valid = json.loads((Path(__file__).parents[1] / "config" / "escalation-policy.json").read_text(encoding="utf-8"))
        cases = []
        duplicate_question = json.loads(json.dumps(valid))
        duplicate_question["questions"][2]["id"] = "danger"
        cases.append(duplicate_question)
        duplicate_rule = json.loads(json.dumps(valid))
        duplicate_rule["rules"][1]["id"] = duplicate_rule["rules"][0]["id"]
        cases.append(duplicate_rule)
        with tempfile.TemporaryDirectory() as directory:
            policy_path = Path(directory) / "policy.json"
            with mock.patch.object(server_module, "ESCALATION_POLICY_PATH", policy_path):
                for invalid in cases:
                    policy_path.write_text(json.dumps(invalid), encoding="utf-8")
                    policy = load_escalation_policy()
                    self.assertEqual(policy["version"], 0)
                    self.assertEqual(policy["questions"], [])
                    self.assertEqual(policy["rules"], [])

    def test_operator_language_selector_and_i18n_asset_contract(self):
        status, operator_raw, _ = self.request("GET", "/operador")
        self.assertEqual(status, 200)
        operator_html = operator_raw.decode("utf-8")

        # The chooser can be one global control, or one control in each view.
        # Either way, operators must be able to switch before and after login.
        language_selectors = []
        for match in re.finditer(
            r'<select\b(?P<attrs>[^>]*)>(?P<options>.*?)</select>',
            operator_html,
            re.DOTALL,
        ):
            attributes = match.group("attrs")
            if "data-language-switch" in attributes or 'id="operator-language"' in attributes:
                language_selectors.append((attributes, match.group("options")))
        self.assertTrue(language_selectors, "Falta un selector de idioma del operador")

        selector_ids = {
            id_match.group(1)
            for attributes, _ in language_selectors
            if (id_match := re.search(r'\bid="([^"]+)"', attributes))
        }
        has_global_selector = "operator-language" in selector_ids
        has_per_view_selectors = {"login-language", "session-language"} <= selector_ids
        self.assertTrue(
            has_global_selector or has_per_view_selectors,
            "El idioma debe poder cambiarse tanto antes como después de iniciar sesión",
        )

        for attributes, options in language_selectors:
            self.assertNotIn("hidden", attributes)
            self.assertIn("aria-label=", attributes)
            option_values = re.findall(r'<option\b[^>]*\bvalue="([^"]+)"', options)
            self.assertEqual(option_values, ["es", "val", "en"])

        # Initialise translations before the authenticated application starts,
        # including on the login and forced-password screens.
        i18n_script = 'src="/assets/operator-i18n.js"'
        app_script = 'src="/assets/operator-app.js"'
        self.assertIn(i18n_script, operator_html)
        self.assertIn(app_script, operator_html)
        self.assertLess(operator_html.index(i18n_script), operator_html.index(app_script))

        asset_status, asset_raw, asset_headers = self.request("GET", "/assets/operator-i18n.js")
        self.assertEqual(asset_status, 200)
        self.assertTrue(asset_headers["Content-Type"].startswith("application/javascript"))
        i18n_js = asset_raw.decode("utf-8")
        self.assertTrue(i18n_js.strip())
        self.assertIn("window.VT01I18n", i18n_js)
        for method in ("setLanguage", "getLanguage", "refresh"):
            self.assertRegex(i18n_js, rf"\b{method}\b")
        self.assertIn("vt01.operator.language", i18n_js)
        for storage_method in ("getItem", "setItem"):
            self.assertRegex(i18n_js, rf"localStorage\.{storage_method}\b")
        self.assertIn("ca-valencia", i18n_js)

        # Translation is a presentation concern: it must not make API calls or
        # rewrite form/domain values that operator-app.js sends to the server.
        self.assertNotIn("fetch(", i18n_js)
        self.assertNotIn("XMLHttpRequest", i18n_js)
        self.assertNotIn("/api/", i18n_js)
        self.assertNotRegex(i18n_js, r"setAttribute\(\s*['\"]value['\"]")
        compact_html = re.sub(r"\s+", "", operator_html)
        for canonical_contract in (
            'value="Operator"',
            'value="SuperAdmin"',
            'status:["ringing","accepted","closed"]',
            'priority:["pending","critical","high","medium","low"]',
            'verification:["review","confirmed","unconfirmed"]',
            'delivery:["","Enviado","Recibido","Leído"]',
            'photo:remote.mediaRequests&&["none","requested","received"]',
            'video:remote.mediaRequests&&["none","requested","received"]',
        ):
            self.assertIn(canonical_contract, compact_html)


if __name__ == "__main__":
    unittest.main()
