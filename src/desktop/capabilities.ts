/**
 * Desktop capability boundary.
 *
 * The WebView is the least trusted part of the desktop app: it renders remote-ish
 * content, runs a bundler's output and has no business touching the OS. This
 * module defines exactly what it is granted, and refuses everything else.
 *
 * The decisive design choice (see ADR-0029): **the Rust host owns every privileged
 * action, and the WebView is granted no plugin permission that could reach the
 * system.** The Rust side starts the bundled API sidecar, reads the OS keychain,
 * writes config/cache/exports, and shows the file dialogs. The WebView calls a
 * small, typed command list (see `ipc.ts`) and receives values, never handles.
 *
 * Consequences worth stating plainly:
 *
 *   - **No `shell:` permission exists at all.** The sidecar is spawned by Rust
 *     with a fixed executable and a fixed argument list, so `shell:allow-execute`
 *     and `shell:allow-spawn` are not merely unused — they are refused by name.
 *     A frontend compromise cannot start a process.
 *   - **`core:default` is not granted.** The aggregate bundles path resolution and
 *     window creation; this app grants the specific core permission sets it needs.
 *     "One convenient line" is how a boundary silently widens.
 *   - **No path ever reaches the WebView.** With no path/fs permission and no
 *     command that returns one, "which file is this?" is answered by a storage id.
 *   - **Nothing here can trade.** There is no capability for broker access or
 *     order placement, and the forbidden list fails the build if one appears.
 *
 * `npm run desktop:verify` runs these assertions over the real `src-tauri/` files,
 * so the Tauri source is machine-checked on a machine with no Rust toolchain.
 */

import { AppError } from '../core/errors.js';

export interface GrantedPermission {
  /** The Tauri 2 permission identifier granted in the capability file. */
  permission: string;
  /** Why the WebView needs it, and what it deliberately cannot reach. */
  purpose: string;
  /** True when the shell refuses to start without it. */
  required: boolean;
}

/**
 * The complete permission allow-list for the WebView. Every plugin permission in
 * `src-tauri/capabilities/*.json` must appear here; adding one is a code change
 * with a stated purpose.
 *
 * Everything the app actually needs from the OS is a Rust command, not a
 * permission — so this table is short on purpose.
 */
export const GRANTED_PERMISSIONS: readonly GrantedPermission[] = [
  {
    permission: 'core:app:default',
    purpose:
      'Read the app name, version, identifier and Tauri version for the status card. Cannot read paths or files.',
    required: true,
  },
  {
    permission: 'core:event:default',
    purpose:
      'Listen for shell lifecycle events (sidecar ready, going offline) and emit UI acknowledgements.',
    required: true,
  },
  {
    permission: 'core:window:default',
    purpose:
      'Window defaults needed to minimise and to react to a close request. Window creation and always-on-top stay forbidden.',
    required: true,
  },
  {
    permission: 'core:window:allow-hide',
    purpose:
      'Hide the window instead of quitting, so a months-long training record survives a close.',
    required: true,
  },
  {
    permission: 'core:window:allow-show',
    purpose: 'Bring the window back after a second launch or a tray action.',
    required: true,
  },
  {
    permission: 'core:window:allow-set-focus',
    purpose:
      'Focus the existing window when a second instance is rejected by the single-instance plugin.',
    required: false,
  },
  {
    permission: 'core:webview:default',
    purpose: 'Webview defaults for the main window; no webview creation.',
    required: false,
  },
  {
    permission: 'core:menu:default',
    purpose: 'Native menu defaults, so the OS menu bar behaves as users expect.',
    required: false,
  },
  {
    permission: 'core:resources:default',
    purpose: 'Read bundled resources (the sidecar binary, the licence text).',
    required: false,
  },
  {
    permission: 'notification:default',
    purpose:
      "Post a local notification when a long background job or a scheduled review finishes. Cannot read other apps' notifications.",
    required: false,
  },
  {
    permission: 'updater:default',
    purpose:
      'Check the signed update channel. The signature is verified against the bundled public key; an unsigned artifact is refused.',
    required: false,
  },
  {
    permission: 'opener:allow-open-url',
    purpose:
      'Open documentation in the system browser. Scoped to https only, so file:, javascript: and custom schemes are refused.',
    required: false,
  },
];

/**
 * Permission families that must never be granted, each with the reason it is
 * refused. These are checked by name and by prefix, so an alias or a wildcard
 * cannot smuggle one in (`shell:default` matches `^shell:`).
 */
export const FORBIDDEN_PERMISSION_RULES: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^shell:/,
    reason:
      'the WebView never starts a process: Rust spawns the one bundled API sidecar with a fixed executable and fixed arguments, so every shell permission (including the aggregate) is refused',
  },
  {
    pattern: /^fs:/,
    reason:
      'a filesystem scope gives the WebView path access; config, cache and exports are written by Rust commands inside the app-data directory instead',
  },
  {
    pattern: /^(core:)?path:/,
    reason:
      'path resolution would let the frontend learn filesystem paths, breaking the rule that files are addressed by storage id and never by path',
  },
  {
    pattern: /^core:default$/,
    reason:
      'the aggregate core set bundles path resolution, window creation and OS inspection; grant the specific sets this app needs instead',
  },
  {
    pattern: /^http:/,
    reason:
      'the shell has no reason to make outbound requests; model calls belong to the backend, which enforces provider, budget and permission rules',
  },
  {
    pattern: /^process:/,
    reason: 'process control would let the frontend inspect or kill processes it did not start',
  },
  {
    pattern: /^store:/,
    reason:
      'the key-value store plugin exposes a file-backed surface to the WebView; the offline cache is a typed Rust command with a TTL',
  },
  {
    pattern: /^global-shortcut:/,
    reason: 'a global hotkey captures a keystroke from every application on the machine',
  },
  {
    pattern: /^autostart:/,
    reason: 'the app must not insert itself into the OS startup sequence',
  },
  {
    pattern: /^clipboard-manager:/,
    reason:
      'clipboard reads can exfiltrate whatever the user copied; nothing in this app needs programmatic clipboard access',
  },
  {
    pattern: /^os:/,
    reason:
      'system inspection (hostname, CPU, memory) is not needed and is better kept out of the renderer',
  },
  {
    pattern: /^(core:)?window:allow-(create|destroy|set-always-on-top)$/,
    reason:
      'creating or forcing windows from the frontend widens the attack surface and lets content escape the main window boundary',
  },
  {
    pattern: /allow-open-path|allow-reveal-item|allow-open-command/i,
    reason: 'opening or revealing a path defeats "no filesystem path reaches the frontend"',
  },
];

/** The permission identifiers this build is allowed to hold. */
export function allowedPermissions(): string[] {
  return GRANTED_PERMISSIONS.map((grant) => grant.permission);
}

/** The reason a permission is forbidden, or null when it is not. */
export function forbiddenReason(permission: string): string | null {
  const match = FORBIDDEN_PERMISSION_RULES.find((rule) => rule.pattern.test(permission));
  return match ? match.reason : null;
}

/** True when nothing in the app may use capability area `area`. */
export function assertCapabilityAreaAbsent(area: string): void {
  if (GRANTED_PERMISSIONS.some((grant) => grant.permission.startsWith(area))) {
    throw new AppError('POLICY_VIOLATION', `capability area "${area}" must not be granted`);
  }
}

/**
 * A permission entry. Tauri accepts a bare identifier, or an identifier with an
 * explicit scope (`{ "identifier": "opener:allow-open-url", "allow": [...] }`).
 * Both forms are supported — and a scoped entry is the *stronger* one, so it is
 * never a reason to skip the allow-list check.
 */
export interface ScopedPermission {
  identifier: string;
  allow?: unknown[];
  deny?: unknown[];
}

export interface CapabilityFile {
  identifier: string;
  description?: string;
  windows?: string[];
  /** Bare identifiers. */
  permissions: string[];
  /** Identifiers that carry a scope, with the scope preserved. */
  scoped: ScopedPermission[];
}

/** Every permission identifier in the file, scoped or not. */
export function capabilityPermissionIds(file: CapabilityFile): string[] {
  return [...file.permissions, ...file.scoped.map((entry) => entry.identifier)];
}

function parsePermissionEntry(entry: unknown, capabilityId: string): string | ScopedPermission {
  if (typeof entry === 'string' && entry.length > 0) return entry;
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const record = entry as Record<string, unknown>;
    const identifier = record.identifier;
    if (typeof identifier !== 'string' || identifier.length === 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        `capability "${capabilityId}" has a permission object without an identifier`,
      );
    }
    const scoped: ScopedPermission = { identifier };
    if (record.allow !== undefined) {
      if (!Array.isArray(record.allow)) {
        throw new AppError('VALIDATION_FAILED', `${identifier} has a malformed "allow"`);
      }
      scoped.allow = record.allow;
    }
    if (record.deny !== undefined) {
      if (!Array.isArray(record.deny)) {
        throw new AppError('VALIDATION_FAILED', `${identifier} has a malformed "deny"`);
      }
      scoped.deny = record.deny;
    }
    return scoped;
  }
  throw new AppError(
    'VALIDATION_FAILED',
    `capability "${capabilityId}" has a permission entry that is neither a string nor an object`,
  );
}

/** The shape a Tauri capability file must have for this app. */
export function parseCapabilityFile(raw: unknown): CapabilityFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError('VALIDATION_FAILED', 'capability file must be a JSON object');
  }
  const record = raw as Record<string, unknown>;
  const identifier = record.identifier;
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'capability file needs a non-empty "identifier"');
  }
  const entries = record.permissions;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      `capability "${identifier}" needs a non-empty permissions array`,
    );
  }
  const windows = record.windows;
  if (
    windows !== undefined &&
    (!Array.isArray(windows) || windows.some((w) => typeof w !== 'string'))
  ) {
    throw new AppError('VALIDATION_FAILED', `capability "${identifier}" has a malformed "windows"`);
  }
  const parsed = entries.map((entry) => parsePermissionEntry(entry, identifier));
  const file: CapabilityFile = {
    identifier,
    permissions: parsed.filter((entry): entry is string => typeof entry === 'string'),
    scoped: parsed.filter((entry): entry is ScopedPermission => typeof entry !== 'string'),
  };
  if (typeof record.description === 'string') file.description = record.description;
  if (windows !== undefined) file.windows = windows as string[];
  return file;
}

/**
 * The policy gate. Refuses a forbidden permission and an undeclared one, naming
 * which and why — a build that would widen the boundary fails here.
 */
export function assertCapabilityAllowList(permissions: readonly string[]): void {
  const allowed = new Set(allowedPermissions());
  for (const permission of permissions) {
    const forbidden = forbiddenReason(permission);
    if (forbidden) {
      throw new AppError(
        'POLICY_VIOLATION',
        `capability "${permission}" is forbidden: ${forbidden}`,
        { details: { permission } },
      );
    }
    if (!allowed.has(permission)) {
      throw new AppError(
        'POLICY_VIOLATION',
        `capability "${permission}" is not declared in GRANTED_PERMISSIONS (deny-by-default)`,
        { details: { permission } },
      );
    }
  }
}

/** Permissions the shell cannot start without. */
export function requiredPermissions(): string[] {
  return GRANTED_PERMISSIONS.filter((grant) => grant.required).map((grant) => grant.permission);
}

/** Required permissions missing from a set of granted ones. */
export function missingRequiredPermissions(granted: readonly string[]): string[] {
  const present = new Set(granted);
  return requiredPermissions().filter((permission) => !present.has(permission));
}

/** A human-readable table, used by the verify CLI and the docs. */
export function capabilityMatrix(): { permission: string; required: boolean; purpose: string }[] {
  return GRANTED_PERMISSIONS.map((grant) => ({
    permission: grant.permission,
    required: grant.required,
    purpose: grant.purpose,
  }));
}
