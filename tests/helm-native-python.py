"""Exercise native completion, thread isolation, and fail-closed interrupted turns."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('helm_native', Path(__file__).resolve().parents[1] / 'src/openclaw/native.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class Events:
    def __init__(self, events):
        self.events = iter(events)

    def send(self, method, params):
        return 1

    def read(self):
        return next(self.events)


def event(method, **params):
    return {'method': method, 'params': {'threadId': 'thread-one', **params}}


class NativeTests(unittest.TestCase):
    def test_final_receipt_requires_completed_turn_and_authoritative_item(self):
        prefix = [{'id': 1, 'result': {'turn': {'id': 'turn-one'}}},
                  event('item/agentMessage/delta', itemId='message-one', delta='Partial'),
                  event('item/completed', item={'type': 'agentMessage', 'id': 'message-one', 'text': 'Final', 'phase': 'final_answer'})]
        deltas = []
        reply = native.run_turn(Events(prefix + [event('turn/completed', turn={'id': 'turn-one', 'status': 'completed'})]),
                                'thread-one', {'message': 'Hello'}, deltas.append)
        self.assertEqual(reply, 'Final')
        self.assertEqual(deltas, ['Partial'])
        with self.assertRaises(RuntimeError):
            native.run_turn(Events(prefix + [event('turn/completed', turn={'id': 'turn-one', 'status': 'failed'})]),
                            'thread-one', {'message': 'Hello'}, lambda _: None)
        with self.assertRaises(StopIteration):
            native.run_turn(Events(prefix), 'thread-one', {'message': 'Hello'}, lambda _: None)

    def test_unrelated_thread_events_and_tools_cannot_complete_the_turn(self):
        with self.assertRaises(StopIteration):
            native.run_turn(Events([{'id': 1, 'result': {'turn': {'id': 'one'}}},
                event('turn/completed', threadId='someone-else', turn={'id': 'one', 'status': 'completed'})]),
                'thread-one', {'message': 'Hello'}, lambda _: None)
        with self.assertRaises(RuntimeError):
            native.run_turn(Events([event('item/started', item={'type': 'mcpToolCall'})]),
                            'thread-one', {'message': 'Hello'}, lambda _: None)

    def test_reply_limits_and_missing_final_message_fail_closed(self):
        with patch.object(native, 'MAX_REPLY', 3), self.assertRaises(ValueError):
            native.run_turn(Events([event('item/agentMessage/delta', itemId='one', delta='large')]),
                            'thread-one', {'message': 'Hello'}, lambda _: None)
        with self.assertRaises(ValueError):
            native.run_turn(Events([{'id': 1, 'result': {'turn': {'id': 'one'}}},
                event('turn/completed', turn={'id': 'one', 'status': 'completed'})]),
                'thread-one', {'message': 'Hello'}, lambda _: None)

    def test_thread_resume_is_scoped_to_server_session_and_pending_turn_stays_blocked(self):
        calls = []
        class Client:
            def __init__(self, *_args):
                pass
            def rpc(self, method, params):
                calls.append((method, params))
                return {'thread': {'id': params.get('threadId', 'new-' + str(len(calls)))}}
            def send(self, *_args):
                pass
            def close(self):
                pass
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'auth.json').write_text(json.dumps({'auth_mode': 'chatgpt'}))
            with patch.object(native, 'HOME', home), patch.object(native, 'STATE', home / 'helm'), \
                 patch.object(native, 'find_binary', return_value='/existing/codex'), patch.object(native, 'Client', Client), \
                 patch.object(native, 'run_turn', return_value='Done') as run:
                a = {'action': 'chat', 'session': 'owner-one-session-A', 'message': 'Hello'}
                b = {**a, 'session': 'owner-one-session-B'}
                self.assertTrue(native.main(a)['ok'])
                self.assertTrue(native.main(a)['ok'])
                self.assertTrue(native.main(b)['ok'])
                starts = [p for method, p in calls if method == 'thread/start']
                resumes = [p for method, p in calls if method == 'thread/resume']
                self.assertEqual(len(starts), 2)
                self.assertEqual(len(resumes), 1)
                self.assertEqual(starts[0]['sandbox'], 'read-only')
                # Once dispatch might have happened, continuation cannot silently retry.
                run.side_effect = RuntimeError('interrupted')
                with self.assertRaises(RuntimeError):
                    native.main(a)
                count = run.call_count
                result = native.main(a)
                self.assertFalse(result['ok'])
                self.assertIn('uncertain', result['error'])
                self.assertEqual(run.call_count, count)
                run.side_effect = None
                self.assertTrue(native.main(b)['ok'])

    def test_mcp_overrides_use_cli_dotted_names_and_do_not_change_the_saved_config(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            source = '[mcp_servers.local_tools]\ncommand = "existing-tool"\n'
            (home / 'config.toml').write_text(source)
            with patch.object(native, 'HOME', home):
                args = native.command('/existing/codex')
                self.assertIn('mcp_servers.local_tools.enabled=false', args)
                self.assertIn('shell_tool', args)
                self.assertEqual((home / 'config.toml').read_text(), source)

    def test_operator_tasks_enable_only_web_search_and_preserve_chat_defaults(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(native, 'HOME', Path(directory)):
                self.assertIn('web_search="disabled"', native.command('/codex'))
                task = native.command('/codex', True)
                self.assertIn('web_search="live"', task)
                self.assertIn('shell_tool', task)
        for kind in ['commandExecution', 'mcpToolCall', 'dynamicToolCall', 'fileChange']:
            with self.assertRaises(RuntimeError):
                native.run_turn(Events([event('item/started', item={'type': kind})]),
                                'thread-one', {'message': 'test', 'taskMode': True}, lambda _: None)

    def test_installed_binary_remains_discoverable_without_a_running_gateway(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / 'codex'
            executable.write_text('#!/bin/sh\n')
            executable.chmod(0o700)
            def installed(path, pattern):
                return [] if str(path) == '/proc' else [executable]
            with patch.object(native.shutil, 'which', return_value=None), \
                 patch.object(native.Path, 'glob', autospec=True, side_effect=installed):
                self.assertEqual(native.find_binary(), str(executable))

    def test_tools_enabled_matrix(self):
        self.assertTrue(native.tools_enabled({'engine': 'codex', 'toolsEnabled': True}))
        self.assertFalse(native.tools_enabled({'engine': 'codex'}))
        self.assertFalse(native.tools_enabled({'engine': 'codex', 'toolsEnabled': False}))
        self.assertFalse(native.tools_enabled({'engine': 'codex-backup', 'toolsEnabled': True}))
        self.assertFalse(native.tools_enabled({'engine': 'codex', 'toolsEnabled': True, 'taskMode': True}))

    def test_agent_posture_enables_shell_and_search_but_never_mcp(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'config.toml').write_text('[mcp_servers.local_tools]\ncommand = "existing-tool"\n')
            with patch.object(native, 'HOME', home):
                args = native.command('/existing/codex', tools=True)
                self.assertNotIn('--disable', args)
                self.assertNotIn('shell_tool', args)
                self.assertIn('web_search="live"', args)
                self.assertIn('mcp_servers.local_tools.enabled=false', args)
                # Chat and Operator task postures keep the shell tool disabled.
                self.assertIn('shell_tool', native.command('/existing/codex'))
                self.assertIn('shell_tool', native.command('/existing/codex', True))

    def test_agent_turn_allows_tool_items_and_uses_workspace_write_policy(self):
        class Recording(Events):
            def __init__(self, events):
                super().__init__(events)
                self.sent = []
            def send(self, method, params):
                self.sent.append((method, params))
                return 1
        request = {'message': 'Do the thing', 'toolsEnabled': True}
        client = Recording([{'id': 1, 'result': {'turn': {'id': 'turn-one'}}},
                  event('item/started', item={'type': 'commandExecution'}),
                  event('item/started', item={'type': 'fileChange'}),
                  event('item/started', item={'type': 'dynamicToolCall'}),
                  event('item/completed', item={'type': 'agentMessage', 'id': 'm1', 'text': 'Done', 'phase': 'final_answer'}),
                  event('turn/completed', turn={'id': 'turn-one', 'status': 'completed'})])
        reply = native.run_turn(client, 'thread-one', request, lambda _: None)
        self.assertEqual(reply, 'Done')
        method, params = client.sent[0]
        self.assertEqual(method, 'turn/start')
        self.assertEqual(params['sandboxPolicy'], {'type': 'workspaceWrite', 'networkAccess': True})
        self.assertEqual(params['approvalPolicy'], 'never')
        # MCP stays refused even in agent posture.
        with self.assertRaises(RuntimeError):
            native.run_turn(Events([event('item/started', item={'type': 'mcpToolCall'})]),
                            'thread-one', request, lambda _: None)
        # Without the handler's explicit flag the same tool item fails closed.
        with self.assertRaises(RuntimeError):
            native.run_turn(Events([event('item/started', item={'type': 'commandExecution'})]),
                            'thread-one', {'message': 'Hi'}, lambda _: None)

    def test_agent_posture_uses_worktree_and_posture_change_starts_fresh_thread(self):
        calls = []
        class Client:
            def __init__(self, args, cwd, _deadline):
                self.args = args
                calls.append(('init', args, cwd))
            def rpc(self, method, params):
                calls.append((method, params))
                return {'thread': {'id': params.get('threadId', 'thread-' + str(len(calls)))}}
            def send(self, *_args):
                pass
            def close(self):
                pass
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'auth.json').write_text(json.dumps({'auth_mode': 'chatgpt'}))
            state = home / 'helm'
            worktree = state / 'portal-worktree'
            (worktree / '.git').mkdir(parents=True)
            with patch.object(native, 'HOME', home), patch.object(native, 'STATE', state), \
                 patch.object(native, 'find_binary', return_value='/existing/codex'), patch.object(native, 'Client', Client), \
                 patch.object(native, 'run_turn', return_value='Done'):
                chat = {'action': 'chat', 'session': 'owner-agent-A', 'message': 'Hello'}
                agent = {**chat, 'toolsEnabled': True}
                self.assertTrue(native.main(chat)['ok'])
                self.assertTrue(native.main(agent)['ok'])
                self.assertTrue(native.main(agent)['ok'])
                self.assertTrue(native.main(chat)['ok'])
                starts = [entry[1] for entry in calls if entry[0] == 'thread/start']
                resumes = [entry[1] for entry in calls if entry[0] == 'thread/resume']
                # Chat start, agent start (posture flip), agent resume, chat start (flip back).
                self.assertEqual(len(starts), 3)
                self.assertEqual(len(resumes), 1)
                self.assertEqual(starts[0]['sandbox'], 'read-only')
                self.assertNotEqual(starts[0]['cwd'], str(worktree))
                self.assertEqual(starts[1]['sandbox'], 'workspace-write')
                self.assertEqual(starts[1]['cwd'], str(worktree))
                self.assertIn('worktree', starts[1]['developerInstructions'])
                inits = [entry for entry in calls if entry[0] == 'init']
                self.assertIn('shell_tool', inits[0][1])
                self.assertNotIn('shell_tool', inits[1][1])
                self.assertEqual(inits[1][2], str(worktree))

    def test_agent_posture_without_worktree_fails_closed(self):
        class Client:
            def __init__(self, *_args):
                raise AssertionError('Client must not start')
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'auth.json').write_text(json.dumps({'auth_mode': 'chatgpt'}))
            with patch.object(native, 'HOME', home), patch.object(native, 'STATE', home / 'helm'), \
                 patch.object(native, 'find_binary', return_value='/existing/codex'), patch.object(native, 'Client', Client):
                result = native.main({'action': 'chat', 'session': 'owner-agent-B', 'message': 'Hi', 'toolsEnabled': True})
                self.assertFalse(result['ok'])
                self.assertIn('worktree', result['error'])

    def test_status_reports_agent_profile_only_for_flagged_owner_engine(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'auth.json').write_text(json.dumps({'auth_mode': 'chatgpt'}))
            with patch.object(native, 'HOME', home), patch.object(native, 'STATE', home / 'helm'), \
                 patch.object(native, 'find_binary', return_value='/existing/codex'):
                self.assertEqual(native.main({'action': 'status', 'engine': 'codex', 'toolsEnabled': True})['profile'], 'native-agent')
                self.assertEqual(native.main({'action': 'status', 'engine': 'codex'})['profile'], 'native-chat')

    def test_status_never_starts_inference_and_expiry_prevents_dispatch(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'auth.json').write_text('{"auth_mode":"chatgpt"}')
            with patch.object(native, 'HOME', home), patch.object(native, 'STATE', home / 'helm'), \
                 patch.object(native, 'find_binary', return_value='/existing/codex'), patch.object(native, 'Client') as client:
                self.assertTrue(native.main({'action': 'status'})['chatEnabled'])
                self.assertTrue(native.main({'action': 'chat', 'expiresAt': 1})['stale'])
                client.assert_not_called()


if __name__ == '__main__':
    unittest.main()
