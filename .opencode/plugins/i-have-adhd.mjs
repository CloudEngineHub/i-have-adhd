// i-have-adhd — OpenCode plugin.
//
// Mirrors the Claude Code / Codex behaviour for OpenCode: the skill in
// `skills/i-have-adhd/SKILL.md` is the single source of truth for the ruleset.
//
//   • On demand   — registers the skills directory and a `/i-have-adhd`
//                   command so the ruleset applies for the rest of the session.
//   • Always-on   — when the opt-in flag file exists, the full ruleset is
//                   appended to the system prompt every turn (the OpenCode
//                   equivalent of the SessionStart hook in hooks/always-on.sh).
//
// Opt in to always-on:   touch ~/.config/opencode/.i-have-adhd-always
// Opt back out:          rm ~/.config/opencode/.i-have-adhd-always
//
// Install — add to opencode.json:
//   { "plugin": ["./.opencode/plugins/i-have-adhd.mjs"] }

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '../../skills');
const skillPath = path.join(skillsDir, 'i-have-adhd', 'SKILL.md');
const commandPath = path.join(__dirname, '..', 'command', 'i-have-adhd.md');

// Parse the project-scope command file (frontmatter description + template
// body) so the global-install route gets the same command without a second
// copy of the text to keep in sync.
function commandDefinition() {
  const raw = fs.readFileSync(commandPath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return { description: undefined, template: raw };
  const [, frontmatter, template] = match;
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { description, template };
}

// Always-on opt-in flag, mirroring Claude Code's ~/.claude/.i-have-adhd-always
// but under OpenCode's config dir so the two tools stay independent.
const flagPath = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'opencode',
  '.i-have-adhd-always',
);

// Read SKILL.md and strip a leading YAML frontmatter block (--- ... ---).
// Regex and trailing-newline trim match hooks/always-on.mjs so always-on
// injections behave identically across harnesses (see tests/test_always_on_hooks.py).
function rulesetBody() {
  return fs
    .readFileSync(skillPath, 'utf8')
    .replace(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, '')
    .replace(/(?:\r?\n)+$/, '');
}

export default async () => {
  return {
    // Make the skill discoverable (so the `skill` tool and the /i-have-adhd
    // command can load it).
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(skillsDir)) config.skills.paths.push(skillsDir);

      // Register /i-have-adhd directly from the plugin config so a global
      // install (plugin path outside the checkout, opencode run from an
      // unrelated project) gets the command too. Project-scope runs also
      // pick up .opencode/command/i-have-adhd.md natively; whichever loads
      // first wins, and both carry the same text (see commandDefinition()).
      try {
        config.command = config.command || {};
        if (!config.command['i-have-adhd']) {
          config.command['i-have-adhd'] = commandDefinition();
        }
      } catch (e) {
        // Missing/unreadable command file should not break config loading.
      }
    },

    // Always-on: append the ruleset to the system prompt every turn while the
    // flag file exists. "stop adhd mode" turns it off for the session (the
    // model honours the skill's own Persistence rules); deleting the flag
    // turns always-on off for good.
    'experimental.chat.system.transform': async (_input, output) => {
      let on = false;
      try { on = fs.existsSync(flagPath); } catch (e) {}
      if (!on) return;

      let body;
      try { body = rulesetBody(); } catch (e) { return; }

      const header =
        'ADHD MODE ACTIVE (always-on). The ruleset below applies to every ' +
        'response. "stop adhd mode" or "normal mode" turns it off for this ' +
        'session; delete ' + flagPath + ' to turn always-on off for good.';
      const injected = header + '\n\n' + body;

      if (output.system.length > 0) {
        output.system[output.system.length - 1] += '\n\n' + injected;
      } else {
        output.system.push(injected);
      }
    },
  };
};
