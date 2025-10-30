import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasToDisplay,
  deriveIdentityState,
  deriveFloatingIdentityDisplay,
  resolveSpaceNode,
} from '../contacts/contacts-core.js';

describe('contacts core helpers', () => {
  describe('aliasToDisplay', () => {
    it('trims whitespace and strips email domain', () => {
      assert.equal(aliasToDisplay('  user@example.com  '), 'user');
      assert.equal(aliasToDisplay('Alias'), 'Alias');
      assert.equal(aliasToDisplay(''), '');
    });
  });

  describe('deriveIdentityState', () => {
    it('prefers explicit username but falls back to alias display for signed-in users', () => {
      const state = deriveIdentityState({
        authState: { mode: 'user', alias: 'agent@3dvr.tech', username: '' },
        storedAlias: '',
        storedUsername: '',
      });

      assert.equal(state.signedIn, true);
      assert.equal(state.guest, false);
      assert.equal(state.alias, 'agent@3dvr.tech');
      assert.equal(state.username, 'agent');
      assert.equal(state.displayName, 'agent');
    });

    it('marks guests correctly without overwriting stored names', () => {
      const state = deriveIdentityState({
        authState: { mode: 'guest' },
        storedAlias: 'guest_123',
        storedUsername: '',
      });

      assert.equal(state.signedIn, false);
      assert.equal(state.guest, true);
      assert.equal(state.displayName, 'Guest');
    });

    it('treats an active Gun session as signed in even without stored flags', () => {
      const state = deriveIdentityState({
        authState: { mode: 'guest' },
        storedAlias: '',
        storedUsername: '',
        aliasFromSession: 'agent@3dvr.tech',
        usernameFromSession: 'Agent 47',
      });

      assert.equal(state.signedIn, true);
      assert.equal(state.guest, false);
      assert.equal(state.alias, 'agent@3dvr.tech');
      assert.equal(state.username, 'Agent 47');
      assert.equal(state.displayName, 'Agent 47');
    });

    it('falls back to an alias-based name when the session lacks a username', () => {
      const state = deriveIdentityState({
        authState: { mode: 'anon' },
        storedAlias: '',
        storedUsername: '',
        aliasFromSession: 'alias@example.com',
        usernameFromSession: '',
      });

      assert.equal(state.signedIn, true);
      assert.equal(state.guest, false);
      assert.equal(state.username, 'alias');
      assert.equal(state.displayName, 'alias');
    });
  });

  describe('deriveFloatingIdentityDisplay', () => {
    it('uses the most recent explicit display name when provided', () => {
      const display = deriveFloatingIdentityDisplay({
        latestDisplayName: 'Agent Smith',
        signedIn: true,
        username: 'agent',
        storedUsername: 'smith',
        alias: 'agent@3dvr.tech',
      });

      assert.equal(display, 'Agent Smith');
    });

    it('falls back to a generic user label when signed in data is missing', () => {
      const display = deriveFloatingIdentityDisplay({ signedIn: true });

      assert.equal(display, 'User');
    });

    it('prefers stored guest names when available', () => {
      const display = deriveFloatingIdentityDisplay({
        guest: true,
        guestDisplayName: 'Visitor 42',
      });

      assert.equal(display, 'Visitor 42');
    });
  });

  describe('resolveSpaceNode', () => {
    const createGunStub = () => {
      const orgContactsNode = { kind: 'org-contacts' };
      const publicContactsNode = { kind: 'public-contacts' };
      const fallbackContactsNode = { kind: 'fallback-contacts' };
      const orgGetter = mock.fn(() => orgContactsNode);
      const publicGetter = mock.fn(() => publicContactsNode);
      const fallbackGetter = mock.fn(() => fallbackContactsNode);
      const gunNode = {
        get: mock.fn(key => {
          if (key === 'org-3dvr-demo') {
            return { get: orgGetter };
          }
          if (key === 'contacts-public') {
            return { get: publicGetter };
          }
          return { get: fallbackGetter };
        }),
      };
      return { gunNode, orgGetter, publicGetter, orgContactsNode, publicContactsNode };
    };

    it('returns the user contacts node when a session is active', () => {
      const userContacts = { kind: 'user-contacts' };
      const user = { get: mock.fn(() => userContacts) };

      const result = resolveSpaceNode({
        space: 'personal',
        signedIn: true,
        userHasSession: true,
        user,
      });

      assert.equal(result.node, userContacts);
      assert.equal(result.requiresAuth, false);
      assert.equal(result.shouldClearAuth, true);
      assert.equal(user.get.mock.calls.length, 1);
      assert.deepEqual(user.get.mock.calls[0].arguments, ['contacts']);
    });

    it('indicates that personal space requires auth when signed in without a session', () => {
      const result = resolveSpaceNode({
        space: 'personal',
        signedIn: true,
        userHasSession: false,
      });

      assert.equal(result.node, null);
      assert.equal(result.requiresAuth, true);
    });

    it('resolves guest storage from the shared guests root', () => {
      const guestContacts = { kind: 'guest-contacts' };
      const guestsRoot = {
        get: mock.fn(() => ({ get: mock.fn(() => guestContacts) })),
      };

      const result = resolveSpaceNode({
        space: 'personal',
        signedIn: false,
        userHasSession: false,
        guestsRoot,
        guestId: 'guest_abc',
      });

      assert.equal(result.node, guestContacts);
      assert.equal(result.requiresAuth, false);
      assert.equal(guestsRoot.get.mock.calls[0].arguments[0], 'guest_abc');
    });

    it('uses org and public Gun nodes for shared spaces', () => {
      const { gunNode, orgGetter, publicGetter, orgContactsNode, publicContactsNode } = createGunStub();

      const orgResult = resolveSpaceNode({
        space: 'org-3dvr',
        gun: gunNode,
      });
      assert.equal(orgResult.node, orgContactsNode);
      assert.equal(gunNode.get.mock.calls[0].arguments[0], 'org-3dvr-demo');
      assert.equal(orgGetter.mock.calls[0].arguments[0], 'contacts');

      const publicResult = resolveSpaceNode({
        space: 'public-demo',
        gun: gunNode,
      });
      assert.equal(publicGetter.mock.calls.length >= 1, true);
      assert.equal(publicResult.node, publicContactsNode);
      assert.equal(gunNode.get.mock.calls[1].arguments[0], 'contacts-public');
    });
  });
});
