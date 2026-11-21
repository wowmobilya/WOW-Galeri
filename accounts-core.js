/* Local identity and account lifecycle. Passwords are never business settings.
   This provider controls the application on this device; it does not encrypt
   browser business data or replace authorization on a future remote service. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WFAccountsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const SCHEMA_VERSION = 1;
  const ITERATIONS = 600000;
  const IDLE_MS = 30 * 60 * 1000;
  const SESSION_MS = 8 * 60 * 60 * 1000;
  const LOCK_MS = 15 * 60 * 1000;
  const MAX_FAILURES = 5;
  const AUDIT_LIMIT = 500;
  const OWNER_RESUME_LIMIT = 8;
  const ROLES = new Set(['owner', 'manager', 'sales', 'carpentry', 'assembly', 'warehouse', 'customer', 'custom']);
  const STATUSES = new Set(['active', 'suspended', 'revoked', 'deleted']);
  const PROFILE_FIELDS = new Set(['name', 'username', 'role', 'permissions', 'department', 'note', 'expiresAt']);
  const DUMMY_CREDENTIAL = Object.freeze({algorithm: 'PBKDF2-HMAC-SHA256', iterations: ITERATIONS,
    salt: '5137b9952ab0cfd92d2c5160f5b4b164', hash: '0'.repeat(64)});
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  function fail(code) {const error = new Error(code); error.name = 'AccountsError'; error.code = code; throw error;}
  function plain(value) {return !!value && typeof value === 'object' && !Array.isArray(value);}
  function boundedText(value, max, code, required = false, multiline = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string') fail(code);
    const result = value.trim().normalize('NFC');
    if ((required && !result) || Array.from(result).length > max ||
      (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(result)) fail(code);
    return result;
  }
  function normalizeUsername(value) {
    if (typeof value !== 'string') fail('INVALID_USERNAME');
    const result = value.trim().normalize('NFC').toLowerCase().normalize('NFC');
    if (!/^[\p{L}\p{N}._@-]{3,64}$/u.test(result)) fail('INVALID_USERNAME');
    return result;
  }
  function validPassword(value) {
    return typeof value === 'string' && Array.from(value).length >= 12 && Array.from(value).length <= 128;
  }
  function checkPassword(value) {if (!validPassword(value)) fail('INVALID_PASSWORD'); return value;}
  function normalizeExpiry(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail('INVALID_EXPIRY');
    return new Date(value).toISOString();
  }
  function credentialValid(value) {
    return plain(value) && value.algorithm === 'PBKDF2-HMAC-SHA256' && value.iterations === ITERATIONS &&
      typeof value.salt === 'string' && /^[0-9a-f]{32}$/.test(value.salt) &&
      typeof value.hash === 'string' && /^[0-9a-f]{64}$/.test(value.hash);
  }
  function resumeEnvelopeValid(value) {
    return plain(value) && value.schemaVersion === 1 && typeof value.accountId === 'string' &&
      value.accountId.length > 0 && value.accountId.length <= 128 && Number.isSafeInteger(value.sessionVersion) &&
      value.sessionVersion >= 1 && typeof value.capability === 'string' && /^[0-9a-f]{64}$/.test(value.capability);
  }
  function validateState(value) {
    if (value == null) return null;
    if (!plain(value) || value.schemaVersion !== SCHEMA_VERSION || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !Array.isArray(value.accounts) || !Array.isArray(value.audit) || value.audit.length > AUDIT_LIMIT) fail('IDENTITY_STATE_INVALID');
    const ids = new Set(), usernames = new Set();
    for (const account of value.accounts) {
      if (!plain(account) || typeof account.id !== 'string' || !account.id || ids.has(account.id) ||
        typeof account.name !== 'string' || !account.name || !ROLES.has(account.role) || !STATUSES.has(account.status) ||
        !Array.isArray(account.permissions) || !account.permissions.every(key => typeof key === 'string') ||
        !Number.isSafeInteger(account.sessionVersion) || account.sessionVersion < 1 || !credentialValid(account.credential) ||
        !Number.isSafeInteger(account.failedAttempts) || account.failedAttempts < 0 || account.failedAttempts > MAX_FAILURES) fail('IDENTITY_STATE_INVALID');
      if (own(account, 'ownerResumeHashes') && (!Array.isArray(account.ownerResumeHashes) ||
        account.ownerResumeHashes.length > OWNER_RESUME_LIMIT || new Set(account.ownerResumeHashes).size !== account.ownerResumeHashes.length ||
        !account.ownerResumeHashes.every(hash => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)))) fail('IDENTITY_STATE_INVALID');
      try {
        if (normalizeUsername(account.username) !== account.username || usernames.has(account.username) ||
          normalizeExpiry(account.expiresAt) !== account.expiresAt || normalizeExpiry(account.lockedUntil) !== account.lockedUntil) fail('IDENTITY_STATE_INVALID');
      } catch (_) {fail('IDENTITY_STATE_INVALID');}
      ids.add(account.id); usernames.add(account.username);
    }
    for (const event of value.audit) {
      if (!plain(event) || typeof event.id !== 'string' || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at)) ||
        typeof event.action !== 'string' || !['success', 'failure'].includes(event.outcome)) fail('IDENTITY_STATE_INVALID');
    }
    return clone(value);
  }
  function publicAccount(account) {
    if (!account) return null;
    return {id: account.id, name: account.name, username: account.username, role: account.role,
      permissions: account.permissions.slice(), department: account.department || '', note: account.note || '', status: account.status,
      createdAt: account.createdAt || null, updatedAt: account.updatedAt || null, lastLoginAt: account.lastLoginAt || null,
      expiresAt: account.expiresAt, deletedAt: account.deletedAt || null, sessionVersion: account.sessionVersion,
      lockedUntil: account.lockedUntil};
  }
  function publicEvent(event) {
    const safe = {id: event.id, at: event.at, actorId: event.actorId || null, actorName: event.actorName || '',
      targetId: event.targetId || null, targetName: event.targetName || '', action: event.action,
      outcome: event.outcome, reason: event.reason || ''};
    if (Array.isArray(event.changes)) safe.changes = event.changes.filter(key => PROFILE_FIELDS.has(key));
    if (typeof event.targetType === 'string') safe.targetType = event.targetType;
    if (typeof event.details === 'string') safe.details = event.details;
    return safe;
  }

  function createService({read, commit, crypto = root.crypto, now = Date.now, policy = root.WFAccountPolicy, sessionStore} = {}) {
    if (typeof read !== 'function' || typeof commit !== 'function') fail('INVALID_ADAPTER');
    if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function') fail('CRYPTO_UNAVAILABLE');
    if (typeof policy?.normalizePermissions !== 'function' || typeof policy?.can !== 'function') fail('POLICY_UNAVAILABLE');
    let state = null, configured = false, session = null, queue = Promise.resolve(), generation = 0, pendingExpiry = null;
    let resumeStore = null, continuation = null, continuationHash = null, resumeAttempted = false, retiredContinuations = [];
    const listeners = new Set();
    function timestamp() {
      const value = now(), number = value instanceof Date ? value.getTime() : Number(value);
      if (!Number.isFinite(number)) fail('INVALID_CLOCK');
      return number;
    }
    const iso = () => new Date(timestamp()).toISOString();
    const bytesHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const hexBytes = hex => Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));
    function randomHex(bytes) {return bytesHex(crypto.getRandomValues(new Uint8Array(bytes)));}
    function id(prefix) {return prefix + '_' + randomHex(16);}
    const capabilityHash = async capability => bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256', hexBytes(capability))));
    function clearResumeStore() {
      try {resumeStore?.clear();} catch (_) {resumeStore = null;}
    }
    function retireContinuation() {
      if (continuation) retiredContinuations.push({envelope: continuation, hash: continuationHash});
      continuation = null; continuationHash = null; resumeAttempted = true; clearResumeStore();
    }
    async function removeRetiredContinuations(next, retired) {
      for (const item of retired) {
        const account = next.accounts.find(row => row.id === item.envelope.accountId);
        if (!account?.ownerResumeHashes?.length) continue;
        try {item.hash = item.hash || await capabilityHash(item.envelope.capability);} catch (_) {continue;}
        account.ownerResumeHashes = account.ownerResumeHashes.filter(hash => hash !== item.hash);
      }
    }
    async function prepareContinuation(account, expectedGeneration) {
      if (!resumeStore || account.role !== 'owner') return null;
      // Reauthentication replaces this tab's previous capability before the
      // bound is applied, so it cannot evict an unrelated owner's tab.
      await removeRetiredContinuations({accounts: [account]}, retiredContinuations.slice());
      let capability, hash;
      try {capability = randomHex(32); hash = await capabilityHash(capability);}
      catch (_) {clearResumeStore(); resumeStore = null; return null;}
      checkGeneration(expectedGeneration);
      account.ownerResumeHashes = [...(account.ownerResumeHashes || []), hash].slice(-OWNER_RESUME_LIMIT);
      return {envelope: {schemaVersion: 1, accountId: account.id, sessionVersion: account.sessionVersion, capability}, hash};
    }
    function rememberContinuation(prepared, expectedGeneration) {
      if (!prepared || expectedGeneration !== generation || !session || !resumeStore) return;
      continuation = clone(prepared.envelope); continuationHash = prepared.hash;
      try {resumeStore.write(clone(continuation));}
      catch (_) {retireContinuation(); resumeStore = null;}
    }
    function active(account, at = timestamp()) {
      return !!account && account.status === 'active' && (account.expiresAt == null || Date.parse(account.expiresAt) > at);
    }
    function lock() {if (session) generation++; session = null; retireContinuation();}
    function liveAccount() {
      if (!session) return null;
      const account = state?.accounts.find(row => row.id === session.accountId), at = timestamp();
      // Employee sessions expire on inactivity and length. A verified owner
      // remains signed in; status, version, clock and account expiry still apply.
      const timedOut = at < session.startedAt || at < session.lastActiveAt ||
        (account?.role !== 'owner' && (at - session.startedAt >= SESSION_MS || at - session.lastActiveAt >= IDLE_MS)) ||
        (account?.expiresAt != null && Date.parse(account.expiresAt) <= at);
      if (!active(account, at) || account.sessionVersion !== session.sessionVersion || timedOut) {
        if (timedOut && account) pendingExpiry = {accountId: account.id};
        lock(); return null;
      }
      return account;
    }
    function getSnapshot() {
      const current = liveAccount(), owner = current?.role === 'owner';
      return freeze({configured, revision: state?.revision || 0, currentAccount: publicAccount(current),
        accounts: current ? state.accounts.filter(row => owner || row.id === current.id).map(publicAccount) : [],
        audit: current ? state.audit.filter(event => owner || event.actorId === current.id ||
          ((!event.targetType || event.targetType === 'account') && event.targetId === current.id)).map(publicEvent) : []});
    }
    function emit() {
      const snapshot = getSnapshot();
      for (const listener of listeners) {try {listener(snapshot);} catch (_) { /* A view cannot change the commit result. */ }}
      return snapshot;
    }
    function enqueue(task) {const work = queue.then(task); queue = work.catch(() => {}); return work;}
    async function load() {
      let value;
      try {value = await read();} catch (_) {lock(); emit(); fail('STORAGE_ERROR');}
      if (value != null) configured = true;
      try {
        const loaded = validateState(value);
        // Empty is a setup state only before this service has observed an owner
        // configuration or lost a concurrent claim. Disappearance never grants
        // legacy access or lets a stale tab overwrite the established identities.
        if (configured && !loaded?.accounts.length) fail('IDENTITY_STATE_INVALID');
        state = loaded;
      } catch (_) {lock(); emit(); fail('IDENTITY_STATE_INVALID');}
      configured = configured || !!state?.accounts.length; liveAccount(); return state;
    }
    function nextState() {return state ? clone(state) : {schemaVersion: SCHEMA_VERSION, revision: 0, accounts: [], audit: []};}
    function audit(next, action, actor, target = actor, {outcome = 'success', reason = '', changes} = {}) {
      const event = {id: id('event'), at: iso(), actorId: actor?.id || null, actorName: actor?.name || '',
        targetId: target?.id || null, targetName: target?.name || '', action, outcome, reason};
      if (changes?.length) event.changes = changes.slice();
      next.audit.push(event); next.audit = next.audit.slice(-AUDIT_LIMIT);
      return event;
    }
    async function persist(next, onSuccess, retryAuditConflict = false) {
      const expected = state?.revision || 0;
      const retired = retiredContinuations.slice(); await removeRetiredContinuations(next, retired);
      next.schemaVersion = SCHEMA_VERSION; next.revision = expected + 1;
      validateState(next);
      try {await commit(expected, clone(next));}
      catch (error) {
        const conflict = error?.code === 'CONFLICT' || error?.message === 'CONFLICT';
        // Only an append-only activity operation may reload and retry. Privilege
        // edits remain fail-closed. A lost initial owner claim must never reopen
        // the legacy, unconfigured application while the winning row is unknown.
        if (conflict && retryAuditConflict) fail('CONFLICT');
        if (conflict && !configured) configured = true;
        lock(); emit();
        fail(conflict ? 'CONFLICT' : 'STORAGE_ERROR');
      }
      state = clone(next); configured = configured || !!state.accounts.length;
      retiredContinuations = retiredContinuations.filter(item => !retired.includes(item));
      onSuccess?.();
      // A failed sessionStorage write must leave only the in-memory login.
      // Remove its newly committed hash before reporting authentication success.
      if (retiredContinuations.length) return persist(nextState());
      return emit();
    }
    async function restoreOwnerContinuation() {
      if (resumeAttempted) return;
      resumeAttempted = true;
      if (!continuation || !resumeStore) return;
      const candidate = clone(continuation), expected = generation;
      let hash;
      try {hash = await capabilityHash(candidate.capability);}
      catch (_) {retireContinuation(); return;}
      if (expected !== generation) return;
      // Authorization may change in another tab while WebCrypto is working.
      await load(); if (expected !== generation) return;
      const account = state?.accounts.find(row => row.id === candidate.accountId);
      if (!active(account) || account.role !== 'owner' || account.sessionVersion !== candidate.sessionVersion ||
        !account.ownerResumeHashes?.includes(hash)) {retireContinuation(); return;}
      continuationHash = hash; startSession(account, expected);
    }
    async function refreshInternal() {
      await load();
      await restoreOwnerContinuation();
      if (pendingExpiry && state) {
        const account = state.accounts.find(row => row.id === pendingExpiry.accountId); pendingExpiry = null;
        if (account) {const next = nextState(); audit(next, 'session_expired', account); return persist(next);}
      }
      if (state && retiredContinuations.length) return persist(nextState());
      return emit();
    }
    function requireCurrent() {
      const account = liveAccount(); if (!account) {emit(); fail('AUTH_REQUIRED');}
      return account;
    }
    async function requireOwner() {
      await refreshInternal(); const account = requireCurrent();
      if (account.role !== 'owner') fail('PERMISSION_DENIED');
      session.lastActiveAt = timestamp(); return account;
    }
    function targetAccount(next, accountId) {
      const target = next.accounts.find(row => row.id === accountId); if (!target) fail('ACCOUNT_NOT_FOUND');
      return target;
    }
    function uniqueUsername(next, username, exceptId) {
      if (next.accounts.some(row => row.username === username && row.id !== exceptId)) fail('USERNAME_EXISTS');
    }
    function normalizedPermissions(role, permissions) {
      const source = permissions === undefined && typeof policy.presets === 'function' ? policy.presets(role) : permissions;
      const result = policy.normalizePermissions(role, source);
      if (!Array.isArray(result) || !result.every(key => typeof key === 'string')) fail('INVALID_PERMISSIONS');
      return [...new Set(result)];
    }
    function profile(input) {
      if (!plain(input)) fail('INVALID_CHANGE');
      if (!ROLES.has(input.role)) fail('INVALID_ROLE');
      return {name: boundedText(input.name, 100, 'INVALID_NAME', true), username: normalizeUsername(input.username),
        role: input.role, permissions: normalizedPermissions(input.role, input.permissions),
        department: boundedText(input.department, 80, 'INVALID_DEPARTMENT'), note: boundedText(input.note, 1000, 'INVALID_NOTE', false, true),
        expiresAt: normalizeExpiry(input.expiresAt)};
    }
    function ownerInvariant(next) {
      if (!next.accounts.some(row => row.role === 'owner' && active(row))) fail('LAST_OWNER');
    }
    async function derive(password, salt) {
      try {
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: hexBytes(salt)}, key, 256);
        return bytesHex(new Uint8Array(bits));
      } catch (_) {lock(); emit(); fail('CRYPTO_ERROR');}
    }
    async function hashPassword(password) {
      checkPassword(password); const salt = randomHex(16);
      return {algorithm: 'PBKDF2-HMAC-SHA256', iterations: ITERATIONS, salt, hash: await derive(password, salt)};
    }
    async function verifyPassword(password, credential) {
      const valid = validPassword(password);
      const hash = await derive(valid ? password : 'invalid-password-input', credential.salt);
      let mismatch = hash.length ^ credential.hash.length;
      for (let index = 0; index < hash.length; index++) mismatch |= hash.charCodeAt(index) ^ credential.hash.charCodeAt(index);
      return valid && mismatch === 0;
    }
    function startSession(account, expectedGeneration) {
      if (expectedGeneration !== generation) return;
      const at = timestamp(); session = {accountId: account.id, sessionVersion: account.sessionVersion, startedAt: at, lastActiveAt: at};
    }
    function cancelAuthentication() {generation++; session = null; pendingExpiry = null; retireContinuation(); emit(); return generation;}
    function checkGeneration(expected) {if (expected !== generation) fail('AUTH_REQUIRED');}

    function bootstrapOwner(input) {
      const request = cancelAuthentication();
      return enqueue(async () => {
        await load(); if (configured) fail('ALREADY_CONFIGURED');
        const fields = profile({...input, role: 'owner', department: '', note: '', expiresAt: null});
        const credential = await hashPassword(input?.password); checkGeneration(request);
        const at = iso(), account = {...fields, id: id('account'), status: 'active', createdAt: at, updatedAt: at,
          lastLoginAt: at, deletedAt: null, sessionVersion: 1, failedAttempts: 0, lockedUntil: null, credential};
        const prepared = await prepareContinuation(account, request); checkGeneration(request);
        const next = nextState(); next.accounts.push(account); audit(next, 'owner_created', account);
        const snapshot = await persist(next, () => {startSession(account, request); rememberContinuation(prepared, request);}); checkGeneration(request); return snapshot;
      });
    }
    function signIn({username, password} = {}) {
      const request = cancelAuthentication();
      return enqueue(async () => {
        await load(); let normalized = '';
        try {normalized = normalizeUsername(username);} catch (_) { /* Match the public failure for unknown users. */ }
        const account = state?.accounts.find(row => row.username === normalized);
        const matches = await verifyPassword(password, account?.credential || DUMMY_CREDENTIAL); checkGeneration(request);
        const at = timestamp(), locked = !!account?.lockedUntil && Date.parse(account.lockedUntil) > at;
        if (!account || !matches || !active(account, at) || locked) {
          if (state) {
            const next = nextState(), target = account && targetAccount(next, account.id);
            if (target && !locked) {
              const expiredLock = target.lockedUntil != null && Date.parse(target.lockedUntil) <= at;
              target.failedAttempts = Math.min(MAX_FAILURES, (expiredLock ? 0 : target.failedAttempts) + 1);
              target.lockedUntil = target.failedAttempts >= MAX_FAILURES ? new Date(at + LOCK_MS).toISOString() : null;
            }
            audit(next, 'login_failed', null, target, {outcome: 'failure'}); await persist(next);
          }
          fail('LOGIN_FAILED');
        }
        const next = nextState(), target = targetAccount(next, account.id);
        target.failedAttempts = 0; target.lockedUntil = null; target.lastLoginAt = new Date(at).toISOString();
        const prepared = await prepareContinuation(target, request); checkGeneration(request);
        audit(next, 'login_success', target);
        const snapshot = await persist(next, () => {startSession(target, request); rememberContinuation(prepared, request);}); checkGeneration(request); return snapshot;
      });
    }
    function signOut() {
      const previous = session && {...session}; cancelAuthentication();
      return enqueue(async () => {
        await load();
        const actor = previous && state?.accounts.find(row => row.id === previous.accountId);
        if (!state || (!actor && !retiredContinuations.length)) return emit();
        const next = nextState(); if (actor) audit(next, 'logout', actor); return persist(next);
      });
    }
    function createAccount(input) {
      return enqueue(async () => {
        const actor = await requireOwner(), fields = profile(input), next = nextState();
        uniqueUsername(next, fields.username); const request = generation, credential = await hashPassword(input.password);
        checkGeneration(request); requireCurrent();
        const at = iso(), account = {...fields, id: id('account'), status: 'active', createdAt: at, updatedAt: at,
          lastLoginAt: null, deletedAt: null, sessionVersion: 1, failedAttempts: 0, lockedUntil: null, credential};
        next.accounts.push(account); audit(next, 'account_created', actor, account); return persist(next);
      });
    }
    function updateAccount(accountId, patch) {
      return enqueue(async () => {
        const actor = await requireOwner();
        if (!plain(patch) || Object.keys(patch).some(key => !PROFILE_FIELDS.has(key))) fail('INVALID_CHANGE');
        const next = nextState(), target = targetAccount(next, accountId);
        if (target.status === 'deleted') fail('INVALID_STATUS');
        const role = own(patch, 'role') ? patch.role : target.role;
        if (!ROLES.has(role)) fail('INVALID_ROLE');
        const merged = {...target, ...patch, role};
        if (role !== target.role && !own(patch, 'permissions')) merged.permissions = undefined;
        const fields = profile(merged); uniqueUsername(next, fields.username, target.id);
        const changes = Object.keys(fields).filter(key => JSON.stringify(fields[key]) !== JSON.stringify(target[key]));
        if (!changes.length) return emit();
        if (target.id === actor.id && (fields.role !== 'owner' || (fields.expiresAt !== target.expiresAt && fields.expiresAt != null))) fail('SELF_PROTECTION');
        const invalidates = changes.some(key => ['role', 'permissions', 'expiresAt'].includes(key));
        Object.assign(target, fields, {updatedAt: iso()}); if (invalidates) {target.sessionVersion++; delete target.ownerResumeHashes;}
        ownerInvariant(next); audit(next, 'account_updated', actor, target, {changes}); return persist(next);
      });
    }
    function setStatus(accountId, status, reason = '') {
      return enqueue(async () => {
        const actor = await requireOwner(); if (!STATUSES.has(status)) fail('INVALID_STATUS');
        const note = boundedText(reason, 300, 'INVALID_REASON', false, true), next = nextState(), target = targetAccount(next, accountId);
        if (target.status === status) return emit();
        if (target.status === 'deleted') fail('INVALID_STATUS');
        if (target.id === actor.id && status !== 'active') fail('SELF_PROTECTION');
        target.status = status; target.updatedAt = iso(); target.sessionVersion++; delete target.ownerResumeHashes;
        if (status === 'deleted') target.deletedAt = target.updatedAt;
        if (status === 'active') {target.failedAttempts = 0; target.lockedUntil = null;}
        ownerInvariant(next);
        audit(next, {active: 'account_reactivated', suspended: 'account_suspended', revoked: 'account_revoked', deleted: 'account_deleted'}[status], actor, target, {reason: note});
        return persist(next);
      });
    }
    function restoreAccount(accountId) {
      return enqueue(async () => {
        const actor = await requireOwner(), next = nextState(), target = targetAccount(next, accountId);
        if (target.status !== 'deleted') fail('INVALID_STATUS');
        target.status = 'suspended'; target.updatedAt = iso(); target.deletedAt = null; target.sessionVersion++; delete target.ownerResumeHashes;
        target.failedAttempts = 0; target.lockedUntil = null; audit(next, 'account_restored', actor, target); return persist(next);
      });
    }
    function setPassword(accountId, password) {
      return enqueue(async () => {
        const actor = await requireOwner(), next = nextState(), target = targetAccount(next, accountId);
        if (target.id === actor.id) fail('CURRENT_PASSWORD_REQUIRED');
        if (target.status === 'deleted') fail('INVALID_STATUS');
        const request = generation, credential = await hashPassword(password); checkGeneration(request); requireCurrent();
        target.credential = credential; target.updatedAt = iso(); target.sessionVersion++; delete target.ownerResumeHashes; target.failedAttempts = 0; target.lockedUntil = null;
        audit(next, 'password_reset', actor, target); return persist(next);
      });
    }
    function changePassword(currentPassword, newPassword) {
      return enqueue(async () => {
        await refreshInternal(); const actor = requireCurrent(), request = generation;
        checkPassword(newPassword);
        const matches = await verifyPassword(currentPassword, actor.credential); checkGeneration(request); requireCurrent();
        if (!matches) {const denied = nextState(); audit(denied, 'login_failed', actor, actor, {outcome: 'failure'}); await persist(denied); fail('LOGIN_FAILED');}
        const credential = await hashPassword(newPassword); checkGeneration(request); requireCurrent();
        const next = nextState(), target = targetAccount(next, actor.id);
        target.credential = credential; target.updatedAt = iso(); target.sessionVersion++; delete target.ownerResumeHashes; target.failedAttempts = 0; target.lockedUntil = null;
        const prepared = await prepareContinuation(target, request); checkGeneration(request); requireCurrent();
        audit(next, 'password_changed', actor, target);
        return persist(next, () => {
          if (session && generation === request) {
            session.sessionVersion = target.sessionVersion; session.lastActiveAt = timestamp();
            continuation = null; continuationHash = null; clearResumeStore(); rememberContinuation(prepared, request);
          }
        });
      });
    }
    function revokeSessions(accountId) {
      return enqueue(async () => {
        const actor = await requireOwner(), next = nextState(), target = targetAccount(next, accountId);
        target.sessionVersion++; delete target.ownerResumeHashes; target.updatedAt = iso(); audit(next, 'sessions_revoked', actor, target); return persist(next);
      });
    }
    function assertPermission(key) {
      return enqueue(async () => {
        await refreshInternal(); const actor = requireCurrent();
        if (typeof key !== 'string' || !policy.can(publicAccount(actor), key)) fail('PERMISSION_DENIED');
        session.lastActiveAt = timestamp(); return true;
      });
    }
    function recordActivity(input) {
      return enqueue(async () => {
        let activity = null, original = null;
        const sameActor = actor => {
          if (original && (actor.id !== original.id || actor.sessionVersion !== original.sessionVersion || generation !== original.generation)) fail('AUTH_REQUIRED');
        };
        for (let attempt = 0; attempt < 3; attempt++) {
          await refreshInternal(); const actor = requireCurrent(); sameActor(actor);
          const action = activity?.action || input?.action;
          if (!plain(input) || typeof action !== 'string' || !policy.can(publicAccount(actor), action)) fail('PERMISSION_DENIED');
          if (!activity) {
            original = {id: actor.id, sessionVersion: actor.sessionVersion, generation};
            const targetType = boundedText(input.targetType, 40, 'INVALID_ACTIVITY', true);
            if (!/^[a-z][a-z0-9_-]*$/.test(targetType)) fail('INVALID_ACTIVITY');
            const identifier = value => value == null ? null : boundedText(typeof value === 'number' ? String(value) : value, 128, 'INVALID_ACTIVITY');
            const targetId = identifier(input.targetId), parts = [], details = input.details == null ? {} : input.details;
            // Business callers describe their commit, never send record bodies,
            // form values or credentials. Preserve this detached summary on retry.
            if (!plain(details) || Object.keys(details).some(key => !['store', 'id', 'count'].includes(key))) fail('INVALID_ACTIVITY');
            if (own(details, 'store')) {
              const store = boundedText(details.store, 40, 'INVALID_ACTIVITY', true);
              if (!/^[a-z][a-z0-9_-]*$/.test(store)) fail('INVALID_ACTIVITY');
              parts.push('store=' + store);
            }
            if (own(details, 'id')) parts.push('id=' + (identifier(details.id) || ''));
            if (own(details, 'count')) {
              if (!Number.isSafeInteger(details.count) || details.count < 0) fail('INVALID_ACTIVITY');
              parts.push('count=' + details.count);
            }
            const summary = parts.join('; '); if (Array.from(summary).length > 200) fail('INVALID_ACTIVITY');
            activity = {action, targetId, targetType, summary};
          }
          const next = nextState(), event = audit(next, activity.action, actor, null);
          event.targetId = activity.targetId; event.targetType = activity.targetType; event.details = activity.summary;
          session.lastActiveAt = timestamp();
          try {return await persist(next, undefined, true);}
          catch (error) {if (error?.code !== 'CONFLICT') throw error;}
        }
        // Exhausted audit contention is reported to the caller without logging
        // out a still-valid employee. Revocation/storage errors still lock them.
        await refreshInternal(); const actor = requireCurrent(); sameActor(actor);
        if (!policy.can(publicAccount(actor), activity.action)) fail('PERMISSION_DENIED');
        fail('CONFLICT');
      });
    }
    function touch() {
      if (!liveAccount()) {emit(); return false;}
      session.lastActiveAt = timestamp(); return true;
    }
    function subscribe(listener) {
      if (typeof listener !== 'function') fail('INVALID_LISTENER');
      listeners.add(listener); return () => listeners.delete(listener);
    }
    // The adapter is optional and synchronous (normally tab-scoped sessionStorage).
    // Its capability is never accepted as a role flag or included in public state.
    try {
      if (sessionStore && ['read', 'write', 'clear'].every(method => typeof sessionStore[method] === 'function')) {
        resumeStore = sessionStore;
        const value = resumeStore.read();
        if (resumeEnvelopeValid(value)) continuation = clone(value);
        else clearResumeStore();
      }
    } catch (_) {clearResumeStore(); resumeStore = null;}
    return Object.freeze({refresh: () => enqueue(refreshInternal), bootstrapOwner, signIn, signOut, createAccount, updateAccount,
      setStatus, setPassword, changePassword, revokeSessions, restoreAccount, assertPermission, recordActivity, getSnapshot, touch, subscribe});
  }
  return Object.freeze({createService, normalizeUsername});
});
