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
