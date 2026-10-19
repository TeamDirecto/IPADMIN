import importlib.util
import pathlib
import unittest

mod_path = pathlib.Path(__file__).parents[1] / "ipmanager-verify.py"
spec = importlib.util.spec_from_file_location("ipm_verify", str(mod_path))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

BASE = """*filter
:INPUT ACCEPT [0:0]
:IPMANAGER-IN - [0:0]
-A INPUT -m comment --comment "IPMANAGER ENTRY" -j IPMANAGER-IN
-A IPMANAGER-IN -s 192.0.2.89/32 -p tcp -m multiport --dports 80,8080,8089,443 -m comment --comment "IPMANAGER TEST 2073_AliadosD2" -j ACCEPT
-A IPMANAGER-IN -s 192.0.2.89/32 -p udp -m multiport --dports 5060,8000:65000 -m comment --comment "IPMANAGER TEST 2073_AliadosD2" -j ACCEPT
COMMIT
"""


class VerifierTests(unittest.TestCase):
    def test_consistent(self):
        r = mod.inspect("192.0.2.89", BASE, BASE)
        self.assertEqual(r["status"], "CONSISTENT")
        self.assertEqual(len(r["runtime"]["rules"]), 2)
        self.assertEqual(r["runtime"]["rules"][0]["protocol"], "tcp")

    def test_drift(self):
        r = mod.inspect("192.0.2.89", BASE, BASE.replace("5060,8000:65000", "5060"))
        self.assertEqual(r["status"], "DRIFT")
        self.assertFalse(r["rules_match"])

    def test_absent(self):
        r = mod.inspect("192.0.2.1", BASE, BASE)
        self.assertEqual(r["status"], "ABSENT")

    def test_missing_jump(self):
        r = mod.inspect("192.0.2.89", BASE.replace(
            '-A INPUT -m comment --comment "IPMANAGER ENTRY" -j IPMANAGER-IN', ""), BASE)
        self.assertEqual(r["status"], "DRIFT")

    def test_no_subnet_false_positive(self):
        r = mod.inspect("192.0.2.8", BASE, BASE)
        self.assertEqual(r["status"], "ABSENT")


if __name__ == "__main__":
    unittest.main()
