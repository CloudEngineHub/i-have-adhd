#!/usr/bin/env python3
"""Guards against locale drift in the Zed install instructions.

Zed loads skills from `~/.agents/skills/` and `<worktree>/.agents/skills/` and
supports no custom search paths, so that is the only directory INSTALL can tell
a user to copy into. The English file and its five translations are edited by
hand, and two of them had already drifted to `~/.config/zed/skills/` (a
directory Zed does not read) with no check catching it. These tests fail if any
locale points at a directory Zed ignores, or if a locale half-updates and keeps
both spellings.
"""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSTALL_FILES = (
    ROOT / "INSTALL.md",
    *sorted((ROOT / ".github" / "install").glob("INSTALL.*.md")),
)
# Zed reads skills only from these two roots; a custom path is not supported.
WRONG_ZED_SKILLS_PATH = "~/.config/zed/skills"
RIGHT_ZED_SKILLS_PATH = "~/.agents/skills"


class ZedInstallPathTest(unittest.TestCase):
    def test_every_locale_is_discovered(self) -> None:
        # Guards the glob above: a rename that silently drops files would make
        # the checks below vacuous.
        self.assertEqual(6, len(INSTALL_FILES))

    def test_no_locale_points_zed_at_a_path_it_does_not_read(self) -> None:
        for path in INSTALL_FILES:
            with self.subTest(file=path.name):
                self.assertNotIn(
                    WRONG_ZED_SKILLS_PATH,
                    path.read_text(encoding="utf-8"),
                    f"{path.name} tells Zed users to copy into "
                    f"{WRONG_ZED_SKILLS_PATH}, which Zed does not scan",
                )

    def test_every_locale_documents_the_directory_zed_actually_reads(self) -> None:
        # The <summary> wrapper is identical in every locale, unlike prose, so
        # scope the assertion to the Zed block instead of the whole file.
        for path in INSTALL_FILES:
            with self.subTest(file=path.name):
                text = path.read_text(encoding="utf-8")
                start = text.find("<summary><strong>Zed</strong></summary>")
                self.assertNotEqual(-1, start, f"{path.name} has no Zed block")
                end = text.find("</details>", start)
                self.assertNotEqual(-1, end, f"{path.name} has an unclosed Zed block")
                block = text[start:end]
                self.assertIn(
                    RIGHT_ZED_SKILLS_PATH,
                    block,
                    f"{path.name} does not mention {RIGHT_ZED_SKILLS_PATH} "
                    "in its Zed block",
                )


if __name__ == "__main__":
    unittest.main()
