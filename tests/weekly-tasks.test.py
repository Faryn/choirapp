import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from weekly_tasks import parse_weekly_plan


class WeeklyTasksTest(unittest.TestCase):
    def test_parses_schedule_and_forwarded_date(self):
        message = """---------- Forwarded message ---------
Date: Tue, Sep 1, 2026 at 11:37 AM

*Wann*
*Was*
*Inhalt*
19.00
WUP
Einsingen
19.25
Thank you
auswendig am ganzen Song feilen
„Heys“ im Chorus etablieren
20.00
PAUSE + TALK
——————————
20.15
Nur ein Wort
durchsingen, proben, wo nötig
LG und bis morgen
"""
        self.assertEqual(parse_weekly_plan(message), {
            "date": "2026-09-01",
            "items": [
                {"time": "19:00", "activity": "WUP", "details": ["Einsingen"]},
                {"time": "19:25", "activity": "Thank you", "details": ["auswendig am ganzen Song feilen", "„Heys“ im Chorus etablieren"]},
                {"time": "20:00", "activity": "PAUSE + TALK", "details": []},
                {"time": "20:15", "activity": "Nur ein Wort", "details": ["durchsingen, proben, wo nötig"]},
            ],
        })


if __name__ == "__main__":
    unittest.main()
